// CORS headers communs aux Edge Functions Star Gap.
// L'app est servie depuis GitHub Pages (origine fixe) + dev local — on
// reste permissif sur Allow-Origin et on rely sur l'auth JWT pour la
// sécurité réelle.

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
