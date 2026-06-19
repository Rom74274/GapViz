import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ChevronDown,
  Star,
  Users,
  TrendingUp,
  Gauge,
  Tag,
  LayoutGrid,
  Hash,
  RotateCcw,
  AlertTriangle,
  CalendarOff,
  EyeOff,
  RotateCw,
  Award,
  Crosshair,
  Settings2,
} from 'lucide-react';
import { db, type Intent } from '@/lib/db';
import { supabase } from '@/lib/supabase';
import { ColorPicker } from '@/components/onboarding/ColorPicker';
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

  const maxVol = useMemo(() => {
    if (!keywords || keywords.length === 0) return 100;
    return Math.max(100, ...keywords.map((k) => k.volume));
  }, [keywords]);

  const update = (p: Partial<FilterState>) => patch(projectId, p);
  const active = isAnyFilterActive(filters);
  const visibleKwCount = visibleKws.length;
  const visiblePct = totalKwCount > 0 ? (visibleKwCount / totalKwCount) * 100 : 0;

  return (
    <div className="glass-toolbar relative z-20 px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        {/* PRIMARY FILTERS */}
        <ConcurrentFilter
          allDomains={allDomains}
          competitors={competitors ?? []}
          value={filters.activeSites}
          onChange={(activeSites) => update({ activeSites })}
        />
        <VolumeFilter
          maxVol={maxVol}
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

        {/* OPPORTUNITES — HERO FILTER */}
        <OpportunitiesToggle
          active={filters.gapOnly}
          onClick={() => update({ gapOnly: !filters.gapOnly })}
        />

        {/* SECONDARY GROUP */}
        <span className="mx-1 h-6 w-px self-stretch bg-border-subtle/60" />
        <SmallToggle
          icon={<CalendarOff size={11} />}
          label="KWs datés"
          active={filters.hideDatedKeywords}
          title="Masque les mots-clés contenant une année passée"
          onClick={() => update({ hideDatedKeywords: !filters.hideDatedKeywords })}
        />
        <SmallToggle
          icon={<Award size={11} />}
          label="Branded"
          active={filters.hideBranded}
          title="Masque les mots-clés flaggés branded par Ahrefs"
          onClick={() => update({ hideBranded: !filters.hideBranded })}
        />

        {/* COUNTER + RESET + EXPORT — pushed right */}
        <div className="ml-auto flex items-center gap-2">
          <KwCounter
            visible={visibleKwCount}
            total={totalKwCount}
            pct={visiblePct}
            filtered={active}
          />
          {active && (
            <button
              type="button"
              onClick={() => reset(projectId)}
              title="Reset tous les filtres"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:bg-bg-elevated hover:text-text-primary"
            >
              <RotateCcw size={12} />
            </button>
          )}
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
// Compteur KW avec progress bar
// ============================================================================

function KwCounter({
  visible,
  total,
  pct,
  filtered,
}: {
  visible: number;
  total: number;
  pct: number;
  filtered: boolean;
}) {
  return (
    <div className="flex flex-col items-end gap-1 pr-1">
      <span className="text-xs leading-none">
        <span
          className={cn(
            'font-semibold tabular-nums',
            filtered ? 'text-amber-300' : 'text-text-primary',
          )}
        >
          {visible.toLocaleString('fr-FR')}
        </span>
        <span className="text-text-muted"> / {total.toLocaleString('fr-FR')} KWs</span>
      </span>
      <div className="h-0.5 w-28 overflow-hidden rounded-full bg-bg-elevated">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-300',
            filtered ? 'bg-amber-400' : 'bg-accent',
          )}
          style={{ width: `${Math.max(2, Math.min(100, pct))}%` }}
        />
      </div>
    </div>
  );
}

// ============================================================================
// FilterButton — bouton générique avec icône, label, valeur active optionnelle
// ============================================================================

function FilterButton({
  active,
  activeValue,
  icon,
  children,
  onClick,
}: {
  active: boolean;
  activeValue?: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'glass-pill inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium',
        active && 'glass-pill-active text-accent',
        !active && 'text-text-secondary hover:text-text-primary',
      )}
    >
      <span className={cn('shrink-0', active ? 'text-accent' : 'text-text-muted')}>
        {icon}
      </span>
      <span>{children}</span>
      {active && activeValue && (
        <span className="ml-0.5 rounded bg-accent/25 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-accent">
          {activeValue}
        </span>
      )}
      <ChevronDown size={11} className={cn('opacity-50', active && 'opacity-70')} />
    </button>
  );
}

// ============================================================================
// SmallToggle — pour les filtres secondaires (KWs datés, Branded)
// ============================================================================

