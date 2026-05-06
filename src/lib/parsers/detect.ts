import type { SourceFormat } from './types';

export function detectFormat(headers: string[]): SourceFormat {
  const lower = new Set(headers.map((h) => h.toLowerCase().trim()));

  // GSC: "Top queries" + Impressions/Clicks/CTR — caractéristique unique.
  if (lower.has('impressions') && lower.has('clicks')) return 'gsc';

  // SEMrush: "Search Volume" / "Keyword Difficulty" — formes longues distinctives.
  if (lower.has('search volume') || lower.has('keyword difficulty')) {
    return 'semrush';
  }

  // Ahrefs: "Volume" + "KD" — formes courtes.
  if (lower.has('keyword') && (lower.has('volume') || lower.has('kd'))) {
    return 'ahrefs';
  }

  return 'unknown';
}
