import { describe, it, expect } from 'vitest';
import { parseSemrushCsv } from '../../../../supabase/functions/extension-import/parsers/semrush.ts';
import { parseAhrefsCsv } from '../../../../supabase/functions/extension-import/parsers/ahrefs.ts';

// Convertit un string CSV en ArrayBuffer (UTF-8 sans BOM).
function csvToBuffer(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer as ArrayBuffer;
}

// Avec BOM UTF-8 → simule un export Excel-compatible.
function csvToBufferWithBom(text: string): ArrayBuffer {
  const enc = new TextEncoder();
  const body = enc.encode(text);
  const out = new Uint8Array(body.length + 3);
  out[0] = 0xef; out[1] = 0xbb; out[2] = 0xbf;
  out.set(body, 3);
  return out.buffer;
}

describe('parseSemrushCsv', () => {
  it('parse un export Semrush Organic Positions au format US (séparateur virgule)', () => {
    const csv = [
      'Keyword,Position,Previous position,Position Difference,Search Volume,Keyword Difficulty,CPC,URL,Traffic (%),Traffic Cost (%),Competition,Number of Results,Trends,Timestamp,SERP Features by Keyword,Keyword Intents,Position Type',
      'seo tools,3,4,1,50000,72,4.50,https://example.com/seo,12.50,8.30,0.85,12500000,"1,2,3",2026-06-01,"Sitelinks, People also ask",commercial,Organic',
      'keyword research,5,5,0,18000,65,3.10,https://example.com/kw,6.20,4.10,0.78,8200000,"3,4,5",2026-06-01,"Featured snippet",informational,Organic',
      'rank tracker,8,10,2,9000,58,2.80,https://example.com/rank,2.10,1.50,0.65,3100000,"5,6,7",2026-06-01,"",commercial,Organic',
    ].join('\n');

    const rows = parseSemrushCsv(csvToBuffer(csv));

    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      keyword: 'seo tools',
      position: 3,
      volume: 50000,
      kd: 72,
      cpc: 4.5,
      url: 'https://example.com/seo',
    });
    expect(rows[1]?.keyword).toBe('keyword research');
    expect(rows[2]?.position).toBe(8);
  });

  it('gère le séparateur point-virgule (export Semrush en mode Excel européen)', () => {
    const csv = [
      'Keyword;Position;Search Volume;Keyword Difficulty;CPC;URL',
      'référencement;2;12000;68;3,20;https://exemple.fr/seo',
      'mots-clés;7;4500;55;1,80;https://exemple.fr/kw',
    ].join('\n');

    const rows = parseSemrushCsv(csvToBuffer(csv));
    expect(rows).toHaveLength(2);
    expect(rows[0]?.keyword).toBe('référencement');
    expect(rows[0]?.position).toBe(2);
    expect(rows[0]?.cpc).toBe(3.2);
  });

  it("gère un BOM UTF-8 en tête de fichier", () => {
    const csv = [
      'Keyword,Position,Search Volume,Keyword Difficulty,CPC,URL',
      'test,1,1000,50,1.00,https://example.com',
    ].join('\n');
    const rows = parseSemrushCsv(csvToBufferWithBom(csv));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.keyword).toBe('test');
  });

  it('clamp position hors plage [1, 1000] et kd hors [0, 100] à null', () => {
    const csv = [
      'Keyword,Position,Search Volume,Keyword Difficulty,CPC,URL',
      'bad position,9999,100,50,1.00,https://example.com',
      'bad kd,5,100,150,1.00,https://example.com',
    ].join('\n');
    const rows = parseSemrushCsv(csvToBuffer(csv));
    expect(rows[0]?.position).toBeNull();
    expect(rows[1]?.kd).toBeNull();
  });

  it('ignore les lignes avec keyword vide', () => {
    const csv = [
      'Keyword,Position,Search Volume,Keyword Difficulty,CPC,URL',
      ',5,1000,50,1.00,https://example.com',
      'valid,3,2000,40,2.00,https://example.com',
    ].join('\n');
    const rows = parseSemrushCsv(csvToBuffer(csv));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.keyword).toBe('valid');
  });

  it("throw si la colonne Keyword est introuvable", () => {
    const csv = 'Foo,Bar\n1,2';
    expect(() => parseSemrushCsv(csvToBuffer(csv))).toThrow(/Keyword/);
  });
});

describe('parseAhrefsCsv (non-régression après split)', () => {
  it('parse un export Ahrefs au format tab-separated UTF-16 LE', () => {
    const csv = [
      ['Keyword', 'Current position', 'Volume', 'KD', 'CPC', 'Current URL'].join('\t'),
      ['seo tools', '3', '50000', '72', '4.50', 'https://example.com/seo'].join('\t'),
      ['keyword research', '5', '18000', '65', '3.10', 'https://example.com/kw'].join('\t'),
    ].join('\n');

    // UTF-16 LE avec BOM (cas typique Ahrefs)
    const enc = new TextEncoder();
    const bom = new Uint8Array([0xff, 0xfe]);
    const body = new Uint8Array(csv.length * 2);
    for (let i = 0; i < csv.length; i++) {
      const code = csv.charCodeAt(i);
      body[i * 2] = code & 0xff;
      body[i * 2 + 1] = (code >> 8) & 0xff;
    }
    const buf = new Uint8Array(bom.length + body.length);
    buf.set(bom, 0);
    buf.set(body, bom.length);
    void enc; // silence unused

    const rows = parseAhrefsCsv(buf.buffer);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.keyword).toBe('seo tools');
    expect(rows[0]?.position).toBe(3);
    expect(rows[0]?.volume).toBe(50000);
  });
});
