import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import type {
  Cluster as DexieCluster,
  Competitor as DexieCompetitor,
  Keyword as DexieKeyword,
  Project as DexieProject,
} from '@/lib/db';
import { fetchProjectDetailFromSupabase, fetchProjectsFromSupabase } from './read';

// ---------------------------------------------------------------------------
// useSupabaseProjects — liste des projets de l'utilisateur.
// ---------------------------------------------------------------------------

interface ProjectsState {
  projects: DexieProject[];
  loading: boolean;
  error: unknown | null;
  refetch: () => void;
}

export function useSupabaseProjects(): ProjectsState {
  const { status, user } = useAuth();
  const [state, setState] = useState<Omit<ProjectsState, 'refetch'>>({
    projects: [],
    loading: true,
    error: null,
  });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (status !== 'authenticated' || !user) {
      setState({ projects: [], loading: false, error: null });
      return;
    }
    setState((s) => ({ ...s, loading: true, error: null }));
    fetchProjectsFromSupabase()
      .then((projects) => {
        if (cancelled) return;
        setState({ projects, loading: false, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({ projects: [], loading: false, error: err });
      });
    return () => {
      cancelled = true;
    };
  }, [status, user?.id, nonce]);

  return { ...state, refetch: () => setNonce((n) => n + 1) };
}

// ---------------------------------------------------------------------------
// useSupabaseProjectDetail — load complet d'un projet (graph data).
// ---------------------------------------------------------------------------

export type SupabaseProjectDetailStatus =
  | 'idle'
  | 'loading'
  | 'found'
  | 'not_found'
  | 'error';

interface ProjectDetailState {
  status: SupabaseProjectDetailStatus;
  project: DexieProject | null;
  competitors: DexieCompetitor[];
  keywords: DexieKeyword[];
  clusters: DexieCluster[];
  error: unknown | null;
}

const EMPTY_DETAIL: ProjectDetailState = {
  status: 'idle',
  project: null,
  competitors: [],
  keywords: [],
  clusters: [],
  error: null,
};

export function useSupabaseProjectDetail(projectId: string | undefined): ProjectDetailState {
  const { status: authStatus } = useAuth();
  const [state, setState] = useState<ProjectDetailState>(EMPTY_DETAIL);

  useEffect(() => {
    let cancelled = false;
    if (!projectId || authStatus !== 'authenticated') {
      setState(EMPTY_DETAIL);
      return;
    }
    setState((s) => ({ ...s, status: 'loading', error: null }));
    fetchProjectDetailFromSupabase(projectId).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setState({
          ...EMPTY_DETAIL,
          status: result.reason === 'not_found' ? 'not_found' : 'error',
          error: result.error ?? null,
        });
        return;
      }
      const { project, competitors, keywords, clusters } = result.data;
      setState({
        status: 'found',
        project,
        competitors,
        keywords,
        clusters,
        error: null,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, authStatus]);

  return state;
}
