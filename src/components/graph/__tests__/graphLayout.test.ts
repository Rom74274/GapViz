import { describe, it, expect } from 'vitest';
import {
  buildGraph,
  scaleRadius,
  radiusFromVolume,
  isClickable,
  type CenterNode,
  type ClusterMetaNode,
  type KeywordNode,
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

const BUILD_OPTS = {
  competitors: COMPETITORS,
  clusters: CLUSTERS,
  myDomain: 'skello.io',
  projectName: 'Skello FR',
};

describe('buildGraph', () => {
  it('creates a center node with my site\'s color and label', () => {
    const g = buildGraph({ ...BUILD_OPTS, keywords: [] });
    expect(g.centerNode.kind).toBe('center');
    expect(g.centerNode.color).toBe('#3b82f6');
    expect(g.centerNode.label).toBe('Skello');
    expect(g.centerNode.domain).toBe('skello.io');
  });

  it('falls back to project name when isMe competitor is absent', () => {
    const g = buildGraph({
      ...BUILD_OPTS,
      keywords: [],
      competitors: [],
    });
    expect(g.centerNode.label).toBe('Skello FR');
  });

  it('groups duplicate keywords across sources into one KeywordNode', () => {
    const g = buildGraph({
      ...BUILD_OPTS,
      keywords: [
        kw({ keyword: 'logiciel rh', sourceDomain: 'skello.io', clusterId: 'c1' }),
        kw({ keyword: 'logiciel rh', sourceDomain: 'factorial.fr', clusterId: 'c1' }),
      ],
    });
    const kws = g.nodes.filter((n): n is KeywordNode => n.kind === 'keyword');
    expect(kws).toHaveLength(1);
    expect(kws[0]!.sources).toHaveLength(2);
  });

  it('flags isGap=true when no source is isMe', () => {
    const g = buildGraph({
      ...BUILD_OPTS,
      keywords: [
        kw({ keyword: 'gestion paie', sourceDomain: 'factorial.fr', clusterId: 'c2' }),
        kw({ keyword: 'gestion paie', sourceDomain: 'payfit.com', clusterId: 'c2' }),
      ],
    });
    const kw1 = g.nodes.find((n): n is KeywordNode => n.kind === 'keyword')!;
    expect(kw1.isGap).toBe(true);
  });

  it('flags isGap=false when at least one source is isMe', () => {
    const g = buildGraph({
      ...BUILD_OPTS,
      keywords: [
        kw({ keyword: 'planning', sourceDomain: 'skello.io', clusterId: 'c1' }),
        kw({ keyword: 'planning', sourceDomain: 'factorial.fr', clusterId: 'c1' }),
      ],
    });
    const kw1 = g.nodes.find((n): n is KeywordNode => n.kind === 'keyword')!;
    expect(kw1.isGap).toBe(false);
  });

  it('creates one ClusterMetaNode per unique cluster', () => {
    const g = buildGraph({
      ...BUILD_OPTS,
      keywords: [
        kw({ keyword: 'a', sourceDomain: 'skello.io', clusterId: 'c1' }),
        kw({ keyword: 'b', sourceDomain: 'skello.io', clusterId: 'c1' }),
        kw({ keyword: 'c', sourceDomain: 'skello.io', clusterId: 'c2' }),
      ],
    });
    const meta = g.nodes.filter((n): n is ClusterMetaNode => n.kind === 'cluster');
    expect(meta).toHaveLength(2);
    const names = meta.map((m) => m.name).sort();
    expect(names).toEqual(['Paie', 'Planning']);
  });

  it('groups unclustered keywords under a "Sans cluster" meta-node', () => {
    const g = buildGraph({
      ...BUILD_OPTS,
      keywords: [
        kw({ keyword: 'orphelin', sourceDomain: 'skello.io', clusterId: null }),
      ],
    });
    const meta = g.nodes.filter((n): n is ClusterMetaNode => n.kind === 'cluster');
    expect(meta).toHaveLength(1);
    expect(meta[0]!.name).toBe('Sans cluster');
  });

  it('emits center-cluster links for each cluster', () => {
    const g = buildGraph({
      ...BUILD_OPTS,
      keywords: [
        kw({ keyword: 'a', sourceDomain: 'skello.io', clusterId: 'c1' }),
        kw({ keyword: 'b', sourceDomain: 'skello.io', clusterId: 'c2' }),
      ],
    });
    const ccLinks = g.links.filter((l) => l.kind === 'center-cluster');
    expect(ccLinks).toHaveLength(2);
    expect(ccLinks.every((l) => l.source === '__center__')).toBe(true);
  });

  it('emits cluster-keyword links for every KW', () => {
    const g = buildGraph({
      ...BUILD_OPTS,
      keywords: [
        kw({ keyword: 'a', sourceDomain: 'skello.io', clusterId: 'c1' }),
        kw({ keyword: 'b', sourceDomain: 'skello.io', clusterId: 'c1' }),
        kw({ keyword: 'c', sourceDomain: 'skello.io', clusterId: 'c2' }),
      ],
    });
    const ckLinks = g.links.filter((l) => l.kind === 'cluster-keyword');
    expect(ckLinks).toHaveLength(3);
  });

  it('emits intra-cluster keyword-keyword links (~2 per KW for clusters > 4)', () => {
    const keywords: Keyword[] = [];
    for (let i = 0; i < 10; i++) {
      keywords.push(kw({ keyword: `kw${i}`, sourceDomain: 'skello.io', clusterId: 'c1', volume: 100 - i }));
    }
    const g = buildGraph({ ...BUILD_OPTS, keywords });
    const kkLinks = g.links.filter((l) => l.kind === 'keyword-keyword');
    expect(kkLinks).toHaveLength(20); // 10 KWs × 2 voisins
  });

  it('uses 1 neighbor per KW for small clusters (<= 4)', () => {
    const keywords: Keyword[] = [];
    for (let i = 0; i < 3; i++) {
      keywords.push(kw({ keyword: `kw${i}`, sourceDomain: 'skello.io', clusterId: 'c1' }));
    }
    const g = buildGraph({ ...BUILD_OPTS, keywords });
    const kkLinks = g.links.filter((l) => l.kind === 'keyword-keyword');
    expect(kkLinks).toHaveLength(3); // 3 KWs × 1 voisin = 3
  });

  it('emits no kw-kw links for singleton clusters', () => {
    const g = buildGraph({
      ...BUILD_OPTS,
      keywords: [kw({ keyword: 'solo', sourceDomain: 'skello.io', clusterId: 'c1' })],
    });
    const kkLinks = g.links.filter((l) => l.kind === 'keyword-keyword');
    expect(kkLinks).toHaveLength(0);
  });

  it('preserves the isMe-first ordering on sources', () => {
    const g = buildGraph({
      ...BUILD_OPTS,
      keywords: [
        kw({ keyword: 'sirh', sourceDomain: 'factorial.fr' }),
        kw({ keyword: 'sirh', sourceDomain: 'skello.io' }),
      ],
    });
    const kw1 = g.nodes.find((n): n is KeywordNode => n.kind === 'keyword')!;
    expect(kw1.sources[0]!.isMe).toBe(true);
  });
});

describe('scaleRadius', () => {
  it('returns min when value is 0', () => {
    expect(scaleRadius(0, 100, 5, 20, false)).toBe(5);
  });

  it('returns max when value equals maxValue (linear)', () => {
    expect(scaleRadius(100, 100, 5, 20, false)).toBe(20);
  });

  it('clamps to max when value exceeds maxValue', () => {
    expect(scaleRadius(200, 100, 5, 20, false)).toBe(20);
  });

  it('uses log scale when log=true', () => {
    const linear = scaleRadius(10, 1000, 0, 100, false);
    const log = scaleRadius(10, 1000, 0, 100, true);
    expect(log).toBeGreaterThan(linear);
  });
});

describe('radiusFromVolume (rétrocompat)', () => {
  it('still maps to a 4-26 range', () => {
    expect(radiusFromVolume(0, 1000)).toBe(4);
    expect(radiusFromVolume(1000, 1000)).toBeCloseTo(26, 0);
  });
});

describe('isClickable', () => {
  it('center is not clickable', () => {
    const center: CenterNode = {
      id: '__center__',
      kind: 'center',
      radius: 38,
      domain: '',
      label: '',
      color: '',
    };
    expect(isClickable(center)).toBe(false);
  });

  it('keywords are clickable', () => {
    const k: KeywordNode = {
      id: 'k',
      kind: 'keyword',
      radius: 5,
      keyword: '',
      volume: 0,
      kd: null,
      cpc: null,
      intent: [],
      clusterId: '',
      clusterName: '',
      sources: [],
      isGap: false,
    };
    expect(isClickable(k)).toBe(true);
  });
});
