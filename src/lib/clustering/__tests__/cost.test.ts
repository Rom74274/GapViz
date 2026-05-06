import { describe, it, expect } from 'vitest';
import { estimateClusteringCost, formatUSD, actualCost } from '../cost';

describe('estimateClusteringCost', () => {
  it('produces a sensible estimate for 100 KWs on Sonnet', () => {
    const e = estimateClusteringCost(100, 'claude-sonnet-4-6');
    expect(e.inputTokens).toBe(1200);
    expect(e.outputTokens).toBe(800);
    // 1200 * 3 + 800 * 15 = 3600 + 12000 = 15600 / 1M = $0.0156
    expect(e.usd).toBeCloseTo(0.0156, 4);
  });

  it('scales linearly with kw count', () => {
    const a = estimateClusteringCost(100, 'claude-sonnet-4-6');
    const b = estimateClusteringCost(1000, 'claude-sonnet-4-6');
    expect(b.inputTokens).toBeGreaterThan(a.inputTokens * 5);
  });

  it('falls back to Sonnet pricing for unknown models', () => {
    const a = estimateClusteringCost(100, 'unknown-model');
    const b = estimateClusteringCost(100, 'claude-sonnet-4-6');
    expect(a.usd).toBe(b.usd);
  });

  it('costs less on Haiku than on Sonnet', () => {
    const haiku = estimateClusteringCost(500, 'claude-haiku-4-5-20251001');
    const sonnet = estimateClusteringCost(500, 'claude-sonnet-4-6');
    expect(haiku.usd).toBeLessThan(sonnet.usd);
  });
});

describe('actualCost', () => {
  it('computes the cost from real usage', () => {
    expect(actualCost(1000, 500, 'claude-sonnet-4-6')).toBeCloseTo(
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
