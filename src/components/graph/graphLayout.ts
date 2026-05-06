import type { Cluster, Competitor, Keyword } from '@/lib/db';

export interface NodeSource {
  domain: string;
  label: string;
  color: string;
  isMe: boolean;
  position: number | null;
  url: string | null;
}

export interface GraphNode {
  id: string;
  keyword: string;
  volume: number;
  kd: number | null;
  cpc: number | null;
  intent: string[];
  clusterId: string;
  clusterName: string;
  radius: number;
  sources: NodeSource[];
  // Mutated par d3-force.
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
}

export interface ClusterAnchor {
  x: number;
  y: number;
}

const UNCLUSTERED_KEY = '__unclustered__';
const UNCLUSTERED_NAME = 'Sans cluster';

export function buildGraphNodes({
  keywords,
  competitors,
  clusters,
}: {
  keywords: Keyword[];
  competitors: Competitor[];
  clusters: Cluster[];
}): GraphNode[] {
  const competitorByDomain = new Map(competitors.map((c) => [c.domain, c]));
  const clusterById = new Map(clusters.map((c) => [c.id, c]));

  const groups = new Map<string, Keyword[]>();
  for (const k of keywords) {
    const key = k.keyword.trim().toLowerCase();
    const list = groups.get(key);
    if (list) list.push(k);
    else groups.set(key, [k]);
  }

  const nodes: GraphNode[] = [];
  const volumes: number[] = [];

  for (const [, kws] of groups) {
    volumes.push(Math.max(...kws.map((k) => k.volume)));
  }
  const maxVolume = Math.max(1, ...volumes);

  for (const [, kws] of groups) {
    const first = kws[0]!;
    const sources: NodeSource[] = kws.map((k) => {
      const c = competitorByDomain.get(k.sourceDomain);
      return {
        domain: k.sourceDomain,
        label: c?.label ?? k.sourceDomain,
        color: c?.color ?? '#6a6a8a',
        isMe: c?.isMe ?? false,
        position: k.position,
        url: k.url,
      };
    });

    const volume = Math.max(...kws.map((k) => k.volume));
    const clusterId = first.clusterId ?? UNCLUSTERED_KEY;
    const clusterName =
      clusterById.get(first.clusterId ?? '')?.name ?? UNCLUSTERED_NAME;

    nodes.push({
      id: first.keyword.trim().toLowerCase(),
      keyword: first.keyword,
      volume,
      kd: first.kd,
      cpc: first.cpc,
      intent: first.intent,
      clusterId,
      clusterName,
      radius: radiusFromVolume(volume, maxVolume),
      sources: dedupeSources(sources),
    });
  }

  return nodes;
}

function dedupeSources(sources: NodeSource[]): NodeSource[] {
  const seen = new Map<string, NodeSource>();
  for (const s of sources) {
    const existing = seen.get(s.domain);
    if (!existing || (s.position && (!existing.position || s.position < existing.position))) {
      seen.set(s.domain, s);
    }
  }
  // Mon site d'abord, puis tri par label.
  return [...seen.values()].sort((a, b) => {
    if (a.isMe !== b.isMe) return a.isMe ? -1 : 1;
    return a.label.localeCompare(b.label);
  });
}

const MIN_RADIUS = 4;
const MAX_RADIUS = 26;

export function radiusFromVolume(volume: number, maxVolume: number): number {
  if (volume <= 0) return MIN_RADIUS;
  const lv = Math.log10(volume + 1);
  const lmax = Math.log10(maxVolume + 1);
  const t = lmax > 0 ? lv / lmax : 0;
  return MIN_RADIUS + (MAX_RADIUS - MIN_RADIUS) * t;
}

// Place les ancres de chaque cluster sur un cercle autour du centre.
export function computeClusterAnchors(
  clusterIds: string[],
  width: number,
  height: number,
): Map<string, ClusterAnchor> {
  const map = new Map<string, ClusterAnchor>();
  const cx = width / 2;
  const cy = height / 2;
  const N = clusterIds.length;
  if (N === 0) return map;
  if (N === 1) {
    map.set(clusterIds[0]!, { x: cx, y: cy });
    return map;
  }
  // Rayon adapté à l'espace dispo.
  const radius = Math.min(width, height) * 0.35;
  for (let i = 0; i < N; i++) {
    const angle = (i / N) * Math.PI * 2 - Math.PI / 2; // démarre en haut
    map.set(clusterIds[i]!, {
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    });
  }
  return map;
}

export function uniqueClusterIds(nodes: GraphNode[]): string[] {
  const set = new Set<string>();
  for (const n of nodes) set.add(n.clusterId);
  return [...set];
}

export function clusterCentroids(
  nodes: GraphNode[],
): Map<string, { x: number; y: number; name: string }> {
  const acc = new Map<
    string,
    { x: number; y: number; count: number; name: string }
  >();
  for (const n of nodes) {
    if (n.x === undefined || n.y === undefined) continue;
    const cur = acc.get(n.clusterId);
    if (cur) {
      cur.x += n.x;
      cur.y += n.y;
      cur.count += 1;
    } else {
      acc.set(n.clusterId, { x: n.x, y: n.y, count: 1, name: n.clusterName });
    }
  }
  const out = new Map<string, { x: number; y: number; name: string }>();
  for (const [id, c] of acc) {
    out.set(id, { x: c.x / c.count, y: c.y / c.count, name: c.name });
  }
  return out;
}
