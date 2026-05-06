import type { SourceFormat } from './types';

export function detectFormat(headers: string[]): SourceFormat {
  const lower = new Set(headers.map((h) => h.toLowerCase().trim()));

  // GSC : Impressions + Clicks — signal unique.
  if (lower.has('impressions') && lower.has('clicks')) return 'gsc';

  // SEMrush : "Search Volume" est exclusif à SEMrush.
  if (lower.has('search volume')) return 'semrush';

  // Ahrefs : "Volume" (forme courte). Couvre les variantes "KD" et "Keyword Difficulty"
  // ainsi que les exports avec colonnes "Is Informational/Commercial/...".
  if (lower.has('volume')) return 'ahrefs';

  // Repli : si pas de Volume mais "KD" ou "Keyword Difficulty", on suppose Ahrefs.
  if (lower.has('kd') || lower.has('keyword difficulty')) return 'ahrefs';

  return 'unknown';
}
