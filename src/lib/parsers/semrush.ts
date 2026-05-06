import type { ParsedRow } from './types';
import { getCol, parseInteger, parseIntent, parseNumber } from './normalize';

export function parseSemrushRow(raw: Record<string, unknown>): ParsedRow | null {
  const keyword = getCol(raw, 'Keyword');
  if (!keyword) return null;

  return {
    keyword,
    volume: parseInteger(getCol(raw, 'Search Volume', 'Volume')) ?? 0,
    position: parseInteger(getCol(raw, 'Position')),
    kd: parseNumber(getCol(raw, 'Keyword Difficulty', 'KD')),
    cpc: parseNumber(getCol(raw, 'CPC')),
    intent: parseIntent(getCol(raw, 'Keyword Intents', 'Intent')),
    url: getCol(raw, 'URL') ?? null,
  };
}
