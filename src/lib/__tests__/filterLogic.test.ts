import { describe, it, expect } from 'vitest';
import { containsPastYear, isKeywordVisible } from '../filterLogic';
import { DEFAULT_FILTERS } from '../filterStore';
import type { KeywordNode } from '@/components/graph/graphLayout';

function kw(partial: Partial<KeywordNode>): KeywordNode {
  return {
    id: 'k',
    kind: 'keyword',
    radius: 5,
    keyword: '',
    volume: 100,
    kd: 40,
    cpc: null,
    intent: [],
    clusterId: 'c1',
    clusterName: 'Cluster 1',
    sources: [],
    isGap: false,
    primaryColor: '#000000',
    branded: false,
    traffic: null,
    serpFeatures: null,
    ...partial,
  };
}

describe('containsPastYear', () => {
  it('detects year < refYear', () => {
    expect(containsPastYear('salaire 2024', 2026)).toBe(true);
    expect(containsPastYear('rapport annuel 2023', 2026)).toBe(true);
  });

  it('does not match current or future year', () => {
    expect(containsPastYear('budget 2026', 2026)).toBe(false);
    expect(containsPastYear('prévisions 2028', 2026)).toBe(false);
  });

  it('returns false when no year present', () => {
    expect(containsPastYear('planning équipe', 2026)).toBe(false);
  });

  it('returns true when any year in the KW is past', () => {
    expect(containsPastYear('rapport 2024 et 2026', 2026)).toBe(true);
  });

  it('ignores 4-digit numbers that arent years', () => {
    // Le pattern matche 19xx/20xx donc 1900-2099. "9000" ne matche pas.
    expect(containsPastYear('package 9000 euros', 2026)).toBe(false);
  });
});

describe('isKeywordVisible — excludedClusters', () => {
  it('exclut un KW dont le cluster est dans excludedClusters', () => {
    const node = kw({ clusterId: 'c-bruit' });
    const f = { ...DEFAULT_FILTERS, excludedClusters: ['c-bruit'] };
    expect(isKeywordVisible(node, f)).toBe(false);
  });

  it('garde un KW dont le cluster nest pas exclu', () => {
    const node = kw({ clusterId: 'c-utile' });
    const f = { ...DEFAULT_FILTERS, excludedClusters: ['c-bruit'] };
    expect(isKeywordVisible(node, f)).toBe(true);
  });

  it('lexclusion prime sur activeClusters', () => {
    const node = kw({ clusterId: 'c-bruit' });
    const f = {
      ...DEFAULT_FILTERS,
      activeClusters: ['c-bruit'],
      excludedClusters: ['c-bruit'],
    };
    expect(isKeywordVisible(node, f)).toBe(false);
  });
});

describe('isKeywordVisible — intents filter avec intent vide', () => {
  it('un KW SANS intent passe le filtre intent (cas CSV sans colonne intent)', () => {
    const node = kw({ intent: [] });
    const f = { ...DEFAULT_FILTERS, intents: ['informational' as const] };
    expect(isKeywordVisible(node, f)).toBe(true);
  });

  it('un KW avec intent qui MATCH le filtre passe', () => {
    const node = kw({ intent: ['informational'] });
    const f = { ...DEFAULT_FILTERS, intents: ['informational' as const] };
    expect(isKeywordVisible(node, f)).toBe(true);
  });

  it('un KW avec intent qui NE MATCH PAS le filtre est exclu', () => {
    const node = kw({ intent: ['commercial'] });
    const f = { ...DEFAULT_FILTERS, intents: ['informational' as const] };
    expect(isKeywordVisible(node, f)).toBe(false);
  });

  it('OR entre les intents du KW vs ceux du filtre', () => {
    const node = kw({ intent: ['informational', 'commercial'] });
    const f = { ...DEFAULT_FILTERS, intents: ['informational' as const] };
    expect(isKeywordVisible(node, f)).toBe(true);
  });
});

describe('isKeywordVisible — hideDatedKeywords', () => {
  it('masque un KW avec une année passée quand le toggle est on', () => {
    const node = kw({ keyword: 'rapport 2024' });
    const f = { ...DEFAULT_FILTERS, hideDatedKeywords: true };
    expect(isKeywordVisible(node, f)).toBe(false);
  });

  it('garde un KW sans année', () => {
    const node = kw({ keyword: 'planning équipe' });
    const f = { ...DEFAULT_FILTERS, hideDatedKeywords: true };
    expect(isKeywordVisible(node, f)).toBe(true);
  });

  it('ne filtre rien quand le toggle est off', () => {
    const node = kw({ keyword: 'rapport 2024' });
    const f = { ...DEFAULT_FILTERS, hideDatedKeywords: false };
    expect(isKeywordVisible(node, f)).toBe(true);
  });
});
