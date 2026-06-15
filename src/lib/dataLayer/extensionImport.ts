import { supabase } from '@/lib/supabase';
import type { SupabaseImportSession, ImportSessionStatus } from '@/lib/supabaseTypes';

// ---------------------------------------------------------------------------
// Helpers app pour l'import via extension Chrome.
//
// Flow :
//   1. createImportSession(domain) → crée un token UUID en DB (status=pending,
//      expire dans 10 min), retourne le token.
//   2. App ouvre un onglet Ahrefs avec ?starGapToken=<token> dans l'URL.
//   3. Extension détecte le token, capture le CSV au clic Export de l'user,
//      POST à l'Edge Function extension-import avec ce token.
//   4. App poll getImportSession(token) pour voir quand status passe à
//      'completed' (→ redirect vers le project_id retourné) ou 'failed'.
// ---------------------------------------------------------------------------

export interface CreateImportSessionInput {
  domain: string;
  source?: string; // 'ahrefs' par défaut
  // Si fourni → mode 'append' : on ajoute le domaine à ce projet existant
  // au lieu de créer un nouveau projet.
  existingProjectId?: string;
}

export interface CreateImportSessionResult {
  token: string;
  expiresAt: string;
}

export async function createImportSession(
  input: CreateImportSessionInput,
): Promise<CreateImportSessionResult> {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    throw new Error('Session Supabase introuvable — reconnecte-toi.');
  }

  const { data, error } = await supabase
    .from('import_sessions')
    .insert({
      user_id: userData.user.id,
      domain: input.domain,
      source: input.source ?? 'ahrefs',
      existing_project_id: input.existingProjectId ?? null,
      status: 'pending',
    })
    .select('token, expires_at')
    .single();

  if (error || !data) {
    throw new Error(`Création session import : ${error?.message ?? 'inconnu'}`);
  }

  return {
    token: data.token as string,
    expiresAt: data.expires_at as string,
  };
}

// Lecture du statut d'une session (utilisé en polling au commit 7).
export async function getImportSession(
  token: string,
): Promise<SupabaseImportSession | null> {
  const { data, error } = await supabase
    .from('import_sessions')
    .select('*')
    .eq('token', token)
    .maybeSingle();
  if (error) {
    console.error('[extensionImport] getImportSession error', error);
    return null;
  }
  return (data as SupabaseImportSession) ?? null;
}

// Annule une session pending (si l'user ferme la modale avant la fin).
export async function cancelImportSession(token: string): Promise<void> {
  await supabase
    .from('import_sessions')
    .update({ status: 'expired' as ImportSessionStatus })
    .eq('token', token)
    .eq('status', 'pending');
}

// ---------------------------------------------------------------------------
// Sources d'import supportées. Ajout d'une nouvelle source = ajout d'un cas
// dans buildImportUrl + un parser côté Edge Function.
// ---------------------------------------------------------------------------

export type ImportSource = 'ahrefs' | 'semrush';

export const IMPORT_SOURCES: { value: ImportSource; label: string }[] = [
  { value: 'ahrefs', label: 'Ahrefs' },
  { value: 'semrush', label: 'Semrush' },
];

export function buildImportUrl(
  source: ImportSource,
  domain: string,
  token: string,
): string {
  if (source === 'semrush') return buildSemrushImportUrl(domain, token);
  return buildAhrefsImportUrl(domain, token);
}

// URL Ahrefs Organic Keywords avec le token Star Gap en param.
export function buildAhrefsImportUrl(domain: string, token: string): string {
  const target = encodeURIComponent(domain);
  return (
    `https://app.ahrefs.com/site-explorer/organic-keywords` +
    `?target=${target}` +
    `&country=allByLocation` +
    `&mode=subdomains` +
    `&limit=50` +
    `&starGapToken=${encodeURIComponent(token)}`
  );
}

// URL Semrush Organic Research (Positions) avec le token Star Gap en param.
export function buildSemrushImportUrl(domain: string, token: string): string {
  const q = encodeURIComponent(domain);
  return (
    `https://www.semrush.com/analytics/organic/positions/` +
    `?db=us` +
    `&q=${q}` +
    `&searchType=domain` +
    `&starGapToken=${encodeURIComponent(token)}`
  );
}
