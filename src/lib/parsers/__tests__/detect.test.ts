import { describe, it, expect } from 'vitest';
import { detectFormat } from '../detect';

describe('detectFormat', () => {
  it('detects Ahrefs from "Volume" + "KD"', () => {
    expect(
      detectFormat(['Keyword', 'Volume', 'KD', 'CPC', 'URL']),
    ).toBe('ahrefs');
  });

  it('detects SEMrush from "Search Volume"', () => {
    expect(
      detectFormat(['Keyword', 'Position', 'Search Volume', 'CPC']),
    ).toBe('semrush');
  });

  it('detects SEMrush from "Keyword Difficulty"', () => {
    expect(
      detectFormat(['Keyword', 'Keyword Difficulty', 'CPC']),
    ).toBe('semrush');
  });

  it('detects GSC from "Impressions" + "Clicks"', () => {
    expect(
      detectFormat(['Top queries', 'Clicks', 'Impressions', 'CTR', 'Position']),
    ).toBe('gsc');
  });

  it('is case-insensitive', () => {
    expect(detectFormat(['KEYWORD', 'volume', 'kd'])).toBe('ahrefs');
    expect(detectFormat(['top queries', 'IMPRESSIONS', 'clicks'])).toBe('gsc');
  });

  it('returns unknown for unrecognized columns', () => {
    expect(detectFormat(['foo', 'bar', 'baz'])).toBe('unknown');
    expect(detectFormat([])).toBe('unknown');
  });

  it('prefers GSC when Impressions/Clicks present even with other keywords', () => {
    expect(
      detectFormat(['Top queries', 'Clicks', 'Impressions', 'CTR', 'Position']),
    ).toBe('gsc');
  });

  it('prefers SEMrush over Ahrefs when both signals present', () => {
    expect(
      detectFormat(['Keyword', 'Search Volume', 'KD']),
    ).toBe('semrush');
  });
});
