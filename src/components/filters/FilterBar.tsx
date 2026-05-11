import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ChevronDown,
  Sparkles,
  Users,
  TrendingUp,
  Gauge,
  Tag,
  Layers,
  Crosshair,
  RotateCcw,
  AlertTriangle,
  CalendarOff,
  EyeOff,
  RotateCw,
} from 'lucide-react';
import { db, type Intent } from '@/lib/db';
import {
  DEFAULT_FILTERS,
  isAnyFilterActive,
  useFilterStore,
  useProjectFilters,
  type FilterState,
} from '@/lib/filterStore';
import { Popover } from './Popover';
import { RangeSlider } from './RangeSlider';
import { ExportButton } from './ExportButton';
import { cn } from '@/lib/utils';
import type { KeywordNode } from '@/components/graph/graphLayout';

interface Props {
  projectId: string;
  projectName: string;
  visibleKws: KeywordNode[];
  totalKwCount: number;
  onZoomToCluster?: (clusterId: string) => void;
  selectedIds?: Set<string>;
}

const INTENT_OPTIONS: { value: Intent; label: string; color: string }[] = [
  { value: 'informational', label: 'Informational', color: '#3b82f6' },
  { value: 'commercial', label: 'Commercial', color: '#a855f7' },
  { value: 'transactional', label: 'Transactional', color: '#22c55e' },
  { value: 'navigational', label: 'Navigational', color: '#f59e0b' },
];

export function FilterBar({
  projectId,
  projectName,
  visibleKws,
  totalKwCount,
  onZoomToCluster,
  selectedIds,
}: Props) {
  const visibleKwCount = visibleKws.length;
  const filters = useProjectFilters(projectId);
  const patch = useFilterStore((s) => s.patch);
  const reset = useFilterStore((s) => s.reset);

  const competitors = useLiveQuery(
    () => db.competitors.where('projectId').equals(projectId).toArray(),
    [projectId],
  );
  const clusters = useLiveQuery(
    () => db.clusters.where('projectId').equals(projectId).toArray(),
    [projectId],
  );
  const keywords = useLiveQuery(
    () => db.keywords.where('projectId').equals(projectId).toArray(),
    [projectId],
  );

  const allDomains = useMemo(() => competitors?.map((c) => c.domain) ?? [], [competitors]);
  const allClusterIds = useMemo(() => clusters?.map((c) => c.id) ?? [], [clusters]);

  const update = (p: Partial<FilterState>) => patch(projectId, p);

  const active = isAnyFilterActive(filters);

  return (
    <div className="relative z-20 border-b border-border-subtle bg-bg-surface/60 px-3 py-2 backdrop-blur">
      <div className="flex flex-wrap items-center gap-1.5">
        <ConcurrentFilter
          allDomains={allDomains}
          competitors={competitors ?? []}
          value={filters.activeSites}
          onChange={(activeSites) => update({ activeSites })}
        />
        <VolumeFilter
          keywords={keywords ?? []}
          value={filters.volumeRange}
          onChange={(volumeRange) => update({ volumeRange })}
        />
        <KDFilter
          value={filters.kdRange}
          onChange={(kdRange) => update({ kdRange })}
        />
        <IntentFilter
          value={filters.intents}
          onChange={(intents) => update({ intents })}
        />
        <GapToggle
          active={filters.gapOnly}
          onClick={() => update({ gapOnly: !filters.gapOnly })}
        />
        <DateToggle
          active={filters.hideDatedKeywords}
          onClick={() => update({ hideDatedKeywords: !filters.hideDatedKeywords })}
        />
        <ClusterFilter
          allClusterIds={allClusterIds}
          clusters={clusters ?? []}
          keywords={keywords ?? []}
          competitors={competitors ?? []}
          value={filters.activeClusters}
          excluded={filters.excludedClusters}
          onChange={(activeClusters) => update({ activeClusters })}
          onExcludedChange={(excludedClusters) => update({ excludedClusters })}
          onZoomToCluster={onZoomToCluster}
        />
        <PositionFilter
          value={filters.positionRange}
          onChange={(positionRange) => update({ positionRange })}
        />

        <div className="mx-1 h-5 w-px bg-border-subtle" />

        <span className="px-2 py-0.5 font-mono text-[11px] text-text-secondary">
          <span
            className={cn(
              visibleKwCount < totalKwCount ? 'text-amber-300' : 'text-text-primary',
            )}
          >
            {visibleKwCount}
          </span>
          <span className="text-text-muted"> / {totalKwCount} KWs</span>
        </span>

        {active && (
          <button
            type="button"
            onClick={() => reset(projectId)}
            title="Reset filtres"
            className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] text-text-muted hover:bg-bg-elevated hover:text-text-primary"
          >
            <RotateCcw size={11} />
            Reset
          </button>
        )}

        <div className="ml-auto">
          <ExportButton
            visibleKws={visibleKws}
            projectName={projectName}
            filters={filters}
            selectedIds={selectedIds}
          />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Filter button trigger
// ============================================================================

function FilterButton({
  active,
  badge,
  icon,
  children,
  onClick,
}: {
  active: boolean;
  badge?: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
        active
          ? 'border-accent/60 bg-accent/15 text-accent'
          : 'border-border-subtle bg-bg-base/40 text-text-secondary hover:border-border-strong hover:text-text-primary',
      )}
    >
      <span className={cn(active ? 'text-accent' : 'text-text-muted')}>{icon}</span>
      {children}
      {badge && (
        <span className="font-mono text-[10px] opacity-80">{badge}</span>
      )}
      <ChevronDown size={11} className="opacity-60" />
    </button>
  );
}

