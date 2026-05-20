// Copie verbatim de src/lib/clustering/parse.ts pour isoler l'Edge
// Function du codebase browser.

export interface ClusterAssignment {
  name: string;
  keywords: string[];
}

export interface ParsedClusterResponse {
  clusters: ClusterAssignment[];
  unmatched: string[];
}

export class ClusterParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClusterParseError';
  }
}

function extractJson(text: string): unknown {
  let trimmed = text.trim();

  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch && fenceMatch[1]) {
    trimmed = fenceMatch[1].trim();
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    // continue
  }

  const extracted = extractFirstBalancedObject(trimmed);
  if (extracted === null) {
    throw new ClusterParseError('Aucun objet JSON balanced détecté dans la réponse');
  }
  try {
    return JSON.parse(extracted);
  } catch (err) {
    throw new ClusterParseError(
      `JSON invalide : ${err instanceof Error ? err.message : 'parse error'}`,
    );
  }
}

function extractFirstBalancedObject(text: string): string | null {
  let depth = 0;
  let inString = false;
  let escape = false;
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (ch === '\\') {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        return text.slice(start, i + 1);
      }
    }
  }
  return null;
}

export function parseClusterResponse(
  responseText: string,
  inputKeywords: string[],
): ParsedClusterResponse {
  const data = extractJson(responseText);

  if (typeof data !== 'object' || data === null) {
    throw new ClusterParseError("Réponse n'est pas un objet JSON");
  }
  const obj = data as Record<string, unknown>;
  if (!Array.isArray(obj.clusters)) {
    throw new ClusterParseError('Champ "clusters" manquant ou non-array');
  }

  const inputIndex = new Map<string, string>();
  for (const kw of inputKeywords) {
    inputIndex.set(normalize(kw), kw);
  }
  const matched = new Set<string>();
  const clusters: ClusterAssignment[] = [];

  for (const raw of obj.clusters) {
    if (typeof raw !== 'object' || raw === null) continue;
    const c = raw as Record<string, unknown>;
    const name = typeof c.name === 'string' ? c.name.trim() : '';
    const kwArr = Array.isArray(c.keywords) ? c.keywords : [];
    if (!name || kwArr.length === 0) continue;

    const cleanKeywords: string[] = [];
    for (const kw of kwArr) {
      if (typeof kw !== 'string') continue;
      const original = inputIndex.get(normalize(kw));
      if (original && !matched.has(original)) {
        cleanKeywords.push(original);
        matched.add(original);
      }
    }
    if (cleanKeywords.length > 0) {
      clusters.push({ name, keywords: cleanKeywords });
    }
  }

  if (clusters.length === 0) {
    throw new ClusterParseError('Aucun cluster valide dans la réponse');
  }

  const unmatched = inputKeywords.filter((kw) => !matched.has(kw));

  return { clusters, unmatched };
}

function normalize(s: string): string {
  return s.trim().toLowerCase();
}
