#!/usr/bin/env node
// Smoke-test billing Star Gap — vérifie toute la chaîne checkout SANS payer.
// Se connecte avec un compte, appelle l'Edge Function create-checkout-session,
// et détecte le mode Stripe (LIVE vs TEST) depuis l'URL de session retournée.
//
// Usage :
//   node scripts/stripe-smoke-test.mjs <email> <password> [pro|agency] [monthly|annual]
//
// Exemple :
//   node scripts/stripe-smoke-test.mjs moi@exemple.com 'monMotDePasse' pro monthly
//
// Ne crée AUCUN paiement : il génère juste une session de checkout. Il suffit
// d'ouvrir l'URL pour vérifier le prix affiché, puis de la fermer.

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// --- Lit .env (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) -------------------
function readEnv() {
  const out = {};
  try {
    for (const line of readFileSync(join(root, '.env'), 'utf8').split('\n')) {
      const i = line.indexOf('=');
      if (i < 0 || line.trim().startsWith('#')) continue;
      out[line.slice(0, i).trim()] = line
        .slice(i + 1)
        .trim()
        .replace(/^["']|["']$/g, '');
    }
  } catch {
    console.error('❌ Impossible de lire .env à la racine du projet.');
    process.exit(1);
  }
  return out;
}

const env = readEnv();
const SUPABASE_URL = env.VITE_SUPABASE_URL;
const ANON = env.VITE_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !ANON) {
  console.error('❌ VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY manquants dans .env.');
  process.exit(1);
}

const [, , email, password, plan = 'pro', billing = 'monthly'] = process.argv;
if (!email || !password) {
  console.error(
    'Usage: node scripts/stripe-smoke-test.mjs <email> <password> [pro|agency] [monthly|annual]',
  );
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, ANON);

console.log('→ Connexion…');
const { data: auth, error: aerr } = await sb.auth.signInWithPassword({ email, password });
if (aerr) {
  console.error('❌ Connexion échouée :', aerr.message);
  process.exit(1);
}
console.log('✓ Connecté :', auth.user?.email);

console.log(`→ Appel create-checkout-session (plan=${plan}, billing=${billing})…`);
const { data, error } = await sb.functions.invoke('create-checkout-session', {
  body: { plan, billing },
});

if (error) {
  let detail = error.message ?? JSON.stringify(error);
  // supabase-js masque le corps ; on le récupère via error.context (Response).
  try {
    const ctx = error.context;
    if (ctx && typeof ctx.text === 'function') {
      const body = await ctx.text();
      if (body) detail += `\n   ↳ statut ${ctx.status} · réponse: ${body}`;
    }
  } catch {
    /* ignore */
  }
  console.error('❌ Erreur fonction :', detail);
  await sb.auth.signOut();
  process.exit(1);
}

const url = data?.url;
if (!url) {
  console.error('❌ Pas d\'URL retournée. Réponse :', JSON.stringify(data));
  await sb.auth.signOut();
  process.exit(1);
}

const mode = url.includes('cs_live_')
  ? 'LIVE ✅ (vrais paiements)'
  : url.includes('cs_test_')
    ? 'TEST ⚠️ (mode test — à basculer en live avant lancement)'
    : 'inconnu (URL inattendue)';

console.log('\n──────────── RÉSULTAT ────────────');
console.log('Mode Stripe détecté :', mode);
console.log('URL de checkout     :', url);
console.log('──────────────────────────────────');
console.log(
  '\n→ Ouvre cette URL dans ton navigateur : vérifie le nom du produit (Star Gap ' +
    (plan === 'agency' ? 'Agency' : 'Pro') +
    ') et le prix. Puis ferme l\'onglet — aucun paiement n\'a été créé.',
);

await sb.auth.signOut();
