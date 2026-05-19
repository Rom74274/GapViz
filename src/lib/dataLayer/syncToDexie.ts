import { db } from '@/lib/db';
import type { FlatProjectGraph } from './translate';

// Met à jour le cache Dexie local avec les données fraîches de Supabase
// pour un projet donné. Pattern write-through : tout consommateur Dexie
// (useLiveQuery dans GraphCanvas, FilterBar, ClusterPanel…) voit les
// données automatiquement après cet appel.
//
// Comportement transactionnel : tout ou rien. Si la sync échoue à mi-
// chemin, Dexie reste cohérent.
//
// ⚠️ Cette fonction REMPLACE les données locales du projet. À n'appeler
// que quand on est sûr que Supabase est la source de vérité.
export async function syncProjectToDexie(
  data: FlatProjectGraph,
): Promise<void> {
  const { project, competitors, keywords, clusters } = data;
  await db.transaction(
    'rw',
    [db.projects, db.competitors, db.keywords, db.clusters],
    async () => {
      // Purge tout ce qui existait pour ce projectId.
      await db.competitors.where('projectId').equals(project.id).delete();
      await db.keywords.where('projectId').equals(project.id).delete();
      await db.clusters.where('projectId').equals(project.id).delete();
      // Insert/update.
      await db.projects.put(project);
      if (competitors.length > 0) await db.competitors.bulkAdd(competitors);
      if (keywords.length > 0) await db.keywords.bulkAdd(keywords);
      if (clusters.length > 0) await db.clusters.bulkAdd(clusters);
    },
  );
}

// Invalide complètement le cache Dexie pour un projet — à appeler après
// une suppression Supabase (ou pour purger un projet local-only).
// Contrepartie de syncProjectToDexie pour le cycle de vie de la cache.
export async function purgeProjectFromDexie(projectId: string): Promise<void> {
  await db.transaction(
    'rw',
    [db.projects, db.competitors, db.keywords, db.clusters],
    async () => {
      await db.keywords.where('projectId').equals(projectId).delete();
      await db.competitors.where('projectId').equals(projectId).delete();
      await db.clusters.where('projectId').equals(projectId).delete();
      await db.projects.delete(projectId);
    },
  );
}
