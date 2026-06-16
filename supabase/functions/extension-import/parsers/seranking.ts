// Parser CSV SE Ranking — Competitive Research → Organic Keywords.
// Encoding UTF-8 (BOM possible), séparateur virgule (US) ou point-virgule
// (mode Excel). Colonnes typiques :
//   Keyword, Position, Search Volume, Difficulty (= DR/KD), CPC,
//   URL, Traffic, Traffic %, Competition, Results

import { type ParsedRow, readCsv, parseNum, colIndexer } from './_shared.ts';

export function parseSeRankingCsv(buffer: ArrayBuffer): ParsedRow[] {
  const { headers, rows } = readCsv(buffer);
  const col = colIndexer(headers);

  const iKeyword = col('keyword');
  const iVolume = col('search volume', 'volume');
  const iPosition = col('position');
  const iKd = col('difficulty', 'keyword difficulty', 'dr', 'kd');
  const iCpc = col('cpc');
  const iUrl = col('url');

  if (iKeyword < 0) {
    throw new Error('Colonne "Keyword" introuvable dans les headers : ' + headers.join(' | '));
  }

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
