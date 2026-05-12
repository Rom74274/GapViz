import type { GraphNode, KeywordNode } from '@/components/graph/graphLayout';
import type { FilterState } from './filterStore';

const YEAR_PATTERN = /\b(?:19|20)\d{2}\b/g;
const currentYearAtBuildTime = new Date().getFullYear();

export function containsPastYear(keyword: string, refYear = currentYearAtBuildTime): boolean {
  const matches = keyword.match(YEAR_PATTERN);
  if (!matches) return false;
  return matches.some((y) => parseInt(y, 10) < refYear);
}

export function isKeywordVisible(node: KeywordNode, f: FilterState): boolean {
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
  if (f.intents !== null) {
    const allowed = f.intents;
    if (!node.intent.some((i) => allowed.includes(i))) return false;
  }
  if (f.gapOnly && !node.isGap) return false;
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

// Visibility per node : keyword via isKeywordVisible, cluster meta via
// "au moins 1 KW visible", center toujours visible.
export function computeNodeVisibility(
  nodes: GraphNode[],
  f: FilterState,
): { visible: Set<string>; visibleKwCount: number; totalKwCount: number } {
  const visibleKwIds = new Set<string>();
  let totalKw = 0;
  const visibleClusterIds = new Set<string>();
  for (const n of nodes) {
    if (n.kind !== 'keyword') continue;
    totalKw++;
    if (isKeywordVisible(n, f)) {
      visibleKwIds.add(n.id);
      visibleClusterIds.add(n.clusterId);
    }
  }
  const visible = new Set<string>(visibleKwIds);
  for (const n of nodes) {
    if (n.kind === 'center') visible.add(n.id);
    else if (n.kind === 'cluster' && visibleClusterIds.has(n.clusterId)) visible.add(n.id);
  }
  return { visible, visibleKwCount: visibleKwIds.size, totalKwCount: totalKw };
}