function SmallToggle({
  icon,
  label,
  active,
  title,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  title?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        'glass-pill inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px]',
        active && 'glass-pill-active text-accent',
        !active && 'text-text-muted hover:text-text-secondary',
      )}
    >
      <span className="shrink-0">{icon}</span>
      {label}
    </button>
  );
}

// ============================================================================
// Opportunités — HERO filter
// ============================================================================

function OpportunitiesToggle({
  active,
  onClick,
}: {
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="N'afficher que les mots-clés où tu n'es PAS positionné — la vraie opportunité"
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all',
        active
          ? 'border border-amber-300 bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-[0_0_18px_-2px_rgba(251,191,36,0.55)] hover:from-amber-400 hover:to-orange-400'
          : 'border border-amber-400/30 bg-amber-500/5 text-amber-300 hover:border-amber-400/60 hover:bg-amber-500/10',
      )}
    >
      <Star
        size={12}
        className={active ? 'fill-white text-white' : 'text-amber-300'}
      />
      Opportunités
    </button>
  );
}

// ============================================================================
// Helpers — formattage de valeurs actives sur les boutons
// ============================================================================

function formatK(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${Math.round(n / 100) / 10}K`;
  return n.toString();
}

function formatRange(r: [number, number] | null, suffix = ''): string | undefined {
  if (!r) return undefined;
  return `${formatK(r[0])}–${formatK(r[1])}${suffix}`;
}

// ============================================================================
// Filtres individuels
// ============================================================================

function ConcurrentFilter({
  allDomains,
  competitors,
  value,
  onChange,
}: {
  allDomains: string[];
  competitors: { id: string; domain: string; label: string; color: string; isMe: boolean }[];
  value: string[] | null;
  onChange: (v: string[] | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
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

  const updateColor = async (id: string, color: string) => {
    await db.competitors.update(id, { color });
    const { error } = await supabase.from('competitors').update({ color }).eq('id', id);
    if (error) console.warn('[competitors] color update', error);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setEditingId(null);
      }}
      trigger={
        <FilterButton
          active={active}
          activeValue={`${activeCount}/${total}`}
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
          const isEditing = editingId === c.id;
          const usedColors = competitors
            .filter((other) => other.id !== c.id)
            .map((other) => other.color);
          return (
            <li key={c.domain}>
              <div className="group flex items-center gap-2 rounded px-2 py-1 hover:bg-bg-elevated">
                <button
                  type="button"
                  onClick={() => toggle(c.domain)}
                  className="flex flex-1 items-center gap-2 text-left"
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
                    className={cn('flex-1 truncate text-xs', c.isMe && 'font-semibold')}
                  >
                    {c.label}
                  </span>
                  {c.isMe && (
                    <span className="rounded bg-bg-elevated px-1.5 py-0.5 text-[9px] text-text-muted">
                      moi
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingId(isEditing ? null : c.id);
                  }}
                  className={cn(
                    'rounded p-1 text-text-muted transition-opacity hover:bg-bg-surface hover:text-text-primary',
                    isEditing
                      ? 'opacity-100 text-accent'
                      : 'opacity-0 group-hover:opacity-100',
                  )}
                  aria-label="Modifier la couleur"
                  title="Modifier la couleur"
                >
                  <Settings2 size={12} />
                </button>
              </div>
              {isEditing && (
                <div className="ml-7 mt-1 mb-2 rounded border border-border-subtle bg-bg-base p-2">
                  <ColorPicker
                    value={c.color}
                    onChange={(color) => {
                      void updateColor(c.id, color);
                      setEditingId(null);
                    }}
                    disabled={usedColors}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Popover>
  );
}

function VolumeFilter({
  maxVol,
  keywords,
  value,
  onChange,
}: {
  maxVol: number;
  keywords: { volume: number }[];
  value: [number, number] | null;
  onChange: (v: [number, number] | null) => void;
}) {
  const [open, setOpen] = useState(false);
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
          activeValue={formatRange(value)}
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
          activeValue={value ? `${value[0]}–${value[1]}` : undefined}
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
          activeValue={value !== null ? `${value.length}/4` : undefined}
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

  const isActive = value !== null || excluded.length > 0;
  const activeValue = excluded.length > 0
    ? `${value !== null ? value.length : allClusterIds.length - excluded.length}/${allClusterIds.length} · ${excluded.length} excl.`
    : value !== null
      ? `${value.length}/${allClusterIds.length}`
      : undefined;

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      className="w-[320px]"
      trigger={
        <FilterButton
          active={isActive}
          activeValue={activeValue}
          icon={<LayoutGrid size={12} />}
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
          activeValue={value ? `${value[0]}–${value[1]}` : undefined}
          icon={<Hash size={12} />}
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

export { DEFAULT_FILTERS };
