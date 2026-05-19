import { supabase } from '@/lib/supabase';
import type { ParsedRow } from '@/lib/parsers';

// ---------------------------------------------------------------------------
// Création d'un projet complet en Supabase à partir des données collectées
// par NewProjectPage (project info + sites avec CSV parsé).
//
// Stratégie : un seul user n'ayant qu'un appel par site n'aura pas de
// surprise ; pour les gros imports, on chunke par 500 rows pour rester
// sous la limite de payload Supabase (~1MB) et avoir une bonne UX
// de progression.
// ---------------------------------------------------------------------------

export interface SiteWriteInput {
  domain: string;
  label: string;
  color: string;
  isMe: boolean; // utilisé seulement pour repérer le my_domain, pas écrit en DB
  parseResult: { rows: ParsedRow[] } | null;
}

export interface CreateProjectInput {
  name: string;
  myDomain: string;
  country: string;
  sites: SiteWriteInput[];
}

export interface CreateProjectProgress {
  step: 'project' | 'competitors' | 'keywords' | 'positions' | 'done';
  done: number;
  total: number;
}

export interface CreateProjectResult {
  projectId: string;
  keywordCount: number;
  positionCount: number;
  competitorCount: number;
}

const CHUNK_ROWS = 500;

export async function createProjectInSupabase(
  input: CreateProjectInput,
  onProgress?: (p: CreateProjectProgress) => void,
): Promise<CreateProjectResult> {
  const projectId = crypto.randomUUID();

  // ------- 1. project -------
  onProgress?.({ step: 'project', done: 0, total: 1 });
  {
    const { error } = await supabase.from('projects').insert({
      id: projectId,
      name: input.name,
      my_domain: input.myDomain,
      country: input.country,
    });
    if (error) throw new Error(`Supabase project insert: ${error.message}`);
  }
  onProgress?.({ step: 'project', done: 1, total: 1 });

  // ------- 2. competitors -------
  // Pas de champ is_me en DB — on dérive client-side via my_domain.
  const competitors = input.sites
    .filter((s) => s.domain.trim() !== '')
    .map((s) => ({
      id: crypto.randomUUID(),
      project_id: projectId,
      domain: s.domain.trim(),
      label: s.label.trim() || s.domain,
      color: s.color,
    }));
  onProgress?.({ step: 'competitors', done: 0, total: competitors.length });
  if (competitors.length > 0) {
    const { error } = await supabase.from('competitors').insert(competitors);
    if (error) throw new Error(`Supabase competitors insert: ${error.message}`);
  }
  onProgress?.({ step: 'competitors', done: competitors.length, total: competitors.length });

  // ------- 3. group keywords by text across sites -------
  type SiteRow = { site: SiteWriteInput; row: ParsedRow };
  const sitePositions: SiteRow[] = [];
  for (const site of input.sites) {
    if (!site.parseResult || site.domain.trim() === '') continue;
    for (const row of site.parseResult.rows) {
      sitePositions.push({ site, row });
    }
  }
  const byKwText = new Map<string, SiteRow[]>();
  for (const sp of sitePositions) {
    const key = sp.row.keyword.trim().toLowerCase();
    const list = byKwText.get(key) ?? [];
    list.push(sp);
    byKwText.set(key, list);
  }

  // Build keywords payload (1 row par unique KW text, métadonnées agrégées)
  // et positions payload (1 row par (kw, source)).
  const keywords: Array<{
    id: string;
    project_id: string;
    keyword: string;
    volume: number | null;
    kd: number | null;
    cpc: number | null;
    intent: string[] | null;
    cluster_id: null;
    branded: boolean | null;
    traffic: number | null;
    serp_features: string | null;
  }> = [];
  const positions: Array<{
    id: string;
    keyword_id: string;
    source_domain: string;
    position: number | null;
    url: string | null;
  }> = [];

  for (const [, entries] of byKwText) {
    const kwId = crypto.randomUUID();
    const first = entries[0]!.row;
    const volumes = entries.map((e) => e.row.volume).filter((v): v is number => typeof v === 'number');
    const traffics = entries
      .map((e) => e.row.traffic)
      .filter((v): v is number => typeof v === 'number');
    keywords.push({
      id: kwId,
      project_id: projectId,
      keyword: first.keyword,
      volume: volumes.length > 0 ? Math.max(...volumes) : null,
      kd: first.kd,
      cpc: first.cpc,
      intent: first.intent.length > 0 ? first.intent : null,
      cluster_id: null,
      branded: entries.some((e) => e.row.branded === true)
        ? true
        : entries.some((e) => e.row.branded === false)
          ? false
          : null,
      traffic: traffics.length > 0 ? Math.max(...traffics) : null,
      serp_features:
        entries.find((e) => e.row.serpFeatures && e.row.serpFeatures.trim() !== '')?.row
          .serpFeatures ?? null,
    });
    for (const e of entries) {
      positions.push({
        id: crypto.randomUUID(),
        keyword_id: kwId,
        source_domain: e.site.domain.trim(),
        position: e.row.position,
        url: e.row.url,
      });
    }
  }

  // ------- 4. keywords (chunked) -------
  onProgress?.({ step: 'keywords', done: 0, total: keywords.length });
  let kwDone = 0;
  for (const chunk of chunked(keywords, CHUNK_ROWS)) {
    const { error } = await supabase.from('keywords').insert(chunk);
    if (error) throw new Error(`Supabase keywords insert: ${error.message}`);
    kwDone += chunk.length;
    onProgress?.({ step: 'keywords', done: kwDone, total: keywords.length });
  }

  // ------- 5. keyword_positions (chunked) -------
  onProgress?.({ step: 'positions', done: 0, total: positions.length });
  let posDone = 0;
  for (const chunk of chunked(positions, CHUNK_ROWS)) {
    const { error } = await supabase.from('keyword_positions').insert(chunk);
    if (error) throw new Error(`Supabase positions insert: ${error.message}`);
    posDone += chunk.length;
    onProgress?.({ step: 'positions', done: posDone, total: positions.length });
  }

  onProgress?.({ step: 'done', done: 1, total: 1 });

  return {
    projectId,
    keywordCount: keywords.length,
    positionCount: positions.length,
    competitorCount: competitors.length,
  };
}

