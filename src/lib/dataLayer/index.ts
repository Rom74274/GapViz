// Frontière entre l'app (forme Dexie/flat) et Supabase (forme split + RLS).
// Réexporte les éléments à utiliser depuis le reste de l'app.

export {
  fetchProjectsFromSupabase,
  fetchProjectDetailFromSupabase,
  type ProjectFetchResult,
} from './read';

export {
  useSupabaseProjects,
  useSupabaseProjectDetail,
  type SupabaseProjectDetailStatus,
} from './useSupabaseProject';

export { syncProjectToDexie } from './syncToDexie';

export {
  createProjectInSupabase,
  saveClusteringToSupabase,
  type CreateProjectInput,
  type CreateProjectProgress,
  type CreateProjectResult,
  type SaveClusteringResult,
  type SiteWriteInput,
} from './write';

export type { FlatProjectGraph, RemoteProjectGraphBundle } from './translate';
