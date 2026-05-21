// Star Gap — Edge Function "create-portal-session"
// =============================================================================
// Crée une session Stripe Customer Portal pour qu'un abonné puisse gérer
// son abonnement (changer de plan, annuler, mettre à jour la CB).
// Retourne l'URL Stripe portal.
//
// Secrets requis :
//   STRIPE_SECRET_KEY — sk_test_xxx ou sk_live_xxx
//   APP_URL           — URL de retour après le portal
// =============================================================================

import { createClient } from 'jsr:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@17';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 1) Auth.
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing Authorization' }, 401);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) return json({ error: 'Invalid auth' }, 401);

    // 2) Récupère le stripe_customer_id depuis le profile.
    const profileQ = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .maybeSingle();
    const customerId = (profileQ.data?.stripe_customer_id as string | null) ?? null;
    if (!customerId) {
      return json({ error: 'no_subscription', message: 'Aucun abonnement Stripe actif.' }, 400);
    }

    // 3) Stripe Portal Session.
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    const appUrl = Deno.env.get('APP_URL');
    if (!stripeKey || !appUrl) return json({ error: 'Stripe secrets missing' }, 500);

    const stripe = new Stripe(stripeKey, { apiVersion: '2024-12-18.acacia' });
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${appUrl}/#/settings`,
    });

    return json({ url: portalSession.url });
  } catch (e) {
    console.error('[create-portal-session] error', e);
    return json({ error: e instanceof Error ? e.message : 'unknown' }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
