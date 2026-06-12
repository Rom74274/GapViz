import { supabase } from '@/lib/supabase';
import type {
  SupabaseCluster,
  SupabaseCompetitor,
  SupabaseKeyword,
  SupabaseKeywordPosition,
  SupabaseProject,
} from '@/lib/supabaseTypes';
import type { Project as DexieProject } from '@/lib/db';
import {
  flattenRemoteBundle,
  projectFromSupabase,
  type FlatProjectGraph,
} from './translate';

// ---------------------------------------------------------------------------
// Liste des projets de l'utilisateur courant (RLS filtre via auth.uid()).
// ---------------------------------------------------------------------------

export async function fetchProjectsFromSupabase(): Promise<DexieProject[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[dataLayer] fetchProjects error', error);
    throw error;
  }
  return (data ?? []).map((p) => projectFromSupabase(p as SupabaseProject));
}

// ---------------------------------------------------------------------------
// Détail d'un projet (competitors + keywords + positions + clusters) →
// forme flat consommable par buildGraph/useProjectGraph.
// ---------------------------------------------------------------------------

export type ProjectFetchResult =
  | { ok: true; data: FlatProjectGraph }
  | { ok: false; reason: 'not_found' | 'error'; error?: unknown };

export async function fetchProjectDetailFromSupabase(
  projectId: string,
): Promise<ProjectFetchResult> {
  // 1) Le projet lui-même (RLS bloque si ce n'est pas le sien).
  const projectQ = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .maybeSingle();
  if (projectQ.error) {
    console.error('[dataLayer] fetchProjectDetail project error', projectQ.error);
    return { ok: false, reason: 'error', error: projectQ.error };
  }
  if (!projectQ.data) {
    return { ok: false, reason: 'not_found' };
  }
  const project = projectQ.data as SupabaseProject;

  // 2) Competitors + Keywords + Clusters en parallèle.
  // PostgREST cap SELECT à 1000 rows par défaut → on utilise .range() en
  // boucle pour récupérer tout (essentiel sur les KWs des gros projets).
  const [competitors, keywords, clusters] = await Promise.all([
    fetchAllPaginated<SupabaseCompetitor>('competitors', projectId),
    fetchAllPaginated<SupabaseKeyword>('keywords', projectId),
    fetchAllPaginated<SupabaseCluster>('clusters', projectId),
  ]).catch((err) => {
    console.error('[dataLayer] fetchProjectDetail child error', err);
    throw err;
  });

  // 3) Positions — chunked par batches de 200 keyword_ids pour rester
  // sous la limite d'URL PostgREST (~8KB).
  let positions: SupabaseKeywordPosition[] = [];
  if (keywords.length > 0) {
    const allKwIds = keywords.map((k) => k.id);
    const CHUNK = 200;
    for (let i = 0; i < allKwIds.length; i += CHUNK) {
      const chunk = allKwIds.slice(i, i + CHUNK);
      // Chaque chunk de 200 keyword_ids peut générer plusieurs centaines
      // de positions (1 par kw × source). Pagination via .range() pour
      // bypass le cap 1000 de PostgREST si nécessaire.
      let from = 0;
      const PAGE = 1000;
      while (true) {
        const positionsQ = await supabase
          .from('keyword_positions')
          .select('*')
          .in('keyword_id', chunk)
          .range(from, from + PAGE - 1);
        if (positionsQ.error) {
          console.error('[dataLayer] fetchProjectDetail positions error', positionsQ.error);
          return { ok: false, reason: 'error', error: positionsQ.error };
        }
        const batch = (positionsQ.data ?? []) as SupabaseKeywordPosition[];
        positions = positions.concat(batch);
        if (batch.length < PAGE) break;
        from += PAGE;
      }
    }
  }

  return {
    ok: true,
    data: flattenRemoteBundle({
      project,
      competitors,
      keywords,
      positions,
      clusters,
    }),
  };
}

// Helper : fetch toutes les rows d'une table filtrée par project_id,
// en paginant pour bypass le cap 1000 de PostgREST.
async function fetchAllPaginated<T>(table: string, projectId: string): Promise<T[]> {
  const PAGE = 1000;
  const all: T[] = [];
  let from = 0;
  // Sécurité : max 50 itérations = 50k rows max par table. Au-delà, on
  // arrête (un projet avec >50k KWs poserait d'autres problèmes de perf).
  for (let i = 0; i < 50; i++) {
    const q = await supabase
      .from(table)
      .select('*')
      .eq('project_id', projectId)
      .range(from, from + PAGE - 1);
    if (q.error) throw q.error;
    const batch = (q.data ?? []) as T[];
    all.push(...batch);
    if (batch.length < PAGE) break;
    from += PAGE;
  }
  return all;
}
