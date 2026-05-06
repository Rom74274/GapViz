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
  usage: {
    inputTokens: number;
    outputTokens: number;
    usd: number;
  } | null;
}

export interface RunClusteringOptions {
  apiKey: string;
  model: string;
}

const UNCLUSTERED_LABEL = 'Non clusterisé';

export async function runClustering(
  projectId: string,
  opts: RunClusteringOptions,
): Promise<ClusterRunResult> {
  const allKeywords = await db.keywords
    .where('projectId')
    .equals(projectId)
    .toArray();

  if (allKeywords.length === 0) {
    throw new Error(
      'Aucun mot-clé dans ce projet — importe au moins un CSV avant de clusteriser.',
    );
  }

  const uniqueKeywords = dedupeByKeyword(allKeywords);
  const hash = await hashKeywordSet(uniqueKeywords.map((k) => k.keyword));

  const cached = await db.clusterCache.get(hash);
  let assignments: ClusterAssignment[];
  let unmatched: string[];
  let usage: ClusterRunResult['usage'] = null;
  let fromCache = false;

  if (cached) {
    const payload = cached.payload as {
      clusters: ClusterAssignment[];
      unmatched: string[];
    };
    assignments = payload.clusters;
    unmatched = payload.unmatched;
    fromCache = true;
  } else {
    const result = await callClaude(
      uniqueKeywords.map((k) => k.keyword),
      opts,
    );
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
  }

  const unclusteredClusterId = await persistClusters(
    projectId,
    assignments,
    unmatched,
  );

  return {
    fromCache,
    clusterCount: assignments.length + (unclusteredClusterId ? 1 : 0),
    unmatchedCount: unmatched.length,
    unclusteredClusterId,
    usage,
  };
}

async function callClaude(
  keywords: string[],
  opts: RunClusteringOptions,
): Promise<{
  clusters: ClusterAssignment[];
  unmatched: string[];
  inputTokens: number;
  outputTokens: number;
}> {
  const client = createClaudeClient({ apiKey: opts.apiKey });

  const response = await client.messages.create({
    model: opts.model,
    max_tokens: 8192,
    temperature: 0.3,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserMessage(keywords) }],
  });

  const textBlock = response.content.find((c) => c.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('Pas de réponse texte reçue de Claude');
  }

  const parsed = parseClusterResponse(textBlock.text, keywords);

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

async function persistClusters(
  projectId: string,
  assignments: ClusterAssignment[],
  unmatched: string[],
): Promise<string | null> {
  return db.transaction(
    'rw',
    [db.clusters, db.keywords],
    async () => {
      // On supprime les clusters existants du projet et on remet à null
      // les clusterId des keywords. Idempotent.
      await db.clusters.where('projectId').equals(projectId).delete();
      const allKws = await db.keywords
        .where('projectId')
        .equals(projectId)
        .toArray();

      // Index keyword.text → liste de keyword records (multi-source).
      const kwIndex = new Map<string, Keyword[]>();
      for (const k of allKws) {
        const norm = k.keyword.trim().toLowerCase();
        const list = kwIndex.get(norm);
        if (list) list.push(k);
        else kwIndex.set(norm, [k]);
      }

      const newClusters: Cluster[] = [];
      const updates: { id: string; clusterId: string }[] = [];

      for (const a of assignments) {
        const cluster: Cluster = {
          id: crypto.randomUUID(),
          projectId,
          name: a.name,
          parentId: null,
        };
        newClusters.push(cluster);
        for (const kw of a.keywords) {
          const records = kwIndex.get(kw.trim().toLowerCase()) ?? [];
          for (const r of records) updates.push({ id: r.id, clusterId: cluster.id });
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
          for (const r of records) updates.push({ id: r.id, clusterId: unclustered.id });
        }
      }

      // Reset puis applique les updates.
      await Promise.all(allKws.map((k) => db.keywords.update(k.id, { clusterId: null })));
      await db.clusters.bulkAdd(newClusters);
      await Promise.all(
        updates.map((u) => db.keywords.update(u.id, { clusterId: u.clusterId })),
      );

      return unclusteredId;
    },
  );
}

export async function uniqueKeywordCount(projectId: string): Promise<number> {
  const all = await db.keywords.where('projectId').equals(projectId).toArray();
  const set = new Set(all.map((k) => k.keyword.trim().toLowerCase()));
  return set.size;
}
