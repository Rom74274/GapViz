import type { Intent } from '@/lib/db';
import type { ParsedRow } from './types';
import {
  getCol,
  parseBoolean,
  parseInteger,
  parseIntent,
  parseNumber,
} from './normalize';

const INTENT_BOOLEAN_COLS: Array<[string, Intent]> = [
  ['Is Informational', 'informational'],
  ['Is Commercial', 'commercial'],
  ['Is Transactional', 'transactional'],
  ['Is Navigational', 'navigational'],
];

function intentFromBooleans(raw: Record<string, unknown>): Intent[] {
  const out: Intent[] = [];
  for (const [col, value] of INTENT_BOOLEAN_COLS) {
    if (parseBoolean(getCol(raw, col))) out.push(value);
  }
  return out;
}

export function parseAhrefsRow(raw: Record<string, unknown>): ParsedRow | null {
  const keyword = getCol(raw, 'Keyword');
  if (!keyword) return null;

  // Ahrefs varie entre "Intent" / "Intents" / "Keyword Intents" selon le format
  // d'export. On essaie toutes les variantes string, puis les colonnes booléennes.
  const intentString = parseIntent(
    getCol(raw, 'Intent', 'Intents', 'Keyword Intents', 'Intent type'),
  );
  const intent =
    intentString.length > 0 ? intentString : intentFromBooleans(raw);

  return {
    keyword,
    volume: parseInteger(getCol(raw, 'Volume', 'Search Volume')) ?? 0,
    position: parseInteger(getCol(raw, 'Position', 'Current position')),
    kd: parseNumber(getCol(raw, 'KD', 'Keyword Difficulty')),
    cpc: parseNumber(getCol(raw, 'CPC')),
    intent,
    url: getCol(raw, 'URL', 'Current URL') ?? null,
  };
}
