import type { ParsedRow } from './types';
import { getCol, parseInteger, parseNumber } from './normalize';

// GSC n'expose pas Volume / KD / CPC / Intent. On prend Impressions comme proxy
// du volume (faute de mieux), Position telle quelle, et l'URL n'est dispo qu'avec
// l'export "Pages and queries" combiné.
export function parseGscRow(raw: Record<string, unknown>): ParsedRow | null {
  const keyword = getCol(raw, 'Top queries', 'Query', 'Queries');
  if (!keyword) return null;

  return {
    keyword,
    volume: parseInteger(getCol(raw, 'Impressions')) ?? 0,
    position: parseNumber(getCol(raw, 'Position')),
    kd: null,
    cpc: null,
    intent: [],
    url: getCol(raw, 'Top pages', 'Page', 'URL') ?? null,
  };
}
