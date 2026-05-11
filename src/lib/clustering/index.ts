import { db, type Cluster, type Keyword } from '@/lib/db';
import { createClaudeClient } from '@/lib/claude';
import {
  SYSTEM_PROMPT,
  FOLLOWUP_SYSTEM_PROMPT,
  buildUserMessage,
  buildFollowupUserMessage,
  type ExistingClusterSnapshot,
} from './prompt';
import { hashKeywordSet } from './hash';
import { parseClusterResponse, type ClusterAssignment } from './parse';
import { actualCost, CHUNK_SIZE, CHUNK_THRESHOLD } from './cost';

export type { CostEstimate } from './cost';
export { estimateClusteringCost, formatUSD, CHUNK_SIZE, CHUNK_THRESHOLD } from './cost';
export { hashKeywordSet };

const MAX_TOKENS = 32768;

export interface ClusterRunProgress {
  chunk: number;
  totalChunks: number;
  kwsDone: number;
  kwsTotal: number;
}

export interface ClusterRunResult {
  fromCache: boolean;
  clusterCount: number;
  unmatchedCount: number;
  unclusteredClusterId: string | null;
  uniqueKeywordCount: number;
  persistedAssignments: number;
  totalChunks: number;
  usage: {
    inputTokens: number;
    outputTokens: number;
    usd: number;
  } | null;
}

export interface RunClusteringOptions {
  apiKey: string;
  model: string;
  force?: boolean;
  onProgress?: (progress: ClusterRunProgress) => void;
}

const UNCLUSTERED_LABEL = 'Non clusterisé';

const log = (...args: unknown[]) => console.log('[clustering]', ...args);
const warn = (...args: unknown[]) => console.warn('[clustering]', ...args);
const errLog = (...args: unknown[]) => console.error('[clustering]', ...args);

export async function runClustering(
  projectId: string,
  opts: RunClusteringOptions,
): Promise<ClusterRunResult> {
  const t0 = performance.now();
  log('start', { projectId, model: opts.model, force: !!opts.force });

  const allKeywords = await db.keywords.where('projectId').equals(projectId).toArray();
  log('loaded raw keywords', { count: allKeywords.length });
  if (allKeywords.length === 0) {
    throw new Error(
      'Aucun mot-clé dans ce projet — importe au moins un CSV avant de clusteriser.',
    );
  }

  const uniqueKeywords = dedupeByKeyword(allKeywords);
  const uniqueCount = uniqueKeywords.length;
  log('deduped unique keywords', { unique: uniqueCount, raw: allKeywords.length });

  // Tri par volume desc — important pour le chunking (les plus gros KWs dans
  // le 1er chunk, ils définissent la structure de clusters initiale).
  uniqueKeywords.sort((a, b) => b.volume - a.volume);

  const hash = await hashKeywordSet(uniqueKeywords.map((k) => k.keyword));
  log('keyword set hash', { hash });

  const cached = opts.force ? undefined : await db.clusterCache.get(hash);
  let assignments: ClusterAssignment[];
  let unmatched: string[];
  let usage: ClusterRunResult['usage'] = null;
  let fromCache = false;
  let totalChunks = 1;

  if (cached) {
    log('cache HIT', { createdAt: new Date(cached.createdAt).toISOString() });
    const payload = cached.payload as {
      clusters: ClusterAssignment[];
      unmatched: string[];
    };
    assignments = payload.clusters;
    unmatched = payload.unmatched;
    fromCache = true;
    if (assignments.length === 0) {
      warn('cache contains 0 clusters — invalidating and re-clustering', hash);
      await db.clusterCache.delete(hash);
      const result = await runClaudePass(uniqueKeywords, opts);
      assignments = result.clusters;
      unmatched = result.unmatched;
      totalChunks = result.totalChunks;
      usage = {
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        usd: actualCost(result.inputTokens, result.outputTokens, opts.model),
      };
      fromCache = false;
      await db.clusterCache.put({
        hash,
        projectId,
        payload: { clusters: assignments, unmatched },
        createdAt: Date.now(),
      });
    } else {
      // Signal "progress complete" pour les caches HIT (UI peut afficher 1/1).
      opts.onProgress?.({ chunk: 1, totalChunks: 1, kwsDone: uniqueCount, kwsTotal: uniqueCount });
    }
  } else {
    log('cache MISS — calling Claude');
    const result = await runClaudePass(uniqueKeywords, opts);
    assignments = result.clusters;
    unmatched = result.unmatched;
    totalChunks = result.totalChunks;
    usage = {
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      usd: actualCost(result.inputTokens, result.outputTokens, opts.model),
    };
    await db.clusterCache.put({
      hash,
      projectId,
      payload: { clusters: assignments, unmatched },
      createdAt: Date.now(),
    });
    log('cache stored');
  }

  log('parsed clusters', {
    count: assignments.length,
    unmatched: unmatched.length,
    sample: assignments.slice(0, 3).map((a) => ({ name: a.name, kws: a.keywords.length })),
  });

  if (assignments.length === 0) {
    errLog('Claude returned 0 valid clusters');
    throw new Error(
      'Le clustering n\'a produit aucun cluster valide. Réessaie avec "Force re-cluster" ou ouvre la console pour voir la réponse brute.',
    );
  }

  if (uniqueCount >= 30 && assignments.length === 1) {
    warn('only 1 cluster for many keywords — Claude may have over-grouped', {
      uniqueCount,
      clusterName: assignments[0]!.name,
    });
  }

  const persistResult = await persistClusters(projectId, assignments, unmatched);
  log('persisted', persistResult);

  const result: ClusterRunResult = {
    fromCache,
    clusterCount: assignments.length + (persistResult.unclusteredId ? 1 : 0),
    unmatchedCount: unmatched.length,
    unclusteredClusterId: persistResult.unclusteredId,
    uniqueKeywordCount: uniqueCount,
    persistedAssignments: persistResult.assignmentCount,
    totalChunks,
    usage,
  };
  log('done', { duration_ms: Math.round(performance.now() - t0), result });
  return result;
}

