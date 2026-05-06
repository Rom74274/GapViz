import type { ParsedRow } from './types';
import { getCol, parseInteger, parseIntent, parseNumber } from './normalize';

export function parseAhrefsRow(raw: Record<string, unknown>): ParsedRow | null {
  const keyword = getCol(raw, 'Keyword');
  if (!keyword) return null;

  return {
    keyword,
    volume: parseInteger(getCol(raw, 'Volume', 'Search Volume')) ?? 0,
    position: parseInteger(getCol(raw, 'Position', 'Current position')),
    kd: parseNumber(getCol(raw, 'KD', 'Keyword Difficulty')),
    cpc: parseNumber(getCol(raw, 'CPC')),
    intent: parseIntent(getCol(raw, 'Intent', 'Keyword Intents')),
    url: getCol(raw, 'URL', 'Current URL') ?? null,
  };
}
