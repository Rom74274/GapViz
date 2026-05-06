// Tarifs Anthropic en USD par million de tokens (Sonnet 4.6, indicatif).
const PRICING: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-haiku-4-5-20251001': { input: 0.8, output: 4 },
  'claude-opus-4-7': { input: 15, output: 75 },
};

export interface CostEstimate {
  inputTokens: number;
  outputTokens: number;
  usd: number;
}

// Estimation grossière avant l'appel API. ~4 chars/token pour le français.
export function estimateClusteringCost(
  kwCount: number,
  model: string,
): CostEstimate {
  const inputTokens = Math.round(400 + kwCount * 8);
  const outputTokens = Math.round(200 + kwCount * 6);
  const rates = PRICING[model] ?? PRICING['claude-sonnet-4-6']!;
  const usd =
    (inputTokens * rates.input + outputTokens * rates.output) / 1_000_000;
  return { inputTokens, outputTokens, usd };
}

export function actualCost(
  inputTokens: number,
  outputTokens: number,
  model: string,
): number {
  const rates = PRICING[model] ?? PRICING['claude-sonnet-4-6']!;
  return (inputTokens * rates.input + outputTokens * rates.output) / 1_000_000;
}

export function formatUSD(usd: number): string {
  if (usd < 0.01) return `<$0.01`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}
