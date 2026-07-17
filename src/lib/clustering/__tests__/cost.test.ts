import { describe, it, expect } from 'vitest';
import { estimateClusteringCost, formatUSD, actualCost } from '../cost';

describe('estimateClusteringCost', () => {
  it('produces a sensible estimate for 100 KWs on Sonnet', () => {
    const e = estimateClusteringCost(100, 'claude-sonnet-5');
    expect(e.inputTokens).toBe(1200);
    // Protocole "ids" : output ~3 tokens/KW → 200 + 100*3 = 500.
    expect(e.outputTokens).toBe(500);
    // 1200 * 3 + 500 * 15 = 3600 + 7500 = 11100 / 1M = $0.0111
    expect(e.usd).toBeCloseTo(0.0111, 4);
  });

  it('scales linearly with kw count', () => {
    const a = estimateClusteringCost(100, 'claude-sonnet-5');
    const b = estimateClusteringCost(1000, 'claude-sonnet-5');
    expect(b.inputTokens).toBeGreaterThan(a.inputTokens * 5);
  });

  it('falls back to Sonnet pricing for unknown models', () => {
    const a = estimateClusteringCost(100, 'unknown-model');
    const b = estimateClusteringCost(100, 'claude-sonnet-5');
    expect(a.usd).toBe(b.usd);
  });

  it('costs less on Haiku than on Sonnet', () => {
    const haiku = estimateClusteringCost(500, 'claude-haiku-4-5');
    const sonnet = estimateClusteringCost(500, 'claude-sonnet-5');
    expect(haiku.usd).toBeLessThan(sonnet.usd);
  });
});

describe('actualCost', () => {
  it('computes the cost from real usage', () => {
    expect(actualCost(1000, 500, 'claude-sonnet-5')).toBeCloseTo(
      (1000 * 3 + 500 * 15) / 1_000_000,
      6,
    );
  });
});

describe('formatUSD', () => {
  it('shows <$0.01 for tiny amounts', () => {
    expect(formatUSD(0.005)).toBe('<$0.01');
  });

  it('shows 3 decimals for small amounts', () => {
    expect(formatUSD(0.123)).toBe('$0.123');
  });

  it('shows 2 decimals for $1+', () => {
    expect(formatUSD(2.5)).toBe('$2.50');
  });
});
