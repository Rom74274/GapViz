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
              ...(s.byProject[projectId] ?? DEFAULT_FILTERS),
              ...patch,
            },
          },
        })),
      reset: (projectId) =>
        set((s) => ({
          byProject: { ...s.byProject, [projectId]: { ...DEFAULT_FILTERS } },
        })),
    }),
    { name: 'gapviz-filters' },
  ),
);

export function useProjectFilters(projectId: string): FilterState {
  return useFilterStore((s) => s.byProject[projectId] ?? DEFAULT_FILTERS);
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
