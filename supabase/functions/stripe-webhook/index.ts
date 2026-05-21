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
//   STRIPE_SECRET_KEY         — pour initialiser le client Stripe
//   STRIPE_WEBHOOK_SECRET     — whsec_xxx pour vérifier la signature
//   SUPABASE_SERVICE_ROLE_KEY — pour update profiles sans RLS
//   STRIPE_PRICE_PRO          — pour mapper price → plan
//   STRIPE_PRICE_AGENCY       — idem
// =============================================================================

import { createClient } from 'jsr:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@17';

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')!;
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
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

  // Mapping price_id → plan.
  const pricePro = Deno.env.get('STRIPE_PRICE_PRO') ?? '';
  const priceAgency = Deno.env.get('STRIPE_PRICE_AGENCY') ?? '';
  const priceToplan = new Map<string, string>([
    [pricePro, 'pro'],
    [priceAgency, 'agency'],
  ]);

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
        if (error) console.error('[stripe-webhook] update profile failed', error);
        else console.log('[stripe-webhook] plan set to', plan, 'for user', userId);
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
          break;
        }
        // Déduit le plan depuis le price du premier item.
        const priceId = sub.items.data[0]?.price?.id ?? '';
        const newPlan = priceToplan.get(priceId) ?? null;
        if (newPlan) {
          const { error } = await supabase
            .from('profiles')
            .update({ plan: newPlan })
            .eq('id', userId);
          if (error) console.error('[stripe-webhook] update plan failed', error);
          else console.log('[stripe-webhook] plan updated to', newPlan, 'for', userId);
        } else {
          console.warn('[stripe-webhook] unknown price_id', priceId, 'on sub', sub.id);
        }
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
        if (error) console.error('[stripe-webhook] downgrade failed', error);
        else console.log('[stripe-webhook] downgraded to free for', userId);
        break;
      }

      default:
        console.log('[stripe-webhook] unhandled event type', event.type);
    }
  } catch (e) {
    console.error('[stripe-webhook] handler error', e);
    return new Response('Internal error', { status: 500 });
  }

  // Toujours répondre 200 à Stripe — sinon il retry.
  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
