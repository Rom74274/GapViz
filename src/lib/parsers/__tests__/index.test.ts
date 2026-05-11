import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseCSVText } from '../index';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string): string =>
  readFileSync(join(here, 'fixtures', name), 'utf-8');

describe('parseCSVText — Ahrefs', () => {
  const text = fixture('ahrefs.sample.csv');
  const result = parseCSVText(text);

  it('detects Ahrefs format', () => {
    expect(result.format).toBe('ahrefs');
  });

  it('parses 4 valid rows (skips empty keyword)', () => {
    expect(result.rows).toHaveLength(4);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.reason).toMatch(/keyword manquant/);
  });

  it('extracts the first row correctly', () => {
    const row = result.rows[0]!;
    expect(row.keyword).toBe('logiciel planning');
    expect(row.volume).toBe(8100);
    expect(row.position).toBe(3);
    expect(row.kd).toBe(42);
    expect(row.cpc).toBe(2.5);
    expect(row.intent).toEqual(['commercial']);
    expect(row.url).toBe('https://www.skello.io/planning');
  });

  it('parses multi-intent quoted field', () => {
    const row = result.rows[1]!;
    expect(row.intent).toEqual(['informational', 'commercial']);
  });

  it('handles missing CPC as null', () => {
    const row = result.rows.find((r) => r.keyword === 'planning gratuit')!;
    expect(row.cpc).toBeNull();
  });
});

describe('parseCSVText — Ahrefs formatted numbers', () => {
  const text = fixture('ahrefs.formatted.csv');
  const result = parseCSVText(text);

  it('parses thousand-separated volumes', () => {
    expect(result.format).toBe('ahrefs');
    const row = result.rows.find((r) => r.keyword === 'keyword grosVolume')!;
    expect(row.volume).toBe(12500);
  });

  it('parses million-separated volumes', () => {
    const row = result.rows.find((r) => r.keyword === 'keyword volMillions')!;
    expect(row.volume).toBe(1234567);
  });

  it('treats empty / dash volume as 0', () => {
    const empty = result.rows.find((r) => r.keyword === 'keyword vide')!;
    const dash = result.rows.find((r) => r.keyword === 'keyword tiret')!;
    expect(empty.volume).toBe(0);
    expect(dash.volume).toBe(0);
  });

  it('treats dash CPC as null', () => {
    const dash = result.rows.find((r) => r.keyword === 'keyword tiret')!;
    expect(dash.cpc).toBeNull();
  });
});

describe('parseCSVText — SEMrush', () => {
  const text = fixture('semrush.sample.csv');
  const result = parseCSVText(text);

  it('detects SEMrush format', () => {
    expect(result.format).toBe('semrush');
  });

  it('parses 4 valid rows', () => {
    expect(result.rows).toHaveLength(4);
  });

  it('extracts the first row with KD from "Keyword Difficulty"', () => {
    const row = result.rows[0]!;
    expect(row.keyword).toBe('logiciel rh');
    expect(row.volume).toBe(5400);
    expect(row.kd).toBe(55);
    expect(row.intent).toEqual(['commercial']);
  });

  it('parses multi-intent from "Keyword Intents"', () => {
    const row = result.rows.find((r) => r.keyword === 'sirh')!;
    expect(row.intent).toEqual(['commercial', 'transactional']);
  });
});

describe('parseCSVText — GSC', () => {
  const text = fixture('gsc.sample.csv');
  const result = parseCSVText(text);

  it('detects GSC format', () => {
    expect(result.format).toBe('gsc');
  });

  it('parses 4 valid rows (skips empty query)', () => {
    expect(result.rows).toHaveLength(4);
  });

  it('uses Impressions as volume proxy', () => {
    const row = result.rows[0]!;
    expect(row.keyword).toBe('logiciel planning');
    expect(row.volume).toBe(8100);
    expect(row.position).toBe(3.2);
    expect(row.kd).toBeNull();
    expect(row.cpc).toBeNull();
    expect(row.intent).toEqual([]);
  });
});

describe('parseCSVText — unknown format', () => {
  const text = fixture('unknown.sample.csv');
  const result = parseCSVText(text);

  it('returns unknown format with no rows', () => {
    expect(result.format).toBe('unknown');
    expect(result.rows).toEqual([]);
    expect(result.meta.skippedRows).toBe(result.meta.totalRows);
  });
});

describe('parseCSVText — BOM handling', () => {
  it('strips UTF-8 BOM at file start', () => {
    const text = '﻿Keyword,Volume,KD\nfoo,100,30\n';
    const result = parseCSVText(text);
    expect(result.format).toBe('ahrefs');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.keyword).toBe('foo');
  });
});

describe('parseCSVText — Ahrefs real export (boolean intent columns)', () => {
  const text = fixture('ahrefs.real.csv');
  const result = parseCSVText(text);

  it('detects Ahrefs from "Volume" + "Keyword Difficulty"', () => {
    expect(result.format).toBe('ahrefs');
  });

  it('parses 5 rows', () => {
    expect(result.rows).toHaveLength(5);
  });

  it('reads "Current position" as position', () => {
    const row = result.rows.find((r) => r.keyword === 'logiciel planning')!;
    expect(row.position).toBe(3);
  });

  it('reads "Keyword Difficulty" as kd', () => {
    const row = result.rows.find((r) => r.keyword === 'logiciel planning')!;
    expect(row.kd).toBe(42);
  });

  it('extracts intent from boolean columns (single)', () => {
    const row = result.rows.find((r) => r.keyword === 'sirh')!;
    expect(row.intent).toEqual(['informational']);
  });

  it('extracts intent from boolean columns (multiple)', () => {
    const row = result.rows.find((r) => r.keyword === 'gestion des plannings')!;
    expect(row.intent).toEqual(['informational', 'commercial']);
  });

  it('extracts navigational intent', () => {
    const row = result.rows.find((r) => r.keyword === 'skello connexion')!;
    expect(row.intent).toEqual(['navigational']);
  });
});

describe('parseCSVText — Ahrefs avec colonne "Intents" pluriel', () => {
  const text = fixture('ahrefs.intents-plural.csv');
  const result = parseCSVText(text);

  it('détecte Ahrefs même avec la colonne Intents (pluriel)', () => {
    expect(result.format).toBe('ahrefs');
  });

  it('extrait un intent simple depuis "Intents"', () => {
    const r = result.rows.find((row) => row.keyword === 'sirh')!;
    expect(r.intent).toEqual(['informational']);
  });

  it('extrait plusieurs intents depuis "Intents" (séparés par virgule)', () => {
    const r = result.rows.find((row) => row.keyword === 'logiciel planning')!;
    expect(r.intent).toEqual(['informational', 'commercial']);
  });

  it('extrait un intent transactional depuis "Intents"', () => {
    const r = result.rows.find((row) => row.keyword === 'gestion des plannings')!;
    expect(r.intent).toEqual(['transactional']);
  });
});

describe('parseCSVText — forceFormat override', () => {
  it('respects forceFormat option', () => {
    const text = 'Keyword,Volume\nfoo,100\n';
    const result = parseCSVText(text, { forceFormat: 'ahrefs' });
    expect(result.format).toBe('ahrefs');
    expect(result.rows).toHaveLength(1);
  });
});