// ============================================================================
// Single-call or chunked dispatch
// ============================================================================

interface ClaudePassResult {
  clusters: ClusterAssignment[];
  unmatched: string[];
  inputTokens: number;
  outputTokens: number;
  totalChunks: number;
}

async function runClaudePass(
  sortedKeywords: Keyword[],
  opts: RunClusteringOptions,
): Promise<ClaudePassResult> {
  if (sortedKeywords.length <= CHUNK_THRESHOLD) {
    log('single-call mode', { kwCount: sortedKeywords.length });
    const kws = sortedKeywords.map((k) => k.keyword);
    opts.onProgress?.({ chunk: 1, totalChunks: 1, kwsDone: 0, kwsTotal: kws.length });
    const r = await callClaudeInitial(kws, opts);
    opts.onProgress?.({ chunk: 1, totalChunks: 1, kwsDone: kws.length, kwsTotal: kws.length });
    return { ...r, totalChunks: 1 };
  }
  return runChunkedClustering(sortedKeywords, opts);
}

async function runChunkedClustering(
  sortedKeywords: Keyword[],
  opts: RunClusteringOptions,
): Promise<ClaudePassResult> {
  const chunks: Keyword[][] = [];
  for (let i = 0; i < sortedKeywords.length; i += CHUNK_SIZE) {
    chunks.push(sortedKeywords.slice(i, i + CHUNK_SIZE));
  }
  const totalChunks = chunks.length;
  const kwsTotal = sortedKeywords.length;
  log('chunked mode', { totalChunks, chunkSize: CHUNK_SIZE, kwsTotal });

  const merged: Map<string, ClusterAssignment> = new Map();
  const allUnmatched: string[] = [];
  const failedChunks: number[] = [];
  let totalInput = 0;
  let totalOutput = 0;
  let kwsDone = 0;

  // 1er chunk : appel initial. Si ça échoue, c'est bloquant — on lève.
  opts.onProgress?.({ chunk: 1, totalChunks, kwsDone, kwsTotal });
  log(`chunk 1/${totalChunks} — initial`);
  const firstKws = chunks[0]!.map((k) => k.keyword);
  const first = await callClaudeInitial(firstKws, opts);
  totalInput += first.inputTokens;
  totalOutput += first.outputTokens;
  for (const c of first.clusters) {
    mergeIntoMap(merged, c);
  }
  allUnmatched.push(...first.unmatched);
  kwsDone += firstKws.length;
  opts.onProgress?.({ chunk: 1, totalChunks, kwsDone, kwsTotal });

  // Chunks suivants : avec contexte des clusters existants. Résilient : si
  // un chunk échoue, ses KWs vont en unmatched et on continue avec le suivant.
  const kwVolumeMap = new Map<string, number>();
  for (const k of sortedKeywords) {
    const norm = k.keyword.trim().toLowerCase();
    if (!kwVolumeMap.has(norm)) kwVolumeMap.set(norm, k.volume);
  }

  for (let i = 1; i < totalChunks; i++) {
    opts.onProgress?.({ chunk: i + 1, totalChunks, kwsDone, kwsTotal });
    log(`chunk ${i + 1}/${totalChunks} — followup`);
    const chunkKws = chunks[i]!.map((k) => k.keyword);
    try {
      const snapshot = buildSnapshot(merged, kwVolumeMap);
      const r = await callClaudeFollowup(chunkKws, snapshot, opts);
      totalInput += r.inputTokens;
      totalOutput += r.outputTokens;
      for (const c of r.clusters) {
        mergeIntoMap(merged, c);
      }
      allUnmatched.push(...r.unmatched);
    } catch (e) {
      errLog(`chunk ${i + 1}/${totalChunks} failed — KWs go to unmatched`, e);
      failedChunks.push(i + 1);
      // Tous les KWs du chunk en unmatched (seront mis dans "Non clusterisé").
      allUnmatched.push(...chunkKws);
    }
    kwsDone += chunkKws.length;
    opts.onProgress?.({ chunk: i + 1, totalChunks, kwsDone, kwsTotal });
  }

  if (failedChunks.length > 0) {
    warn(
      `${failedChunks.length}/${totalChunks} chunks ont échoué`,
      { failedChunks, totalUnmatched: allUnmatched.length },
    );
  }

  // Convertit le merged Map en array.
  const clusters = [...merged.values()];
  log('merge complete', {
    totalClusters: clusters.length,
    totalUnmatched: allUnmatched.length,
    totalInput,
    totalOutput,
  });

  return {
    clusters,
    unmatched: allUnmatched,
    inputTokens: totalInput,
    outputTokens: totalOutput,
    totalChunks,
  };
}

