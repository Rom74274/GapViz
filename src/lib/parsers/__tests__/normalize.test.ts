import { describe, it, expect } from 'vitest';
import { parseNumber, parseInteger, parseIntent, getCol } from '../normalize';

describe('parseNumber', () => {
  it('parses simple integers', () => {
    expect(parseNumber('1234')).toBe(1234);
    expect(parseNumber('0')).toBe(0);
  });

  it('parses floats', () => {
    expect(parseNumber('1.5')).toBe(1.5);
    expect(parseNumber('42.0')).toBe(42);
  });

  it('strips thousand separators', () => {
    expect(parseNumber('12,500')).toBe(12500);
    expect(parseNumber('1,234,567')).toBe(1234567);
  });

  it('strips whitespace', () => {
    expect(parseNumber(' 100 ')).toBe(100);
    expect(parseNumber('1 000')).toBe(1000);
  });

  it('returns null for empty / invalid / placeholder', () => {
    expect(parseNumber('')).toBeNull();
    expect(parseNumber(undefined)).toBeNull();
    expect(parseNumber('-')).toBeNull();
    expect(parseNumber('N/A')).toBeNull();
    expect(parseNumber('abc')).toBeNull();
  });

  it('parses percentages as plain numbers (drops the percent semantic)', () => {
    expect(parseNumber('5.18')).toBe(5.18);
  });
});

describe('parseInteger', () => {
  it('rounds floats', () => {
    expect(parseInteger('1.7')).toBe(2);
    expect(parseInteger('1.4')).toBe(1);
  });

  it('returns null for invalid', () => {
    expect(parseInteger('-')).toBeNull();
  });
});

describe('parseIntent', () => {
  it('returns empty for missing', () => {
    expect(parseIntent(undefined)).toEqual([]);
    expect(parseIntent('')).toEqual([]);
  });

  it('parses single intent', () => {
    expect(parseIntent('Commercial')).toEqual(['commercial']);
  });

  it('parses comma-separated intents', () => {
    expect(parseIntent('Informational, Commercial')).toEqual([
      'informational',
      'commercial',
    ]);
  });

  it('handles semicolons and pipes', () => {
    expect(parseIntent('commercial;transactional|informational')).toEqual([
      'commercial',
      'transactional',
      'informational',
    ]);
  });

  it('drops unknown values', () => {
    expect(parseIntent('Commercial, Foo, Bar')).toEqual(['commercial']);
  });
});

describe('getCol', () => {
  it('finds column case-insensitively', () => {
    expect(getCol({ Keyword: 'foo' }, 'keyword')).toBe('foo');
    expect(getCol({ KEYWORD: 'foo' }, 'Keyword')).toBe('foo');
  });

  it('trims whitespace from keys and values', () => {
    expect(getCol({ ' Keyword ': '  foo  ' }, 'Keyword')).toBe('foo');
  });

  it('tries fallback names in order', () => {
    expect(getCol({ Volume: '100' }, 'Search Volume', 'Volume')).toBe('100');
  });

  it('returns undefined when missing or empty', () => {
    expect(getCol({}, 'Keyword')).toBeUndefined();
    expect(getCol({ Keyword: '' }, 'Keyword')).toBeUndefined();
    expect(getCol({ Keyword: '   ' }, 'Keyword')).toBeUndefined();
  });
});
