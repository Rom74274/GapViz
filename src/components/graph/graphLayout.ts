import type { Cluster, Competitor, Intent, Keyword } from '@/lib/db';

// ---------------------------------------------------------------------------
// Node + link types
// ---------------------------------------------------------------------------

export type NodeKind = 'center' | 'cluster' | 'keyword';

export interface NodeSource {
  domain: string;
  label: string;
  color: string;
  isMe: boolean;
  position: number | null;
  url: string | null;
}

interface BaseNode {
  id: string;
  kind: NodeKind;
  radius: number;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
}

export interface CenterNode extends BaseNode {
  kind: 'center';
  domain: string;
  label: string;
  color: string;
}

export interface ClusterMetaNode extends BaseNode {
  kind: 'cluster';
  clusterId: string;
  name: string;
  totalVolume: number;
  kwCount: number;
  isMyCovered: boolean;
  myKwCount: number;
  competitorOnlyKwCount: number;
  manualX?: number | null;
  manualY?: number | null;
}

export interface KeywordNode extends BaseNode {
  kind: 'keyword';
  keyword: string;
  volume: number;
  kd: number | null;
  cpc: number | null;
  intent: Intent[];
  clusterId: string;
  clusterName: string;
  sources: NodeSource[];
  isGap: boolean;
  primaryColor: string; // 1ʳᵉ source utilisée pour halos / glow
  branded: boolean; // au moins une source dit "Branded = true"
  traffic: number | null; // max trafic estimé parmi les sources
  serpFeatures: string | null; // 1ʳᵉ source non-null
}

export type GraphNode = CenterNode | ClusterMetaNode | KeywordNode;

export type LinkKind =
  | 'center-cluster'
  | 'cluster-keyword'
  | 'keyword-keyword'
  | 'cluster-cluster';

export interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  kind: LinkKind;
  color: string;
  weight?: number;
}

