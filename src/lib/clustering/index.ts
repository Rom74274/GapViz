import { db, type Cluster, type Keyword } from '@/lib/db';
import { createClaudeClient } from '@/lib/claude';
import { SYSTEM_PROMPT, buildUserMessage } from './prompt';
import { hashKeywordSet } from './hash';
import { parseClusterResponse, type ClusterAssignment } from './parse';
import { actualCost } from './cost';

export type { CostEstimate } from './cost';
export { estimateClusteringCost, formatUSD } from './cost';
export { hashKeywordSet };

export interface ClusterRunResult {
  fromCache: boolean;
  clusterCount: number;
  unmatchedCount: number;
  unclusteredClusterId: string | null;
  uniqueKeywordCount: number;
  persistedAssignments: number;
  usage: {
    inputTokens: number;
    outputTokens: number;
    usd: number;
  } | null;
}

export interface RunClusteringOptions {
  apiKey: string;
  model: string;
  force?: boolean; // ignore le cache + relance l'appel API
}

const UNCLUSTERED_LABEL = 'Non clusterisé';

const log = (...args: unknown[]) => console.log('[clustering]', ...args);
const warn = (...args: unknown[]) => console.warn('[clustering]', ...args);
const err = (...args: unknown[]) => console.error('[clustering]', ...args);

export async function runClustering(
  projectId: string,
  opts: RunClusteringOptions,
): Promise<ClusterRunResult> {
  const t0 = performance.now();
  log('start', { projectId, model: opts.model, force: !!opts.force });

  const allKeywords = await db.keywords
    .where('projectId')
    .equals(projectId)
    .toArray();
  log('loaded raw keywords', { count: allKeywords.length });

  if (allKeywords.length === 0) {
    throw new Error(
      'Aucun mot-clé dans ce projet — importe au moins un CSV avant de clusteriser.',
    );
  }

  const uniqueKeywords = dedupeByKeyword(allKeywords);
  const uniqueCount = uniqueKeywords.length;
  log('deduped unique keywords', { unique: uniqueCount, raw: allKeywords.length });

  const hash = await hashKeywordSet(uniqueKeywords.map((k) => k.keyword));
  log('keyword set hash', { hash });

  const cached = opts.force ? undefined : await db.clusterCache.get(hash);
  let assignments: ClusterAssignment[];
  let unmatched: string[];
  let usage: ClusterRunResult['usage'] = null;
  let fromCache = false;

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
      warn(
        'cache contains 0 clusters — invalidating and re-calling Claude',
        hash,
      );
      await db.clusterCache.delete(hash);
      const result = await callClaudeWithLog(uniqueKeywords.map((k) => k.keyword), opts);
      assignments = result.clusters;
      unmatched = result.unmatched;
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
    }
  } else {
    log('cache MISS — calling Claude');
    const result = await callClaudeWithLog(uniqueKeywords.map((k) => k.keyword), opts);
    assignments = result.clusters;
    unmatched = result.unmatched;
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
    err('Claude returned 0 valid clusters');
    throw new Error(
      'Le clustering n\'a produit aucun cluster valide. Le prompt ou la réponse Claude est probablement en cause. Réessaie avec "Force re-cluster" ou ouvre la console pour voir la réponse brute.',
    );
  }

  if (uniqueCount >= 30 && assignments.length === 1) {
    warn(
      'only 1 cluster for many keywords — Claude may have over-grouped',
      { uniqueCount, clusterName: assignments[0]!.name },
    );
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
    usage,
  };
  log('done', { duration_ms: Math.round(performance.now() - t0), result });
  return result;
}

async function callClaudeWithLog(
  keywords: string[],
  opts: RunClusteringOptions,
): Promise<{
  clusters: ClusterAssignment[];
  unmatched: string[];
  inputTokens: number;
  outputTokens: number;
}> {
  const userMessage = buildUserMessage(keywords);
  log('Claude request', {
    model: opts.model,
    keywordCount: keywords.length,
    userMessageChars: userMessage.length,
    systemChars: SYSTEM_PROMPT.length,
  });

  const client = createClaudeClient({ apiKey: opts.apiKey });

  let response;
  try {
    response = await client.messages.create({
      model: opts.model,
      max_tokens: 8192,
      temperature: 0.3,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });
  } catch (e) {
    err('Claude API call threw', e);
    const msg = e instanceof Error ? e.message : 'Erreur inconnue';
    throw new Error(`Appel Claude échoué : ${msg}`);
  }

  log('Claude response', {
    stop_reason: response.stop_reason,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  });

  const textBlock = response.content.find((c) => c.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    err('no text block in response', response.content);
    throw new Error('Pas de réponse texte reçue de Claude');
  }

  log('Claude raw text (first 500 chars):', textBlock.text.slice(0, 500));

  let parsed;
  try {
    parsed = parseClusterResponse(textBlock.text, keywords);
  } catch (e) {
    err('parse failed', e);
    err('full response text:', textBlock.text);
    throw e;
  }

  return {
    clusters: parsed.clusters,
    unmatched: parsed.unmatched,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

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

    // Reset clusterId à null pour tous les KWs du projet, puis applique les
    // updates. On serialize les updates pour éviter toute race.
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

// ---------------------------------------------------------------------------
// Cache management
// ---------------------------------------------------------------------------

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
