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

export async function runManagedClustering(projectId: string): Promise<ManagedClusterResult> {
  const { data, error } = await supabase.functions.invoke('cluster', {
    body: { projectId },
  });

  if (error) {
    // L'Edge Function renvoie un body JSON même en cas d'erreur (4xx/5xx).
    // supabase-js wrap dans FunctionsHttpError dont .context contient la
    // Response originale — on tente de l'extraire pour avoir un message FR.
    // Le body a la forme { error: 'quota_exceeded', message: '…', used, limit, plan }
    // — donc on lit `error` ET `code` au cas où le format évolue.
    type ErrorBody = {
      error?: string;
      code?: string;
      message?: string;
      used?: number;
      limit?: number;
      plan?: string;
    };
    let body: ErrorBody = {};
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === 'function') {
        body = (await ctx.json()) as ErrorBody;
      }
    } catch {
      // ignore — fallback sur error.message
    }
    const code = (body.code ?? body.error ?? 'internal') as ManagedClusterError['code'];
    throw new ManagedClusteringError({
      code,
      message: body.message ?? error.message ?? 'Erreur edge function',
      used: body.used,
      limit: body.limit,
      plan: body.plan,
    });
  }

  if (!data || (data as { ok?: boolean }).ok !== true) {
    throw new ManagedClusteringError({
      code: 'internal',
      message: 'Réponse inattendue de la fonction cluster',
    });
  }

  const result = data as {
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
