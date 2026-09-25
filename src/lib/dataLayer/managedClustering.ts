import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/lib/authStore';
import { fetchProjectDetailFromSupabase } from './read';
import { syncProjectToDexie } from './syncToDexie';

// ---------------------------------------------------------------------------
// Clustering managé via Edge Function Supabase ("cluster"). Utilisé quand le
// user n'a pas de BYOK : la fonction edge applique la gate plan + appelle
// Claude avec la clé centrale Star Gap + incrémente profiles.clusterings_used.
//
// Côté client, on se contente d'invoquer + de rafraîchir le cache Dexie
// (re-fetch via le pipeline write-through) + de recharger le profile pour
// que le compteur affiché soit à jour.
// ---------------------------------------------------------------------------

export interface ManagedClusterResult {
  // Forme compatible avec ClusterRunResult côté browser pour l'affichage UI.
  fromCache: boolean;
  clusterCount: number;
  unmatchedCount: number;
  unclusteredClusterId: string | null;
  uniqueKeywordCount: number;
  persistedAssignments: number;
  totalChunks: number;
  usage: {
    inputTokens: number;
    outputTokens: number;
    usd: number;
  } | null;
  // Spécifique au mode managé :
  model: string;
  clusteringsUsed: number;
  clusteringsLimit: number | null;
}

export interface ManagedClusterError {
  code: 'quota_exceeded' | 'no_keywords' | 'no_clusters' | 'internal';
  message: string;
  used?: number;
  limit?: number;
  plan?: string;
}

export class ManagedClusteringError extends Error {
  code: ManagedClusterError['code'];
  payload: ManagedClusterError;
  constructor(payload: ManagedClusterError) {
    super(payload.message);
    this.name = 'ManagedClusteringError';
    this.code = payload.code;
    this.payload = payload;
  }
}

// Lit intégralement un corps de réponse en flux (texte).
async function readStreamText(resp: Response): Promise<string> {
  if (!resp.body) return resp.text();
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let out = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
  }
  out += decoder.decode();
  return out;
}

type EdgeErrorBody = {
  error?: string;
  code?: string;
  message?: string;
  used?: number;
  limit?: number;
  plan?: string;
};

export async function runManagedClustering(projectId: string): Promise<ManagedClusterResult> {
  // La fonction cluster répond en FLUX (battements pendant le travail long +
  // dernière ligne = résultat), donc on ne peut pas utiliser functions.invoke
  // (qui bufferise et couperait à l'idle timeout). On fait un fetch manuel et on
  // lit le flux jusqu'au bout.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) {
    throw new ManagedClusteringError({ code: 'internal', message: 'Session expirée — reconnecte-toi.' });
  }
  const baseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

  let resp: Response;
  try {
    resp = await fetch(`${baseUrl}/functions/v1/cluster`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        apikey: anonKey,
      },
      body: JSON.stringify({ projectId }),
    });
  } catch (e) {
    throw new ManagedClusteringError({
      code: 'internal',
      message: e instanceof Error ? e.message : 'Erreur réseau',
    });
  }

  // Erreurs "rapides" (avant le flux) : status != 200 + body JSON
  // (quota_exceeded, no_keywords, auth…).
  if (!resp.ok) {
    let body: EdgeErrorBody = {};
    try {
      body = (await resp.json()) as EdgeErrorBody;
    } catch {
      /* ignore */
    }
    const code = (body.code ?? body.error ?? 'internal') as ManagedClusterError['code'];
    throw new ManagedClusteringError({
      code,
      message: body.message ?? `Erreur (${resp.status})`,
      used: body.used,
      limit: body.limit,
      plan: body.plan,
    });
  }

  // Flux : on ignore les battements (lignes vides) et on parse la DERNIÈRE ligne.
  const raw = await readStreamText(resp);
  const lines = raw.split('\n').map((s) => s.trim()).filter(Boolean);
  const last = lines[lines.length - 1];
  if (!last) {
    throw new ManagedClusteringError({ code: 'internal', message: 'Réponse vide de la fonction cluster' });
  }
  let payload: EdgeErrorBody & { ok?: boolean; [k: string]: unknown };
  try {
    payload = JSON.parse(last);
  } catch {
    throw new ManagedClusteringError({ code: 'internal', message: 'Réponse illisible de la fonction cluster' });
  }

  if (payload.ok !== true) {
    const code = (payload.code ?? payload.error ?? 'internal') as ManagedClusterError['code'];
    throw new ManagedClusteringError({
      code,
      message: payload.message ?? 'Erreur clustering',
      used: payload.used,
      limit: payload.limit,
      plan: payload.plan,
    });
  }

  const result = payload as unknown as {
    ok: true;
    uniqueKeywordCount: number;
    clusterCount: number;
    persistedAssignments: number;
    unmatchedCount: number;
    unclusteredClusterId: string | null;
    totalChunks: number;
    model: string;
    usage: { inputTokens: number; outputTokens: number };
    clusteringsUsed: number;
    clusteringsLimit: number | null;
  };

  // Re-sync Dexie cache depuis Supabase (les clusters viennent d'être écrits
  // côté serveur, le sync write-through au mount n'a pas encore eu lieu).
  const detail = await fetchProjectDetailFromSupabase(projectId);
  if (detail.ok) {
    await syncProjectToDexie(detail.data);
  }

  // Recharge le profile pour que le compteur clusterings_used affiché soit
  // à jour partout (le Settings notamment).
  await useAuthStore.getState().reloadProfile();

  return {
    fromCache: false,
    clusterCount: result.clusterCount,
    unmatchedCount: result.unmatchedCount,
    unclusteredClusterId: result.unclusteredClusterId,
    uniqueKeywordCount: result.uniqueKeywordCount,
    persistedAssignments: result.persistedAssignments,
    totalChunks: result.totalChunks,
    usage: null, // pas de calcul $ côté browser pour le managé (clé centrale)
    model: result.model,
    clusteringsUsed: result.clusteringsUsed,
    clusteringsLimit: result.clusteringsLimit,
  };
}
