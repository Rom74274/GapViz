// Helpers partagés par tous les parsers CSV (Ahrefs, Semrush, …).

export interface ParsedRow {
  keyword: string;
  volume: number | null;
  position: number | null;
  kd: number | null;
  cpc: number | null;
  url: string | null;
}

// Vrai parser CSV qui respecte les guillemets (RFC 4180-like).
// Gère :
//   - Champs entre guillemets `"..."` qui peuvent contenir le séparateur
//   - Guillemets échappés `""` → `"`
//   - CRLF / LF / CR comme line ending
//   - Champs multilignes (un `"..."` peut contenir des newlines)
export function parseCsvText(text: string, sep: string): string[][] {
  const rows: string[][] = [];
  let current = '';
  let row: string[] = [];
  let inQuotes = false;
  let i = 0;
  const N = text.length;

  while (i < N) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          current += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      current += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === sep) {
      row.push(current);
      current = '';
      i++;
      continue;
    }
    if (ch === '\r' || ch === '\n') {
      row.push(current);
      current = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
      if (ch === '\r' && text[i + 1] === '\n') i += 2;
      else i++;
      continue;
    }
    current += ch;
    i++;
  }
  if (current.length > 0 || row.length > 0) {
    row.push(current);
    if (row.length > 1 || row[0] !== '') rows.push(row);
  }
  return rows;
}

export function parseNum(s: string | undefined): number | null {
  if (!s) return null;
  const cleaned = s.replace(/[$%]/g, '').replace(/\s+/g, '').replace(/,/g, '.');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

// Détecte le séparateur le plus probable sur la 1ère ligne.
export function detectSeparator(firstLine: string): string {
  if (firstLine.includes('\t')) return '\t';
  if (firstLine.includes(';')) return ';';
  return ',';
}

// Index de colonne par nom (exact d'abord, fuzzy en fallback).
export function colIndexer(headers: string[]) {
  const lc = headers.map((h) => h.toLowerCase().trim());
  return (...candidates: string[]): number => {
    for (const c of candidates) {
      const k = c.toLowerCase();
      const exact = lc.findIndex((h) => h === k);
      if (exact >= 0) return exact;
    }
    for (const c of candidates) {
      const k = c.toLowerCase();
      const fuzzy = lc.findIndex((h) => h.includes(k));
      if (fuzzy >= 0) return fuzzy;
    }
    return -1;
  };
}

// Décodage générique : auto-detect UTF-16 LE/BE (BOM) sinon UTF-8.
export function decodeCsvBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes);
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes);
  }
  return new TextDecoder('utf-8').decode(bytes);
}

// Strip BOM résiduel + détecte séparateur + parse + valide.
export function readCsv(buffer: ArrayBuffer): { headers: string[]; rows: string[][] } {
  let text = decodeCsvBuffer(buffer);
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const firstNl = text.search(/\r?\n/);
  const firstLine = firstNl > 0 ? text.slice(0, firstNl) : text;
  const sep = detectSeparator(firstLine);

  const allRows = parseCsvText(text, sep);
  if (allRows.length < 2) {
    throw new Error('CSV trop court (manque headers ou données)');
  }
  return { headers: allRows[0]!, rows: allRows.slice(1) };
}
