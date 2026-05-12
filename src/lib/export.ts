import type { KeywordNode } from '@/components/graph/graphLayout';
import type { FilterState } from './filterStore';

// ---------------------------------------------------------------------------
// CSV helpers
// ---------------------------------------------------------------------------

function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function rowsToCSV(rows: Array<Array<string | number | null | undefined>>): string {
  return rows.map((r) => r.map(escapeCsv).join(',')).join('\n');
}

function downloadCSV(csv: string, filename: string): void {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Filename
// ---------------------------------------------------------------------------

export function buildExportFilename(
  projectName: string,
  filters: FilterState,
  prefix: string,
): string {
  const date = new Date().toISOString().slice(0, 10);
  const slug = projectName
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  const suffixes: string[] = [];
  if (filters.gapOnly) suffixes.push('gaps_only');
  let count = 0;
  if (filters.activeSites !== null) count++;
  if (filters.activeClusters !== null) count++;
  if (filters.intents !== null) count++;
  if (filters.volumeRange !== null) count++;
  if (filters.kdRange !== null) count++;
  if (filters.positionRange !== null) count++;
  if (filters.gapOnly) count++;
  if (count > 0 && !filters.gapOnly) suffixes.push(`${count}filters`);
  if (count > 1 && filters.gapOnly) suffixes.push(`${count - 1}filters`);
  const suffix = suffixes.length > 0 ? '_' + suffixes.join('_') : '';
  return `${slug}_${prefix}_${date}${suffix}.csv`;
}

// ---------------------------------------------------------------------------
// Standard CSV export
// ---------------------------------------------------------------------------

export function exportKeywordsCSV(
  visibleKws: KeywordNode[],
  projectName: string,
  filters: FilterState,
): void {
  const sorted = [...visibleKws].sort((a, b) => b.volume - a.volume);

  const rows: Array<Array<string | number | null>> = [];
  rows.push([
    'Keyword',
    'Volume',
    'KD',
    'CPC',
    'Trafic est.',
    'Cluster',
    'Intent',
    'Branded',
    'SERP features',
    'Est un gap',
    'Position',
    'URL',
    'Domaine source',
  ]);
  for (const kw of sorted) {
    // 1 ligne par source (pour ne rien perdre).
    if (kw.sources.length === 0) {
      rows.push([
        kw.keyword,
        kw.volume,
        kw.kd,
        kw.cpc,
        kw.traffic,
        kw.clusterName,
        kw.intent.join('|'),
        kw.branded ? 'oui' : 'non',
        kw.serpFeatures,
        kw.isGap ? 'oui' : 'non',
        '',
        '',
        '',
      ]);
      continue;
    }
    for (const s of kw.sources) {
      rows.push([
        kw.keyword,
        kw.volume,
        kw.kd,
        kw.cpc,
        kw.traffic,
        kw.clusterName,
        kw.intent.join('|'),
        kw.branded ? 'oui' : 'non',
        kw.serpFeatures,
        kw.isGap ? 'oui' : 'non',
        s.position,
        s.url,
        s.domain,
      ]);
    }
  }
  const csv = rowsToCSV(rows);
  downloadCSV(csv, buildExportFilename(projectName, filters, 'export'));
}

// ---------------------------------------------------------------------------
// Batch Content Plan export
// ---------------------------------------------------------------------------

interface BatchKwRow {
  priority: 1 | 2 | 3;
  cluster: string;
  keyword: string;
  volume: number;
  kd: number | null;
  secondary: string;
  competitors: string;
  pageType: string;
  status: string;
}

const PRIMARY_INTENT_TO_PAGE_TYPE: Record<string, string> = {
  informational: 'Article de blog / Guide',
  commercial: 'Landing page comparative',
  transactional: 'Page produit / Pricing',
  navigational: 'Page de marque',
};

function suggestPageType(kw: KeywordNode): string {
  if (kw.intent.includes('transactional')) return PRIMARY_INTENT_TO_PAGE_TYPE.transactional!;
  if (kw.intent.includes('commercial')) return PRIMARY_INTENT_TO_PAGE_TYPE.commercial!;
  if (kw.intent.includes('navigational')) return PRIMARY_INTENT_TO_PAGE_TYPE.navigational!;
  if (kw.intent.includes('informational')) return PRIMARY_INTENT_TO_PAGE_TYPE.informational!;
  return 'À définir';
}

// Score = volume × (1 - KD/100). Plus c'est élevé, plus c'est un quick win.
function priorityScore(kw: KeywordNode): number {
  const kd = kw.kd ?? 50; // si inconnu, on assume moyen
  return kw.volume * Math.max(0.1, 1 - kd / 100);
}

export function exportBatchContentPlan(
  visibleKws: KeywordNode[],
  projectName: string,
  filters: FilterState,
): void {
  if (visibleKws.length === 0) return;

  // Score puis bins.
  const scored = visibleKws.map((kw) => ({ kw, score: priorityScore(kw) }));
  scored.sort((a, b) => b.score - a.score);

  // Tertiles dynamiques.
  const N = scored.length;
  const t1 = Math.max(1, Math.floor(N / 3));
  const t2 = Math.max(t1 + 1, Math.floor((2 * N) / 3));
  const priorityFor = (idx: number): 1 | 2 | 3 => {
    if (idx < t1) return 1;
    if (idx < t2) return 2;
    return 3;
  };

  // Index par cluster pour les "secondaires".
  const byCluster = new Map<string, KeywordNode[]>();
  for (const kw of visibleKws) {
    const list = byCluster.get(kw.clusterName) ?? [];
    list.push(kw);
    byCluster.set(kw.clusterName, list);
  }

  const enriched: BatchKwRow[] = scored.map(({ kw }, idx) => {
    const siblings = (byCluster.get(kw.clusterName) ?? [])
      .filter((s) => s.id !== kw.id)
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 5)
      .map((s) => s.keyword);
    const competitors = kw.sources
      .filter((s) => !s.isMe)
      .map((s) => `${s.label}${s.position !== null ? ` (pos ${s.position})` : ''}`)
      .join(' · ');
    return {
      priority: priorityFor(idx),
      cluster: kw.clusterName,
      keyword: kw.keyword,
      volume: kw.volume,
      kd: kw.kd,
      secondary: siblings.join(' · '),
      competitors,
      pageType: suggestPageType(kw),
      status: '',
    };
  });

  // Tri final : par cluster (pour batchs visibles), puis par priorité, puis par volume.
  enriched.sort((a, b) => {
    if (a.cluster !== b.cluster) return a.cluster.localeCompare(b.cluster);
    if (a.priority !== b.priority) return a.priority - b.priority;
    return b.volume - a.volume;
  });

  const rows: Array<Array<string | number | null>> = [];
  rows.push([
    'Priorité',
    'Cluster',
    'Keyword principal',
    'Volume',
    'KD',
    'Keywords secondaires (cluster)',
    'Concurrents positionnés',
    'Type de page suggéré',
    'Statut',
  ]);
  for (const r of enriched) {
    rows.push([
      `P${r.priority}`,
      r.cluster,
      r.keyword,
      r.volume,
      r.kd,
      r.secondary,
      r.competitors,
      r.pageType,
      r.status,
    ]);
  }

  const csv = rowsToCSV(rows);
  downloadCSV(csv, buildExportFilename(projectName, filters, 'content_plan'));
}
