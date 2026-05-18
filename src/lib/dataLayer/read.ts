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

  // 3) Positions — uniquement si on a des keywords (sinon on évite une
  // requête inutile et un IN () vide).
  let positions: SupabaseKeywordPosition[] = [];
  if (keywords.length > 0) {
    const positionsQ = await supabase
      .from('keyword_positions')
      .select('*')
      .in(
        'keyword_id',
        keywords.map((k) => k.id),
      );
    if (positionsQ.error) {
      console.error('[dataLayer] fetchProjectDetail positions error', positionsQ.error);
      return { ok: false, reason: 'error', error: positionsQ.error };
    }
    positions = (positionsQ.data ?? []) as SupabaseKeywordPosition[];
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
