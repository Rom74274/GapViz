import type { GraphNode, KeywordNode } from '@/components/graph/graphLayout';
import type { FilterState } from './filterStore';

const YEAR_PATTERN = /\b(?:19|20)\d{2}\b/g;
const currentYearAtBuildTime = new Date().getFullYear();

export function containsPastYear(keyword: string, refYear = currentYearAtBuildTime): boolean {
  const matches = keyword.match(YEAR_PATTERN);
  if (!matches) return false;
  return matches.some((y) => parseInt(y, 10) < refYear);
}

// Opacité appliquée dans le GRAPHE à un mot-clé qui passe tous les filtres
// « durs » mais qui n'est pas une opportunité, quand le filtre Opportunités est
// actif. On l'estompe fortement au lieu de le cacher : la structure reste
// lisible et les vraies opportunités ressortent par contraste.
export const GAP_DIM_OPACITY = 0.07;

// Filtres « durs » : tout SAUF gapOnly. Un KW qui les rate est réellement caché
// partout (graphe, table, export). gapOnly est traité à part car, dans le
// graphe, il estompe au lieu de cacher.
function passesHardFilters(node: KeywordNode, f: FilterState): boolean {
  if (f.activeSites !== null) {
    if (!node.sources.some((s) => f.activeSites!.includes(s.domain))) return false;
  }
  if (f.volumeRange) {
    if (node.volume < f.volumeRange[0] || node.volume > f.volumeRange[1]) return false;
  }
  if (f.kdRange) {
    if (node.kd === null) return false;
    if (node.kd < f.kdRange[0] || node.kd > f.kdRange[1]) return false;
  }
  if (f.intents !== null && node.intent.length > 0) {
    // Important : un KW sans intent passe le filtre (cas typique d'un CSV
    // sans colonne intent). Seuls les KWs avec un intent connu qui ne match
    // pas sont exclus.
    const allowed = f.intents;
    if (!node.intent.some((i) => allowed.includes(i))) return false;
  }
  if (f.excludedClusters.length > 0 && f.excludedClusters.includes(node.clusterId)) {
    return false;
  }
  if (f.activeClusters !== null) {
    if (!f.activeClusters.includes(node.clusterId)) return false;
  }
  if (f.hideDatedKeywords && containsPastYear(node.keyword)) return false;
  if (f.hideBranded && node.branded) return false;
  if (f.positionRange) {
    const sources =
      f.activeSites !== null
        ? node.sources.filter((s) => f.activeSites!.includes(s.domain))
        : node.sources;
    if (
      !sources.some(
        (s) =>
          s.position !== null &&
          s.position >= f.positionRange![0] &&
          s.position <= f.positionRange![1],
      )
    ) {
      return false;
    }
  }
  return true;
}

// Visibilité stricte (table de KW, export) : gapOnly CACHE les non-opportunités.
export function isKeywordVisible(node: KeywordNode, f: FilterState): boolean {
  if (!passesHardFilters(node, f)) return false;
  if (f.gapOnly && !node.isGap) return false;
  return true;
}

// Opacité cible dans le GRAPHE : 0 = caché, GAP_DIM_OPACITY = estompé, 1 = plein.
// Différence clé avec isKeywordVisible : gapOnly n'y cache pas les non-gaps, il
// les estompe pour garder le contexte visible.
export function keywordGraphOpacity(node: KeywordNode, f: FilterState): number {
  if (!passesHardFilters(node, f)) return 0;
  if (f.gapOnly && !node.isGap) return GAP_DIM_OPACITY;
  return 1;
}

// Opacités cibles par nœud pour le graphe.
// - keyword : keywordGraphOpacity (0 / estompé / 1)
// - cluster : max des opacités de ses KW (un cluster tout estompé s'estompe,
//   un cluster avec au moins une opportunité reste plein)
// - center  : toujours 1
// visibleKwCount ne compte que les KW à pleine opacité (les vraies
// opportunités quand le filtre est actif), pour un compteur qui a du sens.
export function computeNodeVisibility(
  nodes: GraphNode[],
  f: FilterState,
): { opacityTargets: Map<string, number>; visibleKwCount: number; totalKwCount: number } {
  const opacityTargets = new Map<string, number>();
  let totalKw = 0;
  let fullKwCount = 0;
  const clusterMaxOp = new Map<string, number>();
  for (const n of nodes) {
    if (n.kind !== 'keyword') continue;
    totalKw++;
    const op = keywordGraphOpacity(n, f);
    opacityTargets.set(n.id, op);
    if (op >= 1) fullKwCount++;
    const prev = clusterMaxOp.get(n.clusterId) ?? 0;
    if (op > prev) clusterMaxOp.set(n.clusterId, op);
  }
  for (const n of nodes) {
    if (n.kind === 'center') opacityTargets.set(n.id, 1);
    else if (n.kind === 'cluster') {
      opacityTargets.set(n.id, clusterMaxOp.get(n.clusterId) ?? 0);
    }
  }
  return { opacityTargets, visibleKwCount: fullKwCount, totalKwCount: totalKw };
}

// Part des gaps mis en lumière comme « vraies opportunités » (top du score).
const OPPORTUNITY_TOP_RATIO = 0.18;

// Score d'opportunité d'un gap = volume × accessibilité × validation concurrent.
//  - volume        : potentiel de trafic (brut)
//  - accessibilité : (100 - KD)/100 → plus la difficulté est faible, mieux c'est
//                    (KD inconnu → 0.6, neutre)
//  - validation    : un concurrent bien classé prouve que le mot-clé est rankable
//                    et pertinent (meilleure position d'un concurrent)
// Ce n'est PAS « tout KW hors de toi » : un gap sans volume, très difficile ou où
// aucun concurrent n'est bien classé obtient un score faible et n'est pas allumé.
function opportunityScore(n: KeywordNode): number {
  const vol = Math.max(0, n.volume);
  if (vol <= 0) return 0; // sans volume, pas d'opportunité mesurable
  const access = n.kd == null ? 0.6 : Math.max(0.05, (100 - Math.min(100, Math.max(0, n.kd))) / 100);
  let bestPos = Infinity;
  for (const s of n.sources) {
    if (s.position != null && s.position < bestPos) bestPos = s.position;
  }
  let validation: number;
  if (!isFinite(bestPos)) validation = 0.5;
  else if (bestPos <= 3) validation = 1;
  else if (bestPos <= 10) validation = 0.8;
  else if (bestPos <= 20) validation = 0.55;
  else if (bestPos <= 50) validation = 0.3;
  else validation = 0.15;
  return vol * access * validation;
}

// Map<id, intensité 0..1> pour les SEULES vraies opportunités (top ~18 % des gaps
// par score). L'intensité (glow) est graduée : la meilleure opportunité = 1.
// Les gaps hors top ne sont pas dans la map → pas de glow (mais restent visibles).
export function computeOpportunityGlow(nodes: GraphNode[]): Map<string, number> {
  const scored: { id: string; score: number }[] = [];
  for (const n of nodes) {
    if (n.kind !== 'keyword' || !n.isGap) continue;
    const score = opportunityScore(n);
    if (score > 0) scored.push({ id: n.id, score });
  }
  const glow = new Map<string, number>();
  if (scored.length === 0) return glow;
  scored.sort((a, b) => b.score - a.score);
  const topN = Math.max(1, Math.ceil(scored.length * OPPORTUNITY_TOP_RATIO));
  const maxScore = scored[0]!.score || 1;
  for (let i = 0; i < topN; i++) {
    const { id, score } = scored[i]!;
    glow.set(id, 0.35 + 0.65 * (score / maxScore));
  }
  return glow;
}
