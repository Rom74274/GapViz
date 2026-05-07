import type { Cluster, Competitor, Keyword } from '@/lib/db';

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
  // Mutated par d3-force.
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
}

export interface KeywordNode extends BaseNode {
  kind: 'keyword';
  keyword: string;
  volume: number;
  kd: number | null;
  cpc: number | null;
  intent: string[];
  clusterId: string;
  clusterName: string;
  sources: NodeSource[];
  isGap: boolean; // pas positionné par mon site
}

export type GraphNode = CenterNode | ClusterMetaNode | KeywordNode;

export type LinkKind = 'center-cluster' | 'cluster-keyword' | 'keyword-keyword';

export interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  kind: LinkKind;
  color: string;
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

const KW_MIN_RADIUS = 3;
const KW_MAX_RADIUS = 24;
const CLUSTER_MIN_RADIUS = 16;
const CLUSTER_MAX_RADIUS = 32;
const CENTER_RADIUS = 38;

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

  // Centre = mon site.
  const centerNode: CenterNode = {
    id: CENTER_ID,
    kind: 'center',
    radius: CENTER_RADIUS,
    domain: myDomain,
    label: meCompetitor?.label || projectName,
    color: meCompetitor?.color || '#3b82f6',
  };

  // Groupe les KWs par texte normalisé (multi-source merge).
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

  // Clusters → keywords mapping (et compteurs).
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
      radius: scaleRadius(volume, maxVolume, KW_MIN_RADIUS, KW_MAX_RADIUS, true),
    };
    keywordNodes.push(node);
    const list = kwsByCluster.get(clusterId);
    if (list) list.push(node);
    else kwsByCluster.set(clusterId, [node]);
  }

  // Cluster meta-nodes.
  const clusterMetaNodes: ClusterMetaNode[] = [];
  for (const [clusterId, kws] of kwsByCluster) {
    const totalVolume = kws.reduce((s, k) => s + k.volume, 0);
    const name =
      clusterId === UNCLUSTERED_KEY
        ? UNCLUSTERED_NAME
        : (clusterById.get(clusterId)?.name ?? UNCLUSTERED_NAME);
    clusterMetaNodes.push({
      id: `${CLUSTER_PREFIX}${clusterId}`,
      kind: 'cluster',
      clusterId,
      name,
      totalVolume,
      kwCount: kws.length,
      radius: scaleRadius(
        kws.length,
        Math.max(1, ...[...kwsByCluster.values()].map((l) => l.length)),
        CLUSTER_MIN_RADIUS,
        CLUSTER_MAX_RADIUS,
        false,
      ),
    });
  }

  // Liens.
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
        color: centerNode.color,
      });
    }
  }

  // 3) keyword ↔ keyword (intra-cluster mesh, 2 voisins par KW dans l'ordre du volume)
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
          color: '#e6e6f0',
        });
      }
    }
  }

  return {
    nodes: [centerNode, ...clusterMetaNodes, ...keywordNodes],
    links,
    centerNode,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

export function scaleRadius(
  value: number,
  maxValue: number,
  min: number,
  max: number,
  log: boolean,
): number {
  if (value <= 0 || maxValue <= 0) return min;
  let t: number;
  if (log) {
    const lv = Math.log10(value + 1);
    const lmax = Math.log10(maxValue + 1);
    t = lmax > 0 ? lv / lmax : 0;
  } else {
    t = value / maxValue;
  }
  return min + (max - min) * Math.max(0, Math.min(1, t));
}

// Rétrocompat avec les tests existants (V1 simple).
export function radiusFromVolume(volume: number, maxVolume: number): number {
  return scaleRadius(volume, maxVolume, 4, 26, true);
}

// Sera utilisé par le hit-testing pour exclure le centre des cibles cliquables
// (le centre n'a pas de sidebar dédiée).
export function isClickable(node: GraphNode): boolean {
  return node.kind !== 'center';
}
