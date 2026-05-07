import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Intent } from '@/lib/db';

export interface FilterState {
  // null = pas de filtre, tous visibles. [] = aucun visible.
  activeSites: string[] | null;          // domaines
  activeClusters: string[] | null;       // cluster IDs (Dexie)
  intents: Intent[] | null;
  volumeRange: [number, number] | null;
  kdRange: [number, number] | null;
  positionRange: [number, number] | null;
  gapOnly: boolean;
}

export const DEFAULT_FILTERS: FilterState = {
  activeSites: null,
  activeClusters: null,
  intents: null,
  volumeRange: null,
  kdRange: null,
  positionRange: null,
  gapOnly: false,
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
    f.intents !== null ||
    f.volumeRange !== null ||
    f.kdRange !== null ||
    f.positionRange !== null ||
    f.gapOnly
  );
}