function mergeIntoMap(
  map: Map<string, ClusterAssignment>,
  cluster: ClusterAssignment,
): void {
  // Normalise le nom pour la dédup (case-insensitive, trim).
  const key = cluster.name.trim().toLowerCase();
  const existing = map.get(key);
  if (existing) {
    const seen = new Set(existing.keywords.map((k) => k.trim().toLowerCase()));
    for (const kw of cluster.keywords) {
      const norm = kw.trim().toLowerCase();
      if (!seen.has(norm)) {
        existing.keywords.push(kw);
        seen.add(norm);
      }
    }
  } else {
    map.set(key, { name: cluster.name, keywords: [...cluster.keywords] });
  }
}

function buildSnapshot(
  merged: Map<string, ClusterAssignment>,
  volumeMap: Map<string, number>,
): ExistingClusterSnapshot[] {
  const out: ExistingClusterSnapshot[] = [];
  for (const c of merged.values()) {
    // Trie les KWs du cluster par volume desc (pour les exemples).
    const sorted = [...c.keywords].sort((a, b) => {
      const va = volumeMap.get(a.trim().toLowerCase()) ?? 0;
      const vb = volumeMap.get(b.trim().toLowerCase()) ?? 0;
      return vb - va;
    });
    out.push({ name: c.name, examples: sorted.slice(0, 4) });
  }
  // Tri des clusters par taille desc (les + gros en premier dans le prompt).
  out.sort((a, b) => b.examples.length - a.examples.length);
  return out;
}

// ============================================================================
// Claude calls
// ============================================================================

async function callClaudeInitial(
  keywords: string[],
  opts: RunClusteringOptions,
): Promise<{
  clusters: ClusterAssignment[];
  unmatched: string[];
  inputTokens: number;
  outputTokens: number;
}> {
  const userMessage = buildUserMessage(keywords);
  return callClaude(SYSTEM_PROMPT, userMessage, keywords, opts, 'initial');
}

async function callClaudeFollowup(
  keywords: string[],
  existing: ExistingClusterSnapshot[],
  opts: RunClusteringOptions,
): Promise<{
  clusters: ClusterAssignment[];
  unmatched: string[];
  inputTokens: number;
  outputTokens: number;
}> {
  const userMessage = buildFollowupUserMessage(keywords, existing);
  return callClaude(FOLLOWUP_SYSTEM_PROMPT, userMessage, keywords, opts, 'followup');
}

