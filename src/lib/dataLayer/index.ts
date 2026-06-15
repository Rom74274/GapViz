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

export { syncProjectToDexie, purgeProjectFromDexie } from './syncToDexie';

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

export {
  listMigratableProjects,
  migrateLocalProjectsToSupabase,
  type MigratableProject,
  type MigrationProgress,
  type MigrationResult,
} from './migrate';

export {
  runManagedClustering,
  ManagedClusteringError,
  type ManagedClusterResult,
  type ManagedClusterError,
} from './managedClustering';

export {
  createImportSession,
  getImportSession,
  cancelImportSession,
  buildAhrefsImportUrl,
  buildSemrushImportUrl,
  buildImportUrl,
  IMPORT_SOURCES,
  type ImportSource,
  type CreateImportSessionInput,
  type CreateImportSessionResult,
} from './extensionImport';
