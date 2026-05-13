import type { Intent } from '@/lib/db';
import type { ParsedRow } from './types';
import {
  getCol,
  parseBoolean,
  parseInteger,
  parseIntent,
  parseNumber,
} from './normalize';

// Ahrefs varie selon la version d'export :
// - "Informational" (forme courte, exports récents)
// - "Is Informational" (forme historique)
// getCol est case-insensitive donc "INFORMATIONAL" et "informational" matchent aussi.
const INTENT_BOOLEAN_COLS: Array<{ variants: string[]; intent: Intent }> = [
  {
    variants: ['Informational', 'Is Informational', 'is_informational'],
    intent: 'informational',
  },
  {
    variants: ['Commercial', 'Is Commercial', 'is_commercial'],
    intent: 'commercial',
  },
  {
    variants: ['Transactional', 'Is Transactional', 'is_transactional'],
    intent: 'transactional',
  },
  {
    variants: ['Navigational', 'Is Navigational', 'is_navigational'],
    intent: 'navigational',
  },
];

function intentFromBooleans(raw: Record<string, unknown>): Intent[] {
  const out: Intent[] = [];
  for (const { variants, intent } of INTENT_BOOLEAN_COLS) {
    if (parseBoolean(getCol(raw, ...variants))) out.push(intent);
  }
  return out;
}

export function parseAhrefsRow(raw: Record<string, unknown>): ParsedRow | null {
  const keyword = getCol(raw, 'Keyword');
  if (!keyword) return null;

  // Forme string : "Intent" / "Intents" / "Keyword Intents" / "Intent type".
  const intentString = parseIntent(
    getCol(raw, 'Intent', 'Intents', 'Keyword Intents', 'Intent type'),
  );
  const intent =
    intentString.length > 0 ? intentString : intentFromBooleans(raw);

  const branded = brandedFromCols(raw);

  return {
    keyword,
    volume: parseInteger(getCol(raw, 'Volume', 'Search Volume')) ?? 0,
    position: parseInteger(getCol(raw, 'Position', 'Current position')),
    kd: parseNumber(getCol(raw, 'KD', 'Keyword Difficulty')),
    cpc: parseNumber(getCol(raw, 'CPC')),
    intent,
    url: getCol(raw, 'URL', 'Current URL') ?? null,
    traffic: parseInteger(getCol(raw, 'Traffic', 'Organic traffic')),
    serpFeatures: getCol(raw, 'SERP features', 'SERP Features') ?? null,
    branded,
  };
}

function brandedFromCols(raw: Record<string, unknown>): boolean | null {
  const v = getCol(raw, 'Branded', 'Is branded', 'Brand');
  if (v === undefined) return null;
  return parseBoolean(v);
}
