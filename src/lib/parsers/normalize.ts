import type { Intent } from '@/lib/db';

const INTENT_VALUES = new Set<Intent>([
  'informational',
  'commercial',
  'transactional',
  'navigational',
]);

export function getCol(
  row: Record<string, unknown>,
  ...names: string[]
): string | undefined {
  const keys = Object.keys(row);
  for (const name of names) {
    const target = name.toLowerCase().trim();
    const key = keys.find((k) => k.toLowerCase().trim() === target);
    if (key) {
      const v = row[key];
      if (v !== undefined && v !== null && String(v).trim() !== '') {
        return String(v).trim();
      }
    }
  }
  return undefined;
}

export function parseNumber(v: string | undefined): number | null {
  if (v === undefined) return null;
  const s = v.trim();
  if (s === '' || s === '-' || s === 'N/A' || s === 'n/a') return null;

  const direct = Number(s);
  if (Number.isFinite(direct)) return direct;

  const cleaned = s.replace(/[\s,]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function parseInteger(v: string | undefined): number | null {
  const n = parseNumber(v);
  return n === null ? null : Math.round(n);
}

export function parseIntent(v: string | undefined): Intent[] {
  if (!v) return [];
  return v
    .split(/[,;|/]/)
    .map((x) => x.trim().toLowerCase())
    .filter((x): x is Intent => INTENT_VALUES.has(x as Intent));
}

export function parseBoolean(v: string | undefined): boolean {
  if (!v) return false;
  const s = v.toLowerCase().trim();
  return s === 'true' || s === '1' || s === 'yes' || s === 'oui';
}