// ---------------------------------------------------------------------------
// Clustering — persistance Supabase. Remplace l'ancien persistClusters Dexie.
// Le caller doit ensuite re-fetch + sync to Dexie pour rafraîchir le cache.
//
// Pattern :
// 1) Reset all keywords.cluster_id = NULL pour ce project
// 2) Delete old clusters
// 3) Insert new clusters
// 4) Update keywords.cluster_id batched par cluster
// ---------------------------------------------------------------------------

export interface ClusterAssignment {
  name: string;
  keywords: string[]; // text
}

export interface SaveClusteringResult {
  newClusterCount: number;
  unclusteredClusterId: string | null;
  matchedKwCount: number;
  unmatchedKwCount: number;
}

const UNCLUSTERED_LABEL = 'Non clusterisé';

export async function saveClusteringToSupabase(
  projectId: string,
  assignments: ClusterAssignment[],
  unmatched: string[],
): Promise<SaveClusteringResult> {
  // 1. Reset cluster_id on tous les KWs du projet.
  {
    const { error } = await supabase
      .from('keywords')
      .update({ cluster_id: null })
      .eq('project_id', projectId);
    if (error) throw new Error(`Supabase reset cluster_id: ${error.message}`);
  }

  // 2. Delete old clusters du projet.
  {
    const { error } = await supabase
      .from('clusters')
      .delete()
      .eq('project_id', projectId);
    if (error) throw new Error(`Supabase delete clusters: ${error.message}`);
  }

  // 3. Charge le mapping keyword.text → keyword.id pour ce projet.
  const { data: allKws, error: kwErr } = await supabase
    .from('keywords')
    .select('id, keyword')
    .eq('project_id', projectId);
  if (kwErr) throw new Error(`Supabase fetch keywords for assign: ${kwErr.message}`);
  const textToId = new Map<string, string>();
  for (const k of allKws ?? []) {
    textToId.set((k.keyword as string).trim().toLowerCase(), k.id as string);
  }

  // 4. Insert new clusters + collect assignments.
  const newClusters: Array<{
    id: string;
    project_id: string;
    name: string;
    parent_id: null;
    is_noise: boolean;
    excluded: boolean;
  }> = [];
  const assignBuckets: Array<{ clusterId: string; kwIds: string[] }> = [];
  const matched = new Set<string>();

  for (const a of assignments) {
    const clusterId = crypto.randomUUID();
    newClusters.push({
      id: clusterId,
      project_id: projectId,
      name: a.name,
      parent_id: null,
      is_noise: false,
      excluded: false,
    });
    const kwIds: string[] = [];
    for (const kwText of a.keywords) {
      const id = textToId.get(kwText.trim().toLowerCase());
      if (id && !matched.has(id)) {
        kwIds.push(id);
        matched.add(id);
      }
    }
    if (kwIds.length > 0) assignBuckets.push({ clusterId, kwIds });
  }

  // Bucket "Non clusterisé" pour les unmatched (si présents).
  let unclusteredClusterId: string | null = null;
  if (unmatched.length > 0) {
    unclusteredClusterId = crypto.randomUUID();
    newClusters.push({
      id: unclusteredClusterId,
      project_id: projectId,
      name: UNCLUSTERED_LABEL,
      parent_id: null,
      is_noise: false,
      excluded: false,
    });
    const kwIds: string[] = [];
    for (const kwText of unmatched) {
      const id = textToId.get(kwText.trim().toLowerCase());
      if (id && !matched.has(id)) {
        kwIds.push(id);
        matched.add(id);
      }
    }
    if (kwIds.length > 0) {
      assignBuckets.push({ clusterId: unclusteredClusterId, kwIds });
    } else {
      // Pas de KW à mettre dedans — retire le cluster vide.
      newClusters.pop();
      unclusteredClusterId = null;
    }
  }

  // 5. Insert clusters (en bulk, peu nombreux d'habitude).
  if (newClusters.length > 0) {
    const { error } = await supabase.from('clusters').insert(newClusters);
    if (error) throw new Error(`Supabase insert clusters: ${error.message}`);
  }

  // 6. Update keywords.cluster_id par batch de bucket (1 update par cluster).
  let matchedKwCount = 0;
  for (const bucket of assignBuckets) {
    // Chunked au cas où un cluster ait beaucoup de KWs.
    for (const idsChunk of chunked(bucket.kwIds, 500)) {
      const { error } = await supabase
        .from('keywords')
        .update({ cluster_id: bucket.clusterId })
        .in('id', idsChunk);
      if (error) throw new Error(`Supabase assign cluster: ${error.message}`);
      matchedKwCount += idsChunk.length;
    }
  }

  return {
    newClusterCount: newClusters.length,
    unclusteredClusterId,
    matchedKwCount,
    unmatchedKwCount: unmatched.length,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function* chunked<T>(arr: T[], size: number): Generator<T[]> {
  for (let i = 0; i < arr.length; i += size) {
    yield arr.slice(i, i + size);
  }
}
