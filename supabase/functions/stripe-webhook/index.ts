// Star Gap — Edge Function "stripe-webhook"
// =============================================================================
// Reçoit les events Stripe (checkout.session.completed, subscription updated/
// deleted) et met à jour profiles.plan en conséquence.
//
// ⚠️  Déployée SANS vérification JWT (--no-verify-jwt) car les requêtes
// viennent de Stripe, pas d'un browser authentifié. La sécurité repose
// sur la vérification de la signature Stripe (STRIPE_WEBHOOK_SECRET).
//
// Utilise SUPABASE_SERVICE_ROLE_KEY (pas anon key) pour bypasser RLS et
// pouvoir update n'importe quel profile via user_id.
//
// Secrets requis :
//   STRIPE_SECRET_KEY          — pour initialiser le client Stripe
//   STRIPE_WEBHOOK_SECRET      — whsec_xxx pour vérifier la signature
//   SB_SERVICE_ROLE_KEY        — pour update profiles sans RLS (pas SUPABASE_ car réservé par la CLI)
//   STRIPE_PRICE_PRO           — mensuel Pro    → plan (mapping price → plan)
//   STRIPE_PRICE_AGENCY        — mensuel Agency → plan
//   STRIPE_PRICE_PRO_ANNUAL    — annuel Pro     → plan
//   STRIPE_PRICE_AGENCY_ANNUAL — annuel Agency  → plan
//
// Politique de réponse HTTP (importante pour la fiabilité) :
//   - Échec d'écriture DB (potentiellement transitoire) → 500 pour que Stripe
//     RETENTE. Sinon un paiement encaissé peut ne jamais activer le plan.
//   - Cas où un retry ne servirait à rien (metadata manquante, price inconnu,
//     event non géré) → 200 + log, pour ne pas boucler puis désactiver l'endpoint.
// =============================================================================

import { createClient } from 'jsr:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@17';

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')!;
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;
  const serviceRoleKey = Deno.env.get('SB_SERVICE_ROLE_KEY')!;
  if (!stripeKey || !webhookSecret || !serviceRoleKey) {
    console.error('[stripe-webhook] missing secrets');
    return new Response('Server misconfigured', { status: 500 });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: '2024-12-18.acacia' });

  // Client Supabase service_role pour bypass RLS.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    serviceRoleKey,
  );

  // Vérification de la signature Stripe.
  const sig = req.headers.get('stripe-signature');
  if (!sig) return new Response('Missing signature', { status: 400 });

  let event: Stripe.Event;
  try {
    const body = await req.text();
    event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret);
  } catch (err) {
    console.error('[stripe-webhook] signature verification failed', err);
    return new Response('Invalid signature', { status: 400 });
  }

  console.log('[stripe-webhook] event', event.type, event.id);

  // Mapping price_id → plan. Inclut les prix mensuels ET annuels ; les
  // secrets non configurés sont ignorés (sinon un price_id vide "" mapperait
  // par erreur vers un plan).
  const priceToplan = new Map<string, string>();
  for (const [envName, plan] of [
    ['STRIPE_PRICE_PRO', 'pro'],
    ['STRIPE_PRICE_PRO_ANNUAL', 'pro'],
    ['STRIPE_PRICE_AGENCY', 'agency'],
    ['STRIPE_PRICE_AGENCY_ANNUAL', 'agency'],
  ] as const) {
    const id = Deno.env.get(envName);
    if (id) priceToplan.set(id, plan);
  }

  try {
    switch (event.type) {
      // =====================================================================
      // L'utilisateur vient de payer → upgrade du plan.
      // =====================================================================
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.supabase_user_id;
        const plan = session.metadata?.plan;
        if (!userId || !plan) {
          console.warn('[stripe-webhook] missing metadata on checkout session', session.id);
          break;
        }
        const { error } = await supabase
          .from('profiles')
          .update({
            plan,
            stripe_customer_id: session.customer as string,
            stripe_subscription_id: session.subscription as string,
          })
          .eq('id', userId);
        // Erreur DB → throw → 500 → Stripe retente (le paiement doit activer le plan).
        if (error) throw new Error(`update profile failed: ${error.message}`);
        console.log('[stripe-webhook] plan set to', plan, 'for user', userId);
        break;
      }

      // =====================================================================
      // Subscription changée (upgrade / downgrade via portal ou API).
      // =====================================================================
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.supabase_user_id;
        if (!userId) {
          console.warn('[stripe-webhook] no supabase_user_id in sub metadata', sub.id);
          break; // 200 : un retry ne réparera pas des metadata absentes
        }

        // Statut de l'abonnement : un abo suspendu ne doit pas garder un plan payant.
        // - canceled / unpaid → abo terminé ou impayé définitif → repasse Free.
        // - past_due → on garde l'accès le temps du dunning Stripe (grâce).
        // - active / trialing → plan déduit du price.
        if (sub.status === 'canceled' || sub.status === 'unpaid') {
          const { error } = await supabase
            .from('profiles')
            .update({ plan: 'free', stripe_subscription_id: null })
            .eq('id', userId);
          if (error) throw new Error(`downgrade (status ${sub.status}) failed: ${error.message}`);
          console.log('[stripe-webhook] status', sub.status, '→ free for', userId);
          break;
        }

        // Déduit le plan depuis le price du premier item.
        const priceId = sub.items.data[0]?.price?.id ?? '';
        const newPlan = priceToplan.get(priceId) ?? null;
        if (!newPlan) {
          console.warn('[stripe-webhook] unknown price_id', priceId, 'on sub', sub.id);
          break; // 200 : price non mappé (secret manquant ?) — un retry ne changera rien
        }
        const { error } = await supabase
          .from('profiles')
          .update({ plan: newPlan })
          .eq('id', userId);
        if (error) throw new Error(`update plan failed: ${error.message}`);
        console.log('[stripe-webhook] plan updated to', newPlan, 'for', userId);
        break;
      }

      // =====================================================================
      // Subscription annulée → downgrade vers Free.
      // =====================================================================
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.supabase_user_id;
        if (!userId) {
          console.warn('[stripe-webhook] no supabase_user_id in sub metadata', sub.id);
          break;
        }
        const { error } = await supabase
          .from('profiles')
          .update({
            plan: 'free',
            stripe_subscription_id: null,
          })
          .eq('id', userId);
        if (error) throw new Error(`downgrade failed: ${error.message}`);
        console.log('[stripe-webhook] downgraded to free for', userId);
        break;
      }

      default:
        console.log('[stripe-webhook] unhandled event type', event.type);
    }
  } catch (e) {
    // Erreur DB ou handler → 500 : Stripe retentera l'event (idempotent côté
    // profiles, donc rejouer est sûr). C'est le comportement voulu #3.
    console.error('[stripe-webhook] handler error', e);
    return new Response('Internal error', { status: 500 });
  }

  // Succès (ou cas où un retry serait inutile, déjà loggés) → 200.
  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