// ============================================================================
// 1. Concurrents
// ============================================================================

function ConcurrentFilter({
  allDomains,
  competitors,
  value,
  onChange,
}: {
  allDomains: string[];
  competitors: { domain: string; label: string; color: string; isMe: boolean }[];
  value: string[] | null;
  onChange: (v: string[] | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const sorted = [...competitors].sort((a, b) =>
    a.isMe === b.isMe ? a.label.localeCompare(b.label) : a.isMe ? -1 : 1,
  );
  const active = value !== null;
  const activeCount = value === null ? allDomains.length : value.length;
  const total = allDomains.length;

  const toggle = (domain: string) => {
    const cur = value ?? allDomains;
    const next = cur.includes(domain) ? cur.filter((d) => d !== domain) : [...cur, domain];
    if (next.length === allDomains.length) onChange(null);
    else onChange(next);
  };

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger={
        <FilterButton
          active={active}
          badge={`${activeCount}/${total}`}
          icon={<Users size={12} />}
          onClick={() => setOpen((v) => !v)}
        >
          Concurrents
        </FilterButton>
      }
    >
      <div className="mb-2 flex gap-1.5 border-b border-border-subtle pb-2">
        <button
          type="button"
          onClick={() => onChange(null)}
          className="flex-1 rounded px-2 py-1 text-[11px] text-text-secondary hover:bg-bg-elevated hover:text-text-primary"
        >
          Tous
        </button>
        <button
          type="button"
          onClick={() => onChange([])}
          className="flex-1 rounded px-2 py-1 text-[11px] text-text-secondary hover:bg-bg-elevated hover:text-text-primary"
        >
          Aucun
        </button>
      </div>
      <ul className="space-y-1">
        {sorted.map((c) => {
          const isOn = (value ?? allDomains).includes(c.domain);
          return (
            <li key={c.domain}>
              <button
                type="button"
                onClick={() => toggle(c.domain)}
                className="flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-bg-elevated"
              >
                <span
                  className={cn(
                    'flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border',
                    isOn ? 'border-accent bg-accent/20' : 'border-border-strong',
                  )}
                >
                  {isOn && <span className="h-2 w-2 rounded-sm bg-accent" />}
                </span>
                <span
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: c.color }}
                />
                <span
                  className={cn('flex-1 truncate text-xs', c.isMe ? 'font-semibold' : '')}
                >
                  {c.label}
                </span>
                {c.isMe && (
                  <span className="rounded bg-bg-elevated px-1.5 py-0.5 text-[9px] text-text-muted">
                    moi
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </Popover>
  );
}

// ============================================================================
// 2. Volume
// ============================================================================

function VolumeFilter({
  keywords,
  value,
  onChange,
}: {
  keywords: { volume: number }[];
  value: [number, number] | null;
  onChange: (v: [number, number] | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const maxVol = Math.max(100, ...keywords.map((k) => k.volume));
  const range: [number, number] = value ?? [0, maxVol];

  const presetTopN = (n: number) => {
    const sorted = [...keywords].map((k) => k.volume).sort((a, b) => b - a);
    if (sorted.length === 0) return;
    const threshold = sorted[Math.min(n - 1, sorted.length - 1)] ?? 0;
    onChange([threshold, maxVol]);
  };

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger={
        <FilterButton
          active={value !== null}
          icon={<TrendingUp size={12} />}
          onClick={() => setOpen((v) => !v)}
        >
          Volume
        </FilterButton>
      }
    >
      <div className="mb-2 flex flex-wrap gap-1">
        <Preset onClick={() => presetTopN(50)}>Top 50</Preset>
        <Preset onClick={() => onChange([1000, maxVol])}>&gt; 1K</Preset>
        <Preset onClick={() => onChange([5000, maxVol])}>&gt; 5K</Preset>
        <Preset onClick={() => onChange([10000, maxVol])}>&gt; 10K</Preset>
        <Preset onClick={() => onChange(null)}>Reset</Preset>
      </div>
      <RangeSlider
        min={0}
        max={maxVol}
        value={range}
        step={Math.max(1, Math.round(maxVol / 200))}
        onChange={(v) => {
          if (v[0] === 0 && v[1] === maxVol) onChange(null);
          else onChange(v);
        }}
        format={(n) => n.toLocaleString('fr-FR')}
      />
    </Popover>
  );
}

// ============================================================================
// 3. KD
// ============================================================================

function KDFilter({
  value,
  onChange,
}: {
  value: [number, number] | null;
  onChange: (v: [number, number] | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const range: [number, number] = value ?? [0, 100];
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger={
        <FilterButton
          active={value !== null}
          icon={<Gauge size={12} />}
          onClick={() => setOpen((v) => !v)}
        >
          KD
        </FilterButton>
      }
    >
      <div className="mb-2 flex flex-wrap gap-1">
        <Preset onClick={() => onChange([0, 30])}>Facile</Preset>
        <Preset onClick={() => onChange([30, 60])}>Moyen</Preset>
        <Preset onClick={() => onChange([60, 100])}>Difficile</Preset>
        <Preset onClick={() => onChange(null)}>Reset</Preset>
      </div>
      <RangeSlider
        min={0}
        max={100}
        value={range}
        onChange={(v) => {
          if (v[0] === 0 && v[1] === 100) onChange(null);
          else onChange(v);
        }}
        trackGradient="linear-gradient(90deg, rgba(34,197,94,0.4), rgba(245,158,11,0.4) 40%, rgba(239,68,68,0.4))"
        activeGradient="linear-gradient(90deg, #22c55e, #f59e0b 50%, #ef4444)"
      />
    </Popover>
  );
}

// ============================================================================
// 4. Intent
// ============================================================================

function IntentFilter({
  value,
  onChange,
}: {
  value: Intent[] | null;
  onChange: (v: Intent[] | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const allIntents = INTENT_OPTIONS.map((o) => o.value);
  const isOn = (i: Intent) => (value ?? allIntents).includes(i);
  const toggle = (i: Intent) => {
    const cur = value ?? allIntents;
    const next = cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i];
    if (next.length === allIntents.length) onChange(null);
    else onChange(next);
  };
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger={
        <FilterButton
          active={value !== null}
          badge={value !== null ? `${value.length}/4` : undefined}
          icon={<Tag size={12} />}
          onClick={() => setOpen((v) => !v)}
        >
          Intent
        </FilterButton>
      }
    >
      <ul className="space-y-1">
        {INTENT_OPTIONS.map((opt) => {
          const on = isOn(opt.value);
          return (
            <li key={opt.value}>
              <button
                type="button"
                onClick={() => toggle(opt.value)}
                className="flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-bg-elevated"
              >
                <span
                  className={cn(
                    'flex h-4 w-4 items-center justify-center rounded-sm border',
                    on ? 'border-accent bg-accent/20' : 'border-border-strong',
                  )}
                >
                  {on && <span className="h-2 w-2 rounded-sm bg-accent" />}
                </span>
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: opt.color }} />
                <span className="text-xs">{opt.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </Popover>
  );
}

// ============================================================================
// 5. Gap only (toggle direct)
// ============================================================================

function GapToggle({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
        active
          ? 'border-amber-400/70 bg-amber-500/15 text-amber-300 shadow-[0_0_12px_-2px_rgba(251,191,36,0.5)]'
          : 'border-border-subtle bg-bg-base/40 text-text-secondary hover:border-border-strong hover:text-text-primary',
      )}
    >
      <Sparkles size={12} />
      Opportunités
    </button>
  );
}

function DateToggle({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Masque les mots-clés contenant une année passée (ex : 'salaire 2024')"
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
        active
          ? 'border-accent/60 bg-accent/15 text-accent'
          : 'border-border-subtle bg-bg-base/40 text-text-secondary hover:border-border-strong hover:text-text-primary',
      )}
    >
      <CalendarOff size={12} />
      KWs datés
    </button>
  );
}

// ============================================================================
// 6. Cluster
// ============================================================================

function ClusterFilter({
  allClusterIds,
  clusters,
  keywords,
  competitors,
  value,
  excluded,
  onChange,
  onExcludedChange,
  onZoomToCluster,
}: {
  allClusterIds: string[];
  clusters: { id: string; name: string }[];
  keywords: { keyword: string; volume: number; clusterId: string | null; sourceDomain: string }[];
  competitors: { domain: string; isMe: boolean }[];
  value: string[] | null;
  excluded: string[];
  onChange: (v: string[] | null) => void;
  onExcludedChange: (v: string[]) => void;
  onZoomToCluster?: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const meDomains = new Set(competitors.filter((c) => c.isMe).map((c) => c.domain));
  const isExcluded = (id: string) => excluded.includes(id);
  const toggleExcluded = (id: string) => {
    if (isExcluded(id)) onExcludedChange(excluded.filter((x) => x !== id));
    else onExcludedChange([...excluded, id]);
  };

  const stats = useMemo(() => {
    const map = new Map<string, { totalVolume: number; isMyCovered: boolean; uniqueKw: Set<string> }>();
    for (const k of keywords) {
      if (!k.clusterId) continue;
      const cur = map.get(k.clusterId) ?? { totalVolume: 0, isMyCovered: false, uniqueKw: new Set() };
      const key = k.keyword.trim().toLowerCase();
      if (!cur.uniqueKw.has(key)) {
        cur.uniqueKw.add(key);
        cur.totalVolume += k.volume;
      }
      if (meDomains.has(k.sourceDomain)) cur.isMyCovered = true;
      map.set(k.clusterId, cur);
    }
    return clusters
      .map((c) => ({ ...c, ...(map.get(c.id) ?? { totalVolume: 0, isMyCovered: true, uniqueKw: new Set<string>() }) }))
      .sort((a, b) => {
        if (a.isMyCovered !== b.isMyCovered) return a.isMyCovered ? 1 : -1;
        return b.totalVolume - a.totalVolume;
      });
  }, [keywords, clusters, meDomains]);

  const isOn = (id: string) => (value ?? allClusterIds).includes(id);
  const toggle = (id: string) => {
    const cur = value ?? allClusterIds;
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    if (next.length === allClusterIds.length) onChange(null);
    else onChange(next);
  };

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      className="w-[320px]"
      trigger={
        <FilterButton
          active={value !== null || excluded.length > 0}
          icon={<Layers size={12} />}
          badge={
            excluded.length > 0
              ? `${value !== null ? value.length : allClusterIds.length - excluded.length}/${allClusterIds.length} · ${excluded.length} exclu${excluded.length > 1 ? 's' : ''}`
              : value !== null
                ? `${value.length}/${allClusterIds.length}`
                : undefined
          }
          onClick={() => setOpen((v) => !v)}
        >
          Clusters
        </FilterButton>
      }
    >
      <div className="mb-2 flex gap-1.5 border-b border-border-subtle pb-2">
        <button
          type="button"
          onClick={() => onChange(null)}
          className="flex-1 rounded px-2 py-1 text-[11px] text-text-secondary hover:bg-bg-elevated hover:text-text-primary"
        >
          Tous
        </button>
        <button
          type="button"
          onClick={() => onChange([])}
          className="flex-1 rounded px-2 py-1 text-[11px] text-text-secondary hover:bg-bg-elevated hover:text-text-primary"
        >
          Aucun
        </button>
        {excluded.length > 0 && (
          <button
            type="button"
            onClick={() => onExcludedChange([])}
            title="Restaurer tous les clusters exclus"
            className="flex-1 rounded px-2 py-1 text-[11px] text-amber-300 hover:bg-bg-elevated"
          >
            Restaurer ({excluded.length})
          </button>
        )}
      </div>
      <ul className="max-h-[280px] space-y-0.5 overflow-y-auto">
        {stats.map((c) => {
          const on = isOn(c.id);
          const xcl = isExcluded(c.id);
          return (
            <li
              key={c.id}
              className={cn(
                'group flex items-center gap-2 rounded px-2 py-1 hover:bg-bg-elevated',
                xcl && 'opacity-50 line-through',
                !c.isMyCovered && !xcl && 'bg-amber-500/5',
              )}
            >
              <button
                type="button"
                onClick={() => toggle(c.id)}
                disabled={xcl}
                className="flex flex-1 items-center gap-2 text-left disabled:cursor-not-allowed"
              >
                <span
                  className={cn(
                    'flex h-4 w-4 items-center justify-center rounded-sm border',
                    on ? 'border-accent bg-accent/20' : 'border-border-strong',
                  )}
                >
                  {on && <span className="h-2 w-2 rounded-sm bg-accent" />}
                </span>
                {!c.isMyCovered && !xcl && <AlertTriangle size={10} className="text-amber-400" />}
                <span
                  className={cn(
                    'truncate text-xs',
                    xcl
                      ? 'text-text-muted'
                      : c.isMyCovered
                        ? 'text-text-primary'
                        : 'text-amber-300',
                  )}
                >
                  {c.name}
                </span>
                <span className="ml-auto font-mono text-[10px] text-text-muted">
                  {c.totalVolume.toLocaleString('fr-FR')}
                </span>
              </button>
              <button
                type="button"
                onClick={() => toggleExcluded(c.id)}
                title={xcl ? 'Réinclure ce cluster' : 'Exclure ce cluster du graph, des stats et des exports'}
                className={cn(
                  'rounded p-0.5 transition-opacity',
                  xcl
                    ? 'text-amber-300 hover:bg-bg-base hover:text-amber-200'
                    : 'text-text-muted opacity-0 hover:bg-bg-base hover:text-red-400 group-hover:opacity-100',
                )}
              >
                {xcl ? <RotateCw size={11} /> : <EyeOff size={11} />}
              </button>
              {onZoomToCluster && !xcl && (
                <button
                  type="button"
                  onClick={() => {
                    onZoomToCluster(c.id);
                    setOpen(false);
                  }}
                  title="Zoomer sur ce cluster"
                  className="rounded p-0.5 text-text-muted opacity-0 hover:bg-bg-base hover:text-text-primary group-hover:opacity-100"
                >
                  <Crosshair size={11} />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </Popover>
  );
}

// ============================================================================
// 7. Position
// ============================================================================

function PositionFilter({
  value,
  onChange,
}: {
  value: [number, number] | null;
  onChange: (v: [number, number] | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const range: [number, number] = value ?? [1, 100];
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger={
        <FilterButton
          active={value !== null}
          icon={<Crosshair size={12} />}
          onClick={() => setOpen((v) => !v)}
        >
          Position
        </FilterButton>
      }
    >
      <div className="mb-2 flex flex-wrap gap-1">
        <Preset onClick={() => onChange([1, 3])}>Top 3</Preset>
        <Preset onClick={() => onChange([1, 10])}>Top 10</Preset>
        <Preset onClick={() => onChange([1, 20])}>Top 20</Preset>
        <Preset onClick={() => onChange([11, 50])}>Page 2+</Preset>
        <Preset onClick={() => onChange(null)}>Reset</Preset>
      </div>
      <RangeSlider
        min={1}
        max={100}
        value={range}
        onChange={(v) => {
          if (v[0] === 1 && v[1] === 100) onChange(null);
          else onChange(v);
        }}
      />
    </Popover>
  );
}

// ============================================================================
// Bits
// ============================================================================

function Preset({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded border border-border-subtle bg-bg-base/40 px-1.5 py-0.5 text-[10px] text-text-secondary hover:border-border-strong hover:text-text-primary"
    >
      {children}
    </button>
  );
}

// Réexports utilitaires (au cas où on en a besoin dans le test).
export { DEFAULT_FILTERS };
