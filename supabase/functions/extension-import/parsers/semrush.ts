// Parser CSV Semrush — encoding UTF-8 (BOM possible), séparateur
// virgule (US) ou point-virgule (FR, mode Excel). Colonnes typiques
// "Organic Research → Positions" :
//   Keyword, Position, Previous position, Position Difference,
//   Search Volume, Keyword Difficulty, CPC, URL, Traffic (%),
//   Traffic Cost (%), Competition, Number of Results, Trends,
//   Timestamp, SERP Features by Keyword, Keyword Intents, Position Type

import { type ParsedRow, readCsv, parseNum, colIndexer } from './_shared.ts';

export function parseSemrushCsv(buffer: ArrayBuffer): ParsedRow[] {
  const { headers, rows } = readCsv(buffer);
  const col = colIndexer(headers);

  const iKeyword = col('keyword');
  const iVolume = col('search volume', 'volume');
  const iPosition = col('position');
  const iKd = col('keyword difficulty', 'difficulty', 'kd');
  const iCpc = col('cpc');
  const iUrl = col('url');

  if (iKeyword < 0) {
    throw new Error('Colonne "Keyword" introuvable dans les headers : ' + headers.join(' | '));
  }
  // Semrush expose plusieurs colonnes "position" (Position, Previous position,
  // Position Difference). On vérifie qu'on est tombé sur la bonne en
  // privilégiant l'exact match ("position" seul) — colIndexer fait déjà ça.
  // Pas de safeguard supplémentaire nécessaire.

  const out: ParsedRow[] = [];
  for (const cells of rows) {
    const keyword = (cells[iKeyword] || '').trim();
    if (!keyword) continue;

    const rawPos = iPosition >= 0 ? parseNum(cells[iPosition]) : null;
    const position = rawPos !== null && (rawPos < 1 || rawPos > 1000) ? null : rawPos;
    const rawKd = iKd >= 0 ? parseNum(cells[iKd]) : null;
    const kd = rawKd !== null && (rawKd < 0 || rawKd > 100) ? null : rawKd;

    out.push({
      keyword,
      volume: iVolume >= 0 ? parseNum(cells[iVolume]) : null,
      position,
      kd,
      cpc: iCpc >= 0 ? parseNum(cells[iCpc]) : null,
      url: iUrl >= 0 ? (cells[iUrl] || '').trim() || null : null,
    });
  }
  return out;
}
