import { describe, it, expect } from 'vitest';
import { parseClusterResponse, ClusterParseError } from '../parse';

const INPUT = ['logiciel planning', 'gestion paie', 'planning équipe', 'sirh'];

describe('parseClusterResponse', () => {
  it('parses a clean JSON response', () => {
    const text = JSON.stringify({
      clusters: [
        { name: 'Planning', keywords: ['logiciel planning', 'planning équipe'] },
        { name: 'Paie & RH', keywords: ['gestion paie', 'sirh'] },
      ],
    });
    const r = parseClusterResponse(text, INPUT);
    expect(r.clusters).toHaveLength(2);
    expect(r.clusters[0]!.keywords).toEqual(['logiciel planning', 'planning équipe']);
    expect(r.unmatched).toEqual([]);
  });

  it('extracts JSON when surrounded by prose', () => {
    const text = `Voici les clusters :\n${JSON.stringify({
      clusters: [{ name: 'Planning', keywords: INPUT }],
    })}\nMerci !`;
    const r = parseClusterResponse(text, INPUT);
    expect(r.clusters).toHaveLength(1);
    expect(r.clusters[0]!.keywords).toHaveLength(4);
  });

  it('reports unmatched keywords', () => {
    const text = JSON.stringify({
      clusters: [
        { name: 'Planning', keywords: ['logiciel planning', 'planning équipe'] },
      ],
    });
    const r = parseClusterResponse(text, INPUT);
    expect(r.unmatched).toEqual(['gestion paie', 'sirh']);
  });

  it('matches keywords case-insensitively', () => {
    const text = JSON.stringify({
      clusters: [{ name: 'Planning', keywords: ['LOGICIEL PLANNING'] }],
    });
    const r = parseClusterResponse(text, INPUT);
    expect(r.clusters[0]!.keywords).toEqual(['logiciel planning']);
  });

  it('drops invented keywords (not in input)', () => {
    const text = JSON.stringify({
      clusters: [
        { name: 'Cluster', keywords: ['logiciel planning', 'inventé', 'sirh'] },
      ],
    });
    const r = parseClusterResponse(text, INPUT);
    expect(r.clusters[0]!.keywords).toEqual(['logiciel planning', 'sirh']);
  });

  it('drops empty clusters', () => {
    const text = JSON.stringify({
      clusters: [
        { name: 'Vide', keywords: ['inventé1', 'inventé2'] },
        { name: 'Bon', keywords: ['logiciel planning'] },
      ],
    });
    const r = parseClusterResponse(text, INPUT);
    expect(r.clusters).toHaveLength(1);
    expect(r.clusters[0]!.name).toBe('Bon');
  });

  it('avoids duplicate assignments (KW classed in 2 clusters)', () => {
    const text = JSON.stringify({
      clusters: [
        { name: 'A', keywords: ['logiciel planning'] },
        { name: 'B', keywords: ['logiciel planning'] },
      ],
    });
    const r = parseClusterResponse(text, INPUT);
    expect(r.clusters).toHaveLength(1);
    expect(r.clusters[0]!.name).toBe('A');
  });

  it('throws on non-JSON', () => {
    expect(() => parseClusterResponse('plain text', INPUT)).toThrow(
      ClusterParseError,
    );
  });

  it('throws when clusters field is missing', () => {
    expect(() => parseClusterResponse('{"foo": "bar"}', INPUT)).toThrow(
      ClusterParseError,
    );
  });

  it('throws when no valid cluster could be reconstructed', () => {
    const text = JSON.stringify({
      clusters: [{ name: 'X', keywords: ['fakekw'] }],
    });
    expect(() => parseClusterResponse(text, INPUT)).toThrow(ClusterParseError);
  });

  it('handles trailing text after valid JSON (Claude epilog)', () => {
    const json = JSON.stringify({
      clusters: [{ name: 'Planning', keywords: ['logiciel planning'] }],
    });
    const text = json + '\n\nJ\'espère que ces clusters te conviennent !';
    const r = parseClusterResponse(text, INPUT);
    expect(r.clusters).toHaveLength(1);
    expect(r.clusters[0]!.keywords).toEqual(['logiciel planning']);
  });

  it('handles a second JSON object after the first (Claude double output)', () => {
    const first = JSON.stringify({
      clusters: [{ name: 'Planning', keywords: ['logiciel planning'] }],
    });
    const second = JSON.stringify({ note: 'extra' });
    const r = parseClusterResponse(`${first}\n${second}`, INPUT);
    expect(r.clusters).toHaveLength(1);
    expect(r.clusters[0]!.name).toBe('Planning');
  });

  it('handles markdown code fences ```json ... ```', () => {
    const json = JSON.stringify({
      clusters: [{ name: 'Paie', keywords: ['gestion paie'] }],
    });
    const text = '```json\n' + json + '\n```';
    const r = parseClusterResponse(text, INPUT);
    expect(r.clusters[0]!.name).toBe('Paie');
  });

  it('handles markdown code fences without language tag', () => {
    const json = JSON.stringify({
      clusters: [{ name: 'Paie', keywords: ['gestion paie'] }],
    });
    const text = '```\n' + json + '\n```';
    const r = parseClusterResponse(text, INPUT);
    expect(r.clusters[0]!.name).toBe('Paie');
  });

  it('handles nested braces inside a string (escaped)', () => {
    // KW contenant des accolades dans une string : "kw with {brace}".
    // Notre extractor ne doit pas se laisser tromper par les { dans les strings.
    const json = '{"clusters":[{"name":"Test","keywords":["logiciel planning","sirh"]}]}';
    const text = 'Voici le JSON :\n' + json + '\n{ "comment": "{ inside }" }';
    const r = parseClusterResponse(text, INPUT);
    expect(r.clusters[0]!.keywords).toEqual(['logiciel planning', 'sirh']);
  });

  it('handles escaped quotes inside strings', () => {
    const json = '{"clusters":[{"name":"Test \\"quoted\\" cluster","keywords":["sirh"]}]}';
    const r = parseClusterResponse(json, INPUT);
    expect(r.clusters[0]!.name).toBe('Test "quoted" cluster');
  });

  it('handles leading explanation before JSON', () => {
    const json = JSON.stringify({
      clusters: [{ name: 'Planning', keywords: ['logiciel planning'] }],
    });
    const text =
      'Voici les clusters que j\'ai identifiés pour ton projet :\n\n' + json;
    const r = parseClusterResponse(text, INPUT);
    expect(r.clusters[0]!.name).toBe('Planning');
  });
});
