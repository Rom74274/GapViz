// Tarifs Anthropic en USD par million de tokens (Sonnet 4.6, indicatif).
const PRICING: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-haiku-4-5-20251001': { input: 0.8, output: 4 },
  'claude-opus-4-7': { input: 15, output: 75 },
};

// Au-delà de ce seuil, on bascule en clustering chunked.
export const CHUNK_SIZE = 500;
export const CHUNK_THRESHOLD = 500;

export interface CostEstimate {
  inputTokens: number;
  outputTokens: number;
  usd: number;
  chunks: number; // 1 = appel unique, >1 = chunked
}

// Estimation basée sur ~4 chars/token pour le français.
export function estimateClusteringCost(
  kwCount: number,
  model: string,
): CostEstimate {
  if (kwCount <= CHUNK_THRESHOLD) {
    const inputTokens = Math.round(400 + kwCount * 8);
    const outputTokens = Math.round(200 + kwCount * 6);
    return {
      inputTokens,
      outputTokens,
      chunks: 1,
      usd: computeUSD(inputTokens, outputTokens, model),
    };
  }
  // Chunked : N chunks de CHUNK_SIZE KWs.
  // Premier chunk : prompt système simple. Suivants : ajoutent le contexte
  // des clusters existants (~50 tokens × 15 clusters ≈ 750 tokens).
  const chunks = Math.ceil(kwCount / CHUNK_SIZE);
  const firstInput = 400 + CHUNK_SIZE * 8;
  const followupInput = firstInput + 800;
  const perOutput = 200 + CHUNK_SIZE * 6;
  const inputTokens = Math.round(firstInput + (chunks - 1) * followupInput);
  const outputTokens = Math.round(chunks * perOutput);
  return {
    inputTokens,
    outputTokens,
    chunks,
    usd: computeUSD(inputTokens, outputTokens, model),
  };
}

function computeUSD(input: number, output: number, model: string): number {
  const rates = PRICING[model] ?? PRICING['claude-sonnet-4-6']!;
  return (input * rates.input + output * rates.output) / 1_000_000;
}

export function actualCost(
  inputTokens: number,
  outputTokens: number,
  model: string,
): number {
  return computeUSD(inputTokens, outputTokens, model);
}

export function formatUSD(usd: number): string {
  if (usd < 0.01) return `<$0.01`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}
