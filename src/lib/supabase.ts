import { createClient } from '@supabase/supabase-js';
import type { Database } from './supabaseTypes';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
  // On ne throw pas pour ne pas casser le dev local avant que l'utilisateur
  // ait rempli son .env. Un warn suffit pour signaler.
  console.warn(
    '[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY non configurés. ' +
      'L\'auth ne fonctionnera pas. Copie .env.example vers .env et renseigne ' +
      'les credentials du projet Supabase.',
  );
}

export const supabase = createClient<Database>(
  url ?? 'https://placeholder.supabase.co',
  anonKey ?? 'placeholder',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);

export const isSupabaseConfigured = (): boolean => {
  return Boolean(
    url &&
      anonKey &&
      !url.includes('placeholder') &&
      !anonKey.includes('placeholder'),
  );
};
