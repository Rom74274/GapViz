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
  const [competitorsQ, keywordsQ, clustersQ] = await Promise.all([
    supabase.from('competitors').select('*').eq('project_id', projectId),
    supabase.from('keywords').select('*').eq('project_id', projectId),
    supabase.from('clusters').select('*').eq('project_id', projectId),
  ]);
  for (const q of [competitorsQ, keywordsQ, clustersQ]) {
    if (q.error) {
      console.error('[dataLayer] fetchProjectDetail child error', q.error);
      return { ok: false, reason: 'error', error: q.error };
    }
  }

  const competitors = (competitorsQ.data ?? []) as SupabaseCompetitor[];
  const keywords = (keywordsQ.data ?? []) as SupabaseKeyword[];
  const clusters = (clustersQ.data ?? []) as SupabaseCluster[];

  // 3) Positions — chunked par batches de 200 keyword_ids pour rester
  // sous la limite d'URL PostgREST (~8KB). Avec des UUIDs de 36 chars,
  // 200 IDs = ~7200 chars, OK.
  let positions: SupabaseKeywordPosition[] = [];
  if (keywords.length > 0) {
    const allKwIds = keywords.map((k) => k.id);
    const CHUNK = 200;
    for (let i = 0; i < allKwIds.length; i += CHUNK) {
      const chunk = allKwIds.slice(i, i + CHUNK);
      const positionsQ = await supabase
        .from('keyword_positions')
        .select('*')
        .in('keyword_id', chunk);
      if (positionsQ.error) {
        console.error('[dataLayer] fetchProjectDetail positions error', positionsQ.error);
        return { ok: false, reason: 'error', error: positionsQ.error };
      }
      positions = positions.concat((positionsQ.data ?? []) as SupabaseKeywordPosition[]);
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
