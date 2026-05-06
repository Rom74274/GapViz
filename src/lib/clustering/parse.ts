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

// Tente d'isoler un objet JSON dans un texte (au cas où Claude ajoute un préambule).
function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // continue
  }

  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new ClusterParseError('Aucun objet JSON détecté dans la réponse');
  }
  try {
    return JSON.parse(trimmed.slice(start, end + 1));
  } catch (err) {
    throw new ClusterParseError(
      `JSON invalide : ${err instanceof Error ? err.message : 'parse error'}`,
    );
  }
}

export function parseClusterResponse(
  responseText: string,
  inputKeywords: string[],
): ParsedClusterResponse {
  const data = extractJson(responseText);

  if (typeof data !== 'object' || data === null) {
    throw new ClusterParseError('Réponse n\'est pas un objet JSON');
  }
  const obj = data as Record<string, unknown>;
  if (!Array.isArray(obj.clusters)) {
    throw new ClusterParseError('Champ "clusters" manquant ou non-array');
  }

  // Index des mots-clés d'entrée par leur forme normalisée → forme originale.
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
