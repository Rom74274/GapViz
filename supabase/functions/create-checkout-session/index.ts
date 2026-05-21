// Star Gap — Edge Function "create-checkout-session"
// =============================================================================
// Crée une Stripe Checkout Session pour un upgrade de plan (Pro ou Agency).
// Appelée depuis le browser (JWT requis). Retourne l'URL Stripe vers
// laquelle le client redirige l'utilisateur.
//
// Secrets requis :
//   STRIPE_SECRET_KEY   — sk_test_xxx ou sk_live_xxx
//   STRIPE_PRICE_PRO    — price_xxx (19€/mois)
//   STRIPE_PRICE_AGENCY — price_xxx (79€/mois)
//   APP_URL             — URL de l'app (ex: https://rom74274.github.io/GapViz)
// =============================================================================

import { createClient } from 'jsr:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@17';
import { corsHeaders } from '../_shared/cors.ts';

const PLAN_PRICE_MAP: Record<string, string> = {
  pro: 'STRIPE_PRICE_PRO',
  agency: 'STRIPE_PRICE_AGENCY',
};

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

    // 2) Body.
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const requestedPlan = body?.plan as string | undefined;
    if (!requestedPlan || !PLAN_PRICE_MAP[requestedPlan]) {
      return json({ error: 'plan must be "pro" or "agency"' }, 400);
    }

    // 3) Env.
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    const priceId = Deno.env.get(PLAN_PRICE_MAP[requestedPlan]!);
    const appUrl = Deno.env.get('APP_URL');
    if (!stripeKey || !priceId || !appUrl) {
      return json({ error: 'Stripe secrets not configured' }, 500);
    }

    const stripe = new Stripe(stripeKey, { apiVersion: '2024-12-18.acacia' });

    // 4) Stripe Customer — réutilise l'existant ou en crée un nouveau.
    const profileQ = await supabase
      .from('profiles')
      .select('stripe_customer_id, email')
      .eq('id', user.id)
      .maybeSingle();
    let customerId: string | undefined =
      (profileQ.data?.stripe_customer_id as string | null) ?? undefined;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? (profileQ.data?.email as string | null) ?? undefined,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
      // Stocke l'ID customer dans le profile pour le réutiliser.
      await supabase
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', user.id);
    }

    // 5) Checkout Session.
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/#/settings?checkout=success`,
      cancel_url: `${appUrl}/#/pricing?checkout=cancel`,
      metadata: {
        supabase_user_id: user.id,
        plan: requestedPlan,
      },
      subscription_data: {
        metadata: {
          supabase_user_id: user.id,
          plan: requestedPlan,
        },
      },
    });

    return json({ url: session.url });
  } catch (e) {
    console.error('[create-checkout-session] error', e);
    return json(
      { error: e instanceof Error ? e.message : 'unknown' },
      500,
    );
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
