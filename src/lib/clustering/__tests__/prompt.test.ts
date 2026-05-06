import { describe, it, expect } from 'vitest';
import { SYSTEM_PROMPT, buildUserMessage } from '../prompt';

describe('SYSTEM_PROMPT', () => {
  it('is non-empty and asks for JSON', () => {
    expect(SYSTEM_PROMPT.length).toBeGreaterThan(100);
    expect(SYSTEM_PROMPT).toMatch(/JSON/);
  });

  it('mentions the cluster name format constraint', () => {
    expect(SYSTEM_PROMPT).toMatch(/2 à 4 mots/);
  });

  it('mentions "Divers" as last resort', () => {
    expect(SYSTEM_PROMPT).toMatch(/Divers/);
  });
});

describe('buildUserMessage', () => {
  it('includes the keyword count', () => {
    const m = buildUserMessage(['a', 'b', 'c']);
    expect(m).toMatch(/3 mots-clés/);
  });

  it('includes a numbered list', () => {
    const m = buildUserMessage(['kw1', 'kw2']);
    expect(m).toMatch(/1\. kw1/);
    expect(m).toMatch(/2\. kw2/);
  });
});
