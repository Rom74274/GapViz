import { useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Intent } from '@/lib/db';

export interface FilterState {
  // null = pas de filtre, tous visibles. [] = aucun visible.
  activeSites: string[] | null;          // domaines
  activeClusters: string[] | null;       // cluster IDs inclus
  excludedClusters: string[];            // cluster IDs explicitement exclus (priorité sur active)
  intents: Intent[] | null;
  volumeRange: [number, number] | null;
  kdRange: [number, number] | null;
  positionRange: [number, number] | null;
  gapOnly: boolean;
  hideDatedKeywords: boolean;            // masque les KWs contenant une année passée
}

export const DEFAULT_FILTERS: FilterState = {
  activeSites: null,
  activeClusters: null,
  excludedClusters: [],
  intents: null,
  volumeRange: null,
  kdRange: null,
  positionRange: null,
  gapOnly: false,
  hideDatedKeywords: false,
};

interface FilterStore {
  byProject: Record<string, FilterState>;
  patch: (projectId: string, patch: Partial<FilterState>) => void;
  reset: (projectId: string) => void;
}

export const useFilterStore = create<FilterStore>()(
  persist(
    (set) => ({
      byProject: {},
      patch: (projectId, patch) =>
        set((s) => ({
          byProject: {
            ...s.byProject,
            [projectId]: {
              // Toujours partir des defaults pour garantir que tous les champs
              // sont présents — utile quand on ajoute de nouveaux filtres
              // après une persistance précédente.
              ...DEFAULT_FILTERS,
              ...(s.byProject[projectId] ?? {}),
              ...patch,
            },
          },
        })),
      reset: (projectId) =>
        set((s) => ({
          byProject: { ...s.byProject, [projectId]: { ...DEFAULT_FILTERS } },
        })),
    }),
    {
      name: 'gapviz-filters',
      version: 2,
      // Backwards-compat : si l'utilisateur a une version persistée plus
      // ancienne (sans excludedClusters / hideDatedKeywords), on enrichit
      // chaque entrée avec les defaults.
      migrate: (state) => {
        if (typeof state !== 'object' || state === null) return state;
        const s = state as { byProject?: Record<string, Partial<FilterState>> };
        if (s.byProject) {
          for (const id of Object.keys(s.byProject)) {
            s.byProject[id] = { ...DEFAULT_FILTERS, ...s.byProject[id] };
          }
        }
        return state;
      },
    },
  ),
);

export function useProjectFilters(projectId: string): FilterState {
  const raw = useFilterStore((s) => s.byProject[projectId]);
  return useMemo(() => {
    if (!raw) return DEFAULT_FILTERS;
    // Merge avec les defaults pour absorber tout champ manquant (état
    // persisté pré-migration ou champs ajoutés à FilterState).
    return { ...DEFAULT_FILTERS, ...raw };
  }, [raw]);
}

export function isAnyFilterActive(f: FilterState): boolean {
  return (
    f.activeSites !== null ||
    f.activeClusters !== null ||
    f.excludedClusters.length > 0 ||
    f.intents !== null ||
    f.volumeRange !== null ||
    f.kdRange !== null ||
    f.positionRange !== null ||
    f.gapOnly ||
    f.hideDatedKeywords
  );
}
