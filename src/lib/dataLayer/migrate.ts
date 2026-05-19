import { db } from '@/lib/db';
import { supabase } from '@/lib/supabase';
import type { ParsedRow } from '@/lib/parsers';
import { createProjectInSupabase, type CreateProjectProgress, type SiteWriteInput } from './write';

// ---------------------------------------------------------------------------
// Migration Dexie (local) → Supabase (cloud).
//
// Pour chaque projet local non encore présent en Supabase :
//   - lit Dexie (projet + competitors + keywords flat)
//   - reconstruit la forme `SiteWriteInput[]` à partir des KWs groupés
//     par sourceDomain
//   - appelle createProjectInSupabase en préservant l'id Dexie (pour
//     que les bookmarks /projects/<id> survivent)
//
// Note : les clusters Dexie ne sont PAS migrés. Le clusterCache local
// (hash → assignments) reste, donc un re-clustering depuis Supabase
// sera quasi-instantané (cache HIT) et reconstruira les mêmes clusters.
// ---------------------------------------------------------------------------

export interface MigratableProject {
  id: string;
  name: string;
  myDomain: string;
  country: string;
  keywordCount: number;
  competitorCount: number;
}

export interface MigrationProgress {
  projectIndex: number;
  totalProjects: number;
  projectName: string;
  step: CreateProjectProgress['step'] | 'starting';
  stepDone: number;
  stepTotal: number;
}

export interface MigrationResult {
  migrated: string[]; // project ids
  skipped: string[]; // déjà présents en Supabase
  failed: Array<{ id: string; name: string; error: string }>;
}

// Liste les projets Dexie qui ne sont PAS encore dans Supabase.
export async function listMigratableProjects(): Promise<MigratableProject[]> {
  const localProjects = await db.projects.toArray();
  if (localProjects.length === 0) return [];

  const { data: remote, error } = await supabase.from('projects').select('id');
  if (error) {
    console.error('[migrate] fetchRemoteIds error', error);
    throw new Error(`Lecture des projets distants : ${error.message}`);
  }
  const remoteIds = new Set((remote ?? []).map((r) => r.id as string));

  const out: MigratableProject[] = [];
  for (const p of localProjects) {
    if (remoteIds.has(p.id)) continue;
    const [kwCount, compCount] = await Promise.all([
      db.keywords.where('projectId').equals(p.id).count(),
      db.competitors.where('projectId').equals(p.id).count(),
    ]);
    out.push({
      id: p.id,
      name: p.name,
      myDomain: p.myDomain,
      country: p.country,
      keywordCount: kwCount,
      competitorCount: compCount,
    });
  }
  return out;
}

// Migre un seul projet local vers Supabase.
async function migrateOne(
  localProjectId: string,
  onProgress?: (p: CreateProjectProgress) => void,
): Promise<void> {
  const project = await db.projects.get(localProjectId);
  if (!project) throw new Error(`Projet local introuvable: ${localProjectId}`);

  const competitors = await db.competitors.where('projectId').equals(localProjectId).toArray();
  const keywords = await db.keywords.where('projectId').equals(localProjectId).toArray();

  // Groupe les keywords Dexie (flat, 1 row par kw×source) par sourceDomain
  // pour reconstruire la forme SiteWriteInput attendue par createProjectInSupabase.
  const rowsByDomain = new Map<string, ParsedRow[]>();
  for (const k of keywords) {
    const list = rowsByDomain.get(k.sourceDomain) ?? [];
    list.push({
      keyword: k.keyword,
      volume: k.volume,
      position: k.position,
      kd: k.kd,
      cpc: k.cpc,
      intent: k.intent,
      url: k.url,
      traffic: k.traffic ?? null,
      serpFeatures: k.serpFeatures ?? null,
      branded: k.branded ?? null,
    });
    rowsByDomain.set(k.sourceDomain, list);
  }

  // Sites = competitors Dexie, on s'assure que le my_site (isMe ou domain ===
  // project.myDomain) est présent même s'il n'avait pas de competitor row.
  const sites: SiteWriteInput[] = competitors.map((c) => ({
    domain: c.domain,
    label: c.label,
    color: c.color,
    isMe: c.isMe,
    parseResult: rowsByDomain.has(c.domain)
      ? { rows: rowsByDomain.get(c.domain)! }
      : null,
  }));

  // Si le my_domain n'est pas dans les competitors (cas rare, projets anciens),
  // on l'ajoute synthétiquement pour ne pas perdre ses keywords.
  const hasMy = sites.some((s) => s.domain === project.myDomain);
  if (!hasMy) {
    sites.unshift({
      domain: project.myDomain,
      label: project.myDomain,
      color: '#3b82f6',
      isMe: true,
      parseResult: rowsByDomain.has(project.myDomain)
        ? { rows: rowsByDomain.get(project.myDomain)! }
        : null,
    });
  }

  await createProjectInSupabase(
    {
      projectId: project.id,
      name: project.name,
      myDomain: project.myDomain,
      country: project.country,
      sites,
    },
    onProgress,
  );
}

// Migre tous les projets locaux non présents en Supabase, séquentiellement.
export async function migrateLocalProjectsToSupabase(
  onProgress?: (p: MigrationProgress) => void,
): Promise<MigrationResult> {
  const migratable = await listMigratableProjects();
  const result: MigrationResult = { migrated: [], skipped: [], failed: [] };

  for (let i = 0; i < migratable.length; i++) {
    const proj = migratable[i]!;
    onProgress?.({
      projectIndex: i,
      totalProjects: migratable.length,
      projectName: proj.name,
      step: 'starting',
      stepDone: 0,
      stepTotal: 1,
    });
    try {
      await migrateOne(proj.id, (p) => {
        onProgress?.({
          projectIndex: i,
          totalProjects: migratable.length,
          projectName: proj.name,
          step: p.step,
          stepDone: p.done,
          stepTotal: p.total,
        });
      });
      result.migrated.push(proj.id);
    } catch (e) {
      console.error('[migrate] project failed', proj.id, e);
      result.failed.push({
        id: proj.id,
        name: proj.name,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return result;
}
