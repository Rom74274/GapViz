// Parser CSV Ahrefs — encoding UTF-16 LE (avec BOM) le plus souvent,
// séparateur tab. Colonnes :
//   Keyword, Volume (= Search Volume), Current position, KD, CPC,
//   Current URL, …

import { type ParsedRow, readCsv, parseNum, colIndexer } from './_shared.ts';

export function parseAhrefsCsv(buffer: ArrayBuffer): ParsedRow[] {
  const { headers, rows } = readCsv(buffer);
  const col = colIndexer(headers);

  const iKeyword = col('keyword');
  const iVolume = col('volume', 'search volume');
  const iPosition = col('current position', 'position');
  const iKd = col('kd', 'keyword difficulty', 'difficulty');
  const iCpc = col('cpc');
  const iUrl = col('current url', 'url');

  if (iKeyword < 0) {
    throw new Error('Colonne "Keyword" introuvable dans les headers : ' + headers.join(' | '));
  }

  const out: ParsedRow[] = [];
  for (const cells of rows) {
    const keyword = (cells[iKeyword] || '').trim();
    if (!keyword) continue;

    // Clamping défensif : position ∈ [1, 1000], kd ∈ [0, 100].
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