async function callClaude(
  systemPrompt: string,
  userMessage: string,
  keywordsInChunk: string[],
  opts: RunClusteringOptions,
  label: string,
): Promise<{
  clusters: ClusterAssignment[];
  unmatched: string[];
  inputTokens: number;
  outputTokens: number;
}> {
  log(`Claude request (${label})`, {
    keywordCount: keywordsInChunk.length,
    userMessageChars: userMessage.length,
    systemChars: systemPrompt.length,
  });

  const client = createClaudeClient({ apiKey: opts.apiKey });
  let response;
  try {
    response = await client.messages.create({
      model: opts.model,
      max_tokens: MAX_TOKENS,
      temperature: 0.3,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });
  } catch (e) {
    errLog(`Claude API call threw (${label})`, e);
    const msg = e instanceof Error ? e.message : 'Erreur inconnue';
    throw new Error(`Appel Claude échoué : ${msg}`);
  }

  log(`Claude response (${label})`, {
    stop_reason: response.stop_reason,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  });

  if (response.stop_reason === 'max_tokens') {
    warn(
      `Claude hit max_tokens on ${label} chunk — réponse probablement tronquée`,
      { keywordsInChunk: keywordsInChunk.length },
    );
  }

  const textBlock = response.content.find((c) => c.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    errLog(`no text block in response (${label})`, response.content);
    throw new Error('Pas de réponse texte reçue de Claude');
  }
  log(`Claude raw text first 500 (${label}):`, textBlock.text.slice(0, 500));

  let parsed;
  try {
    parsed = parseClusterResponse(textBlock.text, keywordsInChunk);
  } catch (e) {
    errLog(`parse failed (${label})`, e);
    errLog('full response text:', textBlock.text);
    throw e;
  }

  return {
    clusters: parsed.clusters,
    unmatched: parsed.unmatched,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

// ============================================================================
// Persistence
// ============================================================================

function dedupeByKeyword(keywords: Keyword[]): Keyword[] {
  const seen = new Map<string, Keyword>();
  for (const k of keywords) {
    const key = k.keyword.trim().toLowerCase();
    if (!seen.has(key)) seen.set(key, k);
  }
  return [...seen.values()];
}

interface PersistResult {
  unclusteredId: string | null;
  assignmentCount: number;
  newClusterCount: number;
  totalKeywords: number;
  matchedKeywords: number;
}

async function persistClusters(
  projectId: string,
  assignments: ClusterAssignment[],
  unmatched: string[],
): Promise<PersistResult> {
  return db.transaction('rw', [db.clusters, db.keywords], async () => {
    await db.clusters.where('projectId').equals(projectId).delete();
    const allKws = await db.keywords.where('projectId').equals(projectId).toArray();

    const kwIndex = new Map<string, Keyword[]>();
    for (const k of allKws) {
      const norm = k.keyword.trim().toLowerCase();
      const list = kwIndex.get(norm);
      if (list) list.push(k);
      else kwIndex.set(norm, [k]);
    }

    const newClusters: Cluster[] = [];
    const updates: { id: string; clusterId: string }[] = [];
    const matched = new Set<string>();

    for (const a of assignments) {
      const cluster: Cluster = {
        id: crypto.randomUUID(),
        projectId,
        name: a.name,
        parentId: null,
      };
      newClusters.push(cluster);
      for (const kw of a.keywords) {
        const norm = kw.trim().toLowerCase();
        const records = kwIndex.get(norm) ?? [];
        if (records.length === 0) {
          warn(`assignment KW "${kw}" not found in DB index`);
          continue;
        }
        for (const r of records) {
          updates.push({ id: r.id, clusterId: cluster.id });
          matched.add(r.id);
        }
      }
    }

    let unclusteredId: string | null = null;
    if (unmatched.length > 0) {
      const unclustered: Cluster = {
        id: crypto.randomUUID(),
        projectId,
        name: UNCLUSTERED_LABEL,
        parentId: null,
      };
      newClusters.push(unclustered);
      unclusteredId = unclustered.id;
      for (const kw of unmatched) {
        const records = kwIndex.get(kw.trim().toLowerCase()) ?? [];
        for (const r of records) {
          updates.push({ id: r.id, clusterId: unclustered.id });
          matched.add(r.id);
        }
      }
    }

    // Sérialise les updates pour éviter toute race condition.
    for (const k of allKws) {
      await db.keywords.update(k.id, { clusterId: null });
    }
    await db.clusters.bulkAdd(newClusters);
    for (const u of updates) {
      await db.keywords.update(u.id, { clusterId: u.clusterId });
    }

    return {
      unclusteredId,
      assignmentCount: updates.length,
      newClusterCount: newClusters.length,
      totalKeywords: allKws.length,
      matchedKeywords: matched.size,
    };
  });
}

export async function uniqueKeywordCount(projectId: string): Promise<number> {
  const all = await db.keywords.where('projectId').equals(projectId).toArray();
  const set = new Set(all.map((k) => k.keyword.trim().toLowerCase()));
  return set.size;
}

// ============================================================================
// Cache management
// ============================================================================

export async function getCacheStats(): Promise<{ count: number; bytes: number }> {
  const all = await db.clusterCache.toArray();
  let bytes = 0;
  for (const e of all) {
    bytes += JSON.stringify(e.payload).length;
  }
  return { count: all.length, bytes };
}

export async function clearAllClusterCache(): Promise<number> {
  const all = await db.clusterCache.toArray();
  await db.clusterCache.clear();
  log('cache cleared', { count: all.length });
  return all.length;
}

export async function clearProjectClusterCache(projectId: string): Promise<number> {
  const matching = await db.clusterCache
    .where('projectId')
    .equals(projectId)
    .toArray();
  for (const m of matching) await db.clusterCache.delete(m.hash);
  log('project cache cleared', { projectId, count: matching.length });
  return matching.length;
}
