import Papa from 'papaparse';
import { detectFormat } from './detect';
import { parseAhrefsRow } from './ahrefs';
import { parseSemrushRow } from './semrush';
import { parseGscRow } from './gsc';
import {
  parseBoolean,
  parseInteger,
  parseIntent,
  parseNumber,
} from './normalize';
import type { GapVizField } from '@/lib/db';
import type { ParseError, ParseResult, ParsedRow, SourceFormat } from './types';

export type { ParseError, ParseResult, ParsedRow, SourceFormat };
export { detectFormat };

const ROW_PARSERS: Record<
  Exclude<SourceFormat, 'unknown'>,
  (row: Record<string, unknown>) => ParsedRow | null
> = {
  ahrefs: parseAhrefsRow,
  semrush: parseSemrushRow,
  gsc: parseGscRow,
};

export interface ParseOptions {
  forceFormat?: SourceFormat;
}

export function parseCSVText(text: string, opts: ParseOptions = {}): ParseResult {
  const trimmed = text.replace(/^﻿/, '');

  const parsed = Papa.parse<Record<string, unknown>>(trimmed, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim(),
  });

  const headers = parsed.meta.fields ?? [];
  const detected = opts.forceFormat ?? detectFormat(headers);

  if (detected === 'unknown') {
    return {
      format: 'unknown',
      rows: [],
      errors: [],
      meta: {
        totalRows: parsed.data.length,
        skippedRows: parsed.data.length,
        headers,
      },
    };
  }

  const rowParser = ROW_PARSERS[detected];
  const rows: ParsedRow[] = [];
  const errors: ParseError[] = [];

  parsed.data.forEach((raw, i) => {
    try {
      const row = rowParser(raw);
      if (row && row.keyword) {
        rows.push(row);
      } else {
        errors.push({
          rowIndex: i + 2, // +1 pour le header, +1 pour 1-indexer
          reason: 'keyword manquant ou ligne vide',
          raw: stringifyValues(raw),
        });
      }
    } catch (err) {
      errors.push({
        rowIndex: i + 2,
        reason: err instanceof Error ? err.message : 'parse error',
        raw: stringifyValues(raw),
      });
    }
  });

  return {
    format: detected,
    rows,
    errors,
    meta: {
      totalRows: parsed.data.length,
      skippedRows: parsed.data.length - rows.length,
      headers,
    },
  };
}

export async function parseCSVFile(
  file: File,
  opts: ParseOptions = {},
): Promise<ParseResult> {
  const text = await file.text();
  return parseCSVText(text, opts);
}

function stringifyValues(raw: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    out[k] = v == null ? '' : String(v);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Manual column mapping — pour les formats que detectFormat ne reconnaît pas
// ---------------------------------------------------------------------------

export function parseCSVTextWithMapping(
  text: string,
  mapping: Record<string, GapVizField>,
): ParseResult {
  const trimmed = text.replace(/^﻿/, '');
  const parsed = Papa.parse<Record<string, unknown>>(trimmed, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim(),
  });
  const headers = parsed.meta.fields ?? [];

  // Inverse mapping : pour chaque champ GapViz, trouver le header CSV à utiliser.
  const fieldToHeader: Partial<Record<GapVizField, string>> = {};
  for (const [csvHeader, field] of Object.entries(mapping)) {
    if (field === 'ignore') continue;
    // Première colonne trouvée pour ce champ.
    if (!fieldToHeader[field]) fieldToHeader[field] = csvHeader;
  }

  const rows: ParsedRow[] = [];
  const errors: ParseError[] = [];

  const getStr = (row: Record<string, unknown>, field: GapVizField): string | undefined => {
    const col = fieldToHeader[field];
    if (!col) return undefined;
    const v = row[col];
    if (v === undefined || v === null) return undefined;
    const s = String(v).trim();
    return s === '' ? undefined : s;
  };

  parsed.data.forEach((raw, i) => {
    try {
      const keyword = getStr(raw, 'keyword');
      if (!keyword) {
        errors.push({
          rowIndex: i + 2,
          reason: 'keyword manquant',
          raw: stringifyValues(raw),
        });
        return;
      }
      const brandedStr = getStr(raw, 'branded');
      const row: ParsedRow = {
        keyword,
        volume: parseInteger(getStr(raw, 'volume')) ?? 0,
        position: parseInteger(getStr(raw, 'position')),
        kd: parseNumber(getStr(raw, 'kd')),
        cpc: parseNumber(getStr(raw, 'cpc')),
        intent: parseIntent(getStr(raw, 'intent')),
        url: getStr(raw, 'url') ?? null,
        traffic: parseInteger(getStr(raw, 'traffic')),
        serpFeatures: getStr(raw, 'serpFeatures') ?? null,
        branded: brandedStr === undefined ? null : parseBoolean(brandedStr),
      };
      rows.push(row);
    } catch (err) {
      errors.push({
        rowIndex: i + 2,
        reason: err instanceof Error ? err.message : 'parse error',
        raw: stringifyValues(raw),
      });
    }
  });

  return {
    // On marque "ahrefs" car le résultat est désormais structuré comme tel.
    // L'info "c'était un format inconnu" est perdue ici, mais le mapping
    // garantit que les rows sont propres.
    format: 'ahrefs',
    rows,
    errors,
    meta: {
      totalRows: parsed.data.length,
      skippedRows: parsed.data.length - rows.length,
      headers,
    },
  };
}

export async function hashHeaders(headers: string[]): Promise<string> {
  const sorted = headers.map((h) => h.trim().toLowerCase()).sort();
  const text = sorted.join('|');
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
