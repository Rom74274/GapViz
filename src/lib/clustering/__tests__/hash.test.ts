import { describe, it, expect } from 'vitest';
import { hashKeywordSet } from '../hash';

describe('hashKeywordSet', () => {
  it('returns a stable 64-char hex hash', async () => {
    const h = await hashKeywordSet(['logiciel rh', 'planning']);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is order-independent', async () => {
    const a = await hashKeywordSet(['planning', 'sirh', 'paie']);
    const b = await hashKeywordSet(['paie', 'planning', 'sirh']);
    expect(a).toBe(b);
  });

  it('is case-insensitive', async () => {
    const a = await hashKeywordSet(['Planning', 'SIRH']);
    const b = await hashKeywordSet(['planning', 'sirh']);
    expect(a).toBe(b);
  });

  it('trims whitespace', async () => {
    const a = await hashKeywordSet([' planning ', 'sirh']);
    const b = await hashKeywordSet(['planning', 'sirh']);
    expect(a).toBe(b);
  });

  it('differs for different sets', async () => {
    const a = await hashKeywordSet(['planning']);
    const b = await hashKeywordSet(['planning', 'sirh']);
    expect(a).not.toBe(b);
  });
});
