import { describe, it, expect } from 'vitest';
import {
  buildGraphNodes,
  computeClusterAnchors,
  radiusFromVolume,
  uniqueClusterIds,
  clusterCentroids,
} from '../graphLayout';
import type { Cluster, Competitor, Keyword } from '@/lib/db';

const COMPETITORS: Competitor[] = [
  { id: 'me', projectId: 'p', domain: 'skello.io', label: 'Skello', color: '#3b82f6', isMe: true },
  { id: 'fac', projectId: 'p', domain: 'factorial.fr', label: 'Factorial', color: '#ef4444', isMe: false },
  { id: 'pay', projectId: 'p', domain: 'payfit.com', label: 'PayFit', color: '#22c55e', isMe: false },
];

const CLUSTERS: Cluster[] = [
  { id: 'c1', projectId: 'p', name: 'Planning', parentId: null },
  { id: 'c2', projectId: 'p', name: 'Paie', parentId: null },
];

function kw(partial: Partial<Keyword>): Keyword {
  return {
    id: crypto.randomUUID(),
    projectId: 'p',
    keyword: '',
    volume: 100,
    kd: null,
    cpc: null,
    intent: [],
    clusterId: null,
    sourceDomain: '',
    position: null,
    url: null,
    ...partial,
  };
}

describe('buildGraphNodes', () => {
  it('groups duplicate keywords across sources into one node', () => {
    const keywords: Keyword[] = [
      kw({ keyword: 'logiciel rh', volume: 5400, sourceDomain: 'skello.io', clusterId: 'c1' }),
      kw({ keyword: 'logiciel rh', volume: 5400, sourceDomain: 'factorial.fr', clusterId: 'c1' }),
    ];
    const nodes = buildGraphNodes({ keywords, competitors: COMPETITORS, clusters: CLUSTERS });
    expect(nodes).toHaveLength(1);
    expect(nodes[0]!.sources).toHaveLength(2);
  });

  it('puts isMe source first in the sources array', () => {
    const keywords: Keyword[] = [
      kw({ keyword: 'sirh', sourceDomain: 'factorial.fr' }),
      kw({ keyword: 'sirh', sourceDomain: 'skello.io' }),
    ];
    const nodes = buildGraphNodes({ keywords, competitors: COMPETITORS, clusters: CLUSTERS });
    expect(nodes[0]!.sources[0]!.isMe).toBe(true);
    expect(nodes[0]!.sources[0]!.label).toBe('Skello');
  });

  it('uses cluster name when clusterId is set', () => {
    const keywords: Keyword[] = [
      kw({ keyword: 'planning', sourceDomain: 'skello.io', clusterId: 'c1' }),
    ];
    const nodes = buildGraphNodes({ keywords, competitors: COMPETITORS, clusters: CLUSTERS });
    expect(nodes[0]!.clusterName).toBe('Planning');
  });

  it('falls back to "Sans cluster" when clusterId is null', () => {
    const keywords: Keyword[] = [
      kw({ keyword: 'kw', sourceDomain: 'skello.io', clusterId: null }),
    ];
    const nodes = buildGraphNodes({ keywords, competitors: COMPETITORS, clusters: CLUSTERS });
    expect(nodes[0]!.clusterName).toBe('Sans cluster');
  });

  it('handles unknown sourceDomain gracefully', () => {
    const keywords: Keyword[] = [
      kw({ keyword: 'kw', sourceDomain: 'inconnu.com' }),
    ];
    const nodes = buildGraphNodes({ keywords, competitors: COMPETITORS, clusters: CLUSTERS });
    expect(nodes[0]!.sources[0]!.label).toBe('inconnu.com');
    expect(nodes[0]!.sources[0]!.color).toMatch(/^#/);
  });

  it('takes the max volume across sources for a duplicate KW', () => {
    const keywords: Keyword[] = [
      kw({ keyword: 'kw', sourceDomain: 'skello.io', volume: 1000 }),
      kw({ keyword: 'kw', sourceDomain: 'factorial.fr', volume: 5000 }),
    ];
    const nodes = buildGraphNodes({ keywords, competitors: COMPETITORS, clusters: CLUSTERS });
    expect(nodes[0]!.volume).toBe(5000);
  });

  it('keeps best (lowest) position when same source appears twice', () => {
    const keywords: Keyword[] = [
      kw({ keyword: 'kw', sourceDomain: 'skello.io', position: 5 }),
      kw({ keyword: 'kw', sourceDomain: 'skello.io', position: 12 }),
    ];
    const nodes = buildGraphNodes({ keywords, competitors: COMPETITORS, clusters: CLUSTERS });
    expect(nodes[0]!.sources).toHaveLength(1);
    expect(nodes[0]!.sources[0]!.position).toBe(5);
  });
});

describe('radiusFromVolume', () => {
  it('returns MIN_RADIUS for zero volume', () => {
    expect(radiusFromVolume(0, 1000)).toBe(4);
  });

  it('returns close to MAX_RADIUS for max volume', () => {
    expect(radiusFromVolume(1000, 1000)).toBeCloseTo(26, 0);
  });

  it('is monotonic', () => {
    const r1 = radiusFromVolume(100, 10000);
    const r2 = radiusFromVolume(1000, 10000);
    const r3 = radiusFromVolume(5000, 10000);
    expect(r2).toBeGreaterThan(r1);
    expect(r3).toBeGreaterThan(r2);
  });
});

describe('computeClusterAnchors', () => {
  it('returns empty map for no clusters', () => {
    const map = computeClusterAnchors([], 800, 600);
    expect(map.size).toBe(0);
  });

  it('places single cluster at center', () => {
    const map = computeClusterAnchors(['c1'], 800, 600);
    expect(map.get('c1')).toEqual({ x: 400, y: 300 });
  });

  it('spreads N clusters on a circle', () => {
    const map = computeClusterAnchors(['c1', 'c2', 'c3', 'c4'], 800, 600);
    const positions = [...map.values()];
    expect(positions).toHaveLength(4);
    // Tous différents
    const xs = new Set(positions.map((p) => Math.round(p.x)));
    expect(xs.size).toBeGreaterThan(1);
  });
});

describe('uniqueClusterIds', () => {
  it('returns deduped cluster IDs', () => {
    const nodes = [
      { clusterId: 'c1' } as never,
      { clusterId: 'c1' } as never,
      { clusterId: 'c2' } as never,
    ];
    expect(uniqueClusterIds(nodes).sort()).toEqual(['c1', 'c2']);
  });
});

describe('clusterCentroids', () => {
  it('computes mean position per cluster', () => {
    const nodes = [
      { clusterId: 'a', clusterName: 'A', x: 0, y: 0 } as never,
      { clusterId: 'a', clusterName: 'A', x: 100, y: 100 } as never,
      { clusterId: 'b', clusterName: 'B', x: 50, y: 50 } as never,
    ];
    const centroids = clusterCentroids(nodes);
    expect(centroids.get('a')).toEqual({ x: 50, y: 50, name: 'A' });
    expect(centroids.get('b')).toEqual({ x: 50, y: 50, name: 'B' });
  });

  it('skips nodes without position', () => {
    const nodes = [
      { clusterId: 'a', clusterName: 'A' } as never, // no x/y
      { clusterId: 'a', clusterName: 'A', x: 10, y: 10 } as never,
    ];
    const centroids = clusterCentroids(nodes);
    expect(centroids.get('a')).toEqual({ x: 10, y: 10, name: 'A' });
  });
});
