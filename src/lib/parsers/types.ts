import type { Intent } from '@/lib/db';

export type SourceFormat = 'ahrefs' | 'semrush' | 'gsc' | 'unknown';

export interface ParsedRow {
  keyword: string;
  volume: number;
  position: number | null;
  kd: number | null;
  cpc: number | null;
  intent: Intent[];
  url: string | null;
  traffic?: number | null;
  serpFeatures?: string | null;
  branded?: boolean | null;
}

export interface ParseError {
  rowIndex: number;
  reason: string;
  raw: Record<string, string>;
}

export interface ParseResult {
  format: SourceFormat;
  rows: ParsedRow[];
  errors: ParseError[];
  meta: {
    totalRows: number;
    skippedRows: number;
    headers: string[];
  };
}
