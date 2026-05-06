import Papa from 'papaparse';
import { detectFormat } from './detect';
import { parseAhrefsRow } from './ahrefs';
import { parseSemrushRow } from './semrush';
import { parseGscRow } from './gsc';
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