export interface BuiltGraph {
  nodes: GraphNode[];
  links: GraphLink[];
  centerNode: CenterNode;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CENTER_ID = '__center__';
const CLUSTER_PREFIX = '__cluster__:';
const KEYWORD_PREFIX = '__kw__:';
const UNCLUSTERED_KEY = '__unclustered__';
const UNCLUSTERED_NAME = 'Sans cluster';

const KW_MIN_RADIUS = 2;
const KW_MAX_RADIUS = 35;
const CLUSTER_MIN_RADIUS = 14;
const CLUSTER_MAX_RADIUS = 32;
const CENTER_RADIUS = 42;

const INTER_CLUSTER_THRESHOLD = 2;
const INTER_CLUSTER_MAX_PER_CLUSTER = 3;

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export function buildGraph({
  keywords,
  competitors,
  clusters,
  myDomain,
  projectName,
}: {
  keywords: Keyword[];
  competitors: Competitor[];
  clusters: Cluster[];
  myDomain: string;
  projectName: string;
}): BuiltGraph {
  const competitorByDomain = new Map(competitors.map((c) => [c.domain, c]));
  const clusterById = new Map(clusters.map((c) => [c.id, c]));
  const meCompetitor = competitors.find((c) => c.isMe);

  const centerNode: CenterNode = {
    id: CENTER_ID,
    kind: 'center',
    radius: CENTER_RADIUS,
    domain: myDomain,
    label: meCompetitor?.label || projectName,
    color: meCompetitor?.color || '#3b82f6',
  };

  // Group KWs by normalized text.
  const kwGroups = new Map<string, Keyword[]>();
  for (const k of keywords) {
    const key = k.keyword.trim().toLowerCase();
    const list = kwGroups.get(key);
    if (list) list.push(k);
    else kwGroups.set(key, [k]);
  }

  const allVolumes: number[] = [];
  for (const list of kwGroups.values()) {
    allVolumes.push(Math.max(...list.map((k) => k.volume)));
  }
  const maxVolume = Math.max(1, ...allVolumes);

  const kwsByCluster = new Map<string, KeywordNode[]>();
  const keywordNodes: KeywordNode[] = [];

  for (const [, group] of kwGroups) {
    const first = group[0]!;
    const sources = mergeSources(group, competitorByDomain);
    const volume = Math.max(...group.map((k) => k.volume));
    const clusterId = first.clusterId ?? UNCLUSTERED_KEY;
    const clusterName =
      clusterById.get(first.clusterId ?? '')?.name ?? UNCLUSTERED_NAME;
    const isGap = !sources.some((s) => s.isMe);
    const primaryColor = pickPrimaryColor(sources);
    const branded = group.some((k) => k.branded === true);
    const trafficValues = group
      .map((k) => k.traffic)
      .filter((t): t is number => typeof t === 'number');
    const traffic = trafficValues.length > 0 ? Math.max(...trafficValues) : null;
    const serpFeatures =
      group.find((k) => k.serpFeatures && k.serpFeatures.trim() !== '')?.serpFeatures ?? null;

    const node: KeywordNode = {
      id: `${KEYWORD_PREFIX}${first.keyword.trim().toLowerCase()}`,
      kind: 'keyword',
      keyword: first.keyword,
      volume,
      kd: first.kd,
      cpc: first.cpc,
      intent: first.intent,
      clusterId,
      clusterName,
      sources,
      isGap,
      primaryColor,
      branded,
      traffic,
      serpFeatures,
      radius: scaleRadius(volume, maxVolume, KW_MIN_RADIUS, KW_MAX_RADIUS, 'pow', 0.6),
    };
    keywordNodes.push(node);
    const list = kwsByCluster.get(clusterId);
    if (list) list.push(node);
    else kwsByCluster.set(clusterId, [node]);
  }

  // Cluster meta-nodes.
  const maxClusterSize = Math.max(
    1,
    ...[...kwsByCluster.values()].map((l) => l.length),
  );
  const clusterMetaNodes: ClusterMetaNode[] = [];
  for (const [clusterId, kws] of kwsByCluster) {
    const totalVolume = kws.reduce((s, k) => s + k.volume, 0);
    const myKws = kws.filter((k) => !k.isGap);
    const competitorOnlyKws = kws.filter((k) => k.isGap);
    const isMyCovered = myKws.length > 0;
    const name =
      clusterId === UNCLUSTERED_KEY
        ? UNCLUSTERED_NAME
        : (clusterById.get(clusterId)?.name ?? UNCLUSTERED_NAME);
    const clusterRecord = clusterById.get(clusterId);
    clusterMetaNodes.push({
      id: `${CLUSTER_PREFIX}${clusterId}`,
      kind: 'cluster',
      clusterId,
      name,
      totalVolume,
      kwCount: kws.length,
      myKwCount: myKws.length,
      competitorOnlyKwCount: competitorOnlyKws.length,
      isMyCovered,
      manualX: clusterRecord?.manualX ?? null,
      manualY: clusterRecord?.manualY ?? null,
      radius: scaleRadius(
        kws.length,
        maxClusterSize,
        CLUSTER_MIN_RADIUS,
        CLUSTER_MAX_RADIUS,
        'pow',
        0.6,
      ),
    });
  }

  const links: GraphLink[] = [];

  // 1) center → cluster
  for (const c of clusterMetaNodes) {
    links.push({
      source: CENTER_ID,
      target: c.id,
      kind: 'center-cluster',
      color: '#e6e6f0',
    });
  }

  // 2) cluster → keywords
  for (const c of clusterMetaNodes) {
    const kws = kwsByCluster.get(c.clusterId) ?? [];
    for (const kw of kws) {
      links.push({
        source: c.id,
        target: kw.id,
        kind: 'cluster-keyword',
        color: kw.primaryColor,
      });
    }
  }

  // 3) intra-cluster keyword mesh.
  for (const c of clusterMetaNodes) {
    const kws = (kwsByCluster.get(c.clusterId) ?? []).slice();
    if (kws.length < 2) continue;
    kws.sort((a, b) => b.volume - a.volume);
    const N = kws.length;
    const neighborCount = N <= 4 ? 1 : 2;
    for (let i = 0; i < N; i++) {
      for (let j = 1; j <= neighborCount; j++) {
        const next = kws[(i + j) % N]!;
        const cur = kws[i]!;
        if (cur.id === next.id) continue;
        links.push({
          source: cur.id,
          target: next.id,
          kind: 'keyword-keyword',
          color: cur.primaryColor,
        });
      }
    }
  }

  // 4) inter-cluster links basés sur les domaines partagés.
  links.push(...buildInterClusterLinks(clusterMetaNodes, kwsByCluster));

  return {
    nodes: [centerNode, ...clusterMetaNodes, ...keywordNodes],
    links,
    centerNode,
  };
}

// ---------------------------------------------------------------------------
// Inter-cluster links
// ---------------------------------------------------------------------------

function buildInterClusterLinks(
  clusterMetas: ClusterMetaNode[],
  kwsByCluster: Map<string, KeywordNode[]>,
): GraphLink[] {
  const domainsByCluster = new Map<string, Set<string>>();
  for (const c of clusterMetas) {
    const set = new Set<string>();
    const kws = kwsByCluster.get(c.clusterId) ?? [];
    for (const k of kws) {
      for (const s of k.sources) set.add(s.domain);
    }
    domainsByCluster.set(c.id, set);
  }

  // Compute weight (= shared domains) for every cluster pair, threshold + dedup.
  type Candidate = { a: ClusterMetaNode; b: ClusterMetaNode; weight: number };
  const candidates: Candidate[] = [];
  for (let i = 0; i < clusterMetas.length; i++) {
    for (let j = i + 1; j < clusterMetas.length; j++) {
      const a = clusterMetas[i]!;
      const b = clusterMetas[j]!;
      const da = domainsByCluster.get(a.id)!;
      const db_ = domainsByCluster.get(b.id)!;
      let shared = 0;
      for (const d of da) if (db_.has(d)) shared++;
      if (shared >= INTER_CLUSTER_THRESHOLD) {
        candidates.push({ a, b, weight: shared });
      }
    }
  }

  // Limite par cluster (top N) — on collecte le degré, on ne pousse que si
  // chacun des deux clusters n'a pas dépassé sa quota.
  candidates.sort((x, y) => y.weight - x.weight);
  const degree = new Map<string, number>();
  const links: GraphLink[] = [];
  for (const { a, b, weight } of candidates) {
    const da = degree.get(a.id) ?? 0;
    const db_ = degree.get(b.id) ?? 0;
    if (da >= INTER_CLUSTER_MAX_PER_CLUSTER || db_ >= INTER_CLUSTER_MAX_PER_CLUSTER) {
      continue;
    }
    links.push({
      source: a.id,
      target: b.id,
      kind: 'cluster-cluster',
      color: '#9ca3c4',
      weight,
    });
    degree.set(a.id, da + 1);
    degree.set(b.id, db_ + 1);
  }
  return links;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pickPrimaryColor(sources: NodeSource[]): string {
  if (sources.length === 0) return '#6a6a8a';
  const me = sources.find((s) => s.isMe);
  if (me) return me.color;
  const ranked = sources
    .filter((s) => s.position !== null)
    .sort((a, b) => (a.position ?? 999) - (b.position ?? 999));
  if (ranked.length > 0) return ranked[0]!.color;
  return sources[0]!.color;
}

function mergeSources(
  group: Keyword[],
  competitorByDomain: Map<string, Competitor>,
): NodeSource[] {
  const seen = new Map<string, NodeSource>();
  for (const k of group) {
    const c = competitorByDomain.get(k.sourceDomain);
    const source: NodeSource = {
      domain: k.sourceDomain,
      label: c?.label ?? k.sourceDomain,
      color: c?.color ?? '#6a6a8a',
      isMe: c?.isMe ?? false,
      position: k.position,
      url: k.url,
    };
    const existing = seen.get(source.domain);
    if (
      !existing ||
      (source.position && (!existing.position || source.position < existing.position))
    ) {
      seen.set(source.domain, source);
    }
  }
  return [...seen.values()].sort((a, b) => {
    if (a.isMe !== b.isMe) return a.isMe ? -1 : 1;
    return a.label.localeCompare(b.label);
  });
}

export type ScaleMode = 'linear' | 'log' | 'pow';

export function scaleRadius(
  value: number,
  maxValue: number,
  min: number,
  max: number,
  mode: ScaleMode = 'linear',
  power = 0.5,
): number {
  if (value <= 0 || maxValue <= 0) return min;
  let t: number;
  if (mode === 'log') {
    const lv = Math.log10(value + 1);
    const lmax = Math.log10(maxValue + 1);
    t = lmax > 0 ? lv / lmax : 0;
  } else if (mode === 'pow') {
    t = Math.pow(value / maxValue, power);
  } else {
    t = value / maxValue;
  }
  return min + (max - min) * Math.max(0, Math.min(1, t));
}

// Compatibilité avec l'API précédente.
export function radiusFromVolume(volume: number, maxVolume: number): number {
  return scaleRadius(volume, maxVolume, 4, 26, 'log');
}

export function isClickable(node: GraphNode): boolean {
  return node.kind !== 'center';
}
