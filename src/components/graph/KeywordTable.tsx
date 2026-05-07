import { useMemo, useState } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown, AlertTriangle } from 'lucide-react';
import type { KeywordNode } from './graphLayout';
import { cn } from '@/lib/utils';

type SortKey =
  | 'keyword'
  | 'volume'
  | 'kd'
  | 'cpc'
  | 'bestPosition'
  | 'sourceCount'
  | 'cluster'
  | 'intent'
  | 'isGap';
type SortDir = 'asc' | 'desc';

interface Props {
  visibleKws: KeywordNode[];
  totalKws: KeywordNode[];
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  onRowClick: (kwId: string) => void;
}

interface Row {
  kwId: string;
  keyword: string;
  volume: number;
  kd: number | null;
  cpc: number | null;
  bestPosition: number | null;
  sourceCount: number;
  sources: { color: string; label: string; isMe: boolean; position: number | null }[];
  cluster: string;
  intent: string;
  isGap: boolean;
}

function buildRow(kw: KeywordNode): Row {
  const positions = kw.sources
    .map((s) => s.position)
    .filter((p): p is number => p !== null);
  return {
    kwId: kw.id,
    keyword: kw.keyword,
    volume: kw.volume,
    kd: kw.kd,
    cpc: kw.cpc,
    bestPosition: positions.length > 0 ? Math.min(...positions) : null,
    sourceCount: kw.sources.length,
    sources: kw.sources.map((s) => ({
      color: s.color,
      label: s.label,
      isMe: s.isMe,
      position: s.position,
    })),
    cluster: kw.clusterName,
    intent: kw.intent.join('|'),
    isGap: kw.isGap,
  };
}

export function KeywordTable({
  visibleKws,
  totalKws,
  selectedIds,
  onSelectionChange,
  onRowClick,
}: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('volume');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const rows = useMemo(() => {
    const r = visibleKws.map(buildRow);
    r.sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      const va = a[sortKey] as unknown;
      const vb = b[sortKey] as unknown;
      if (va === null || va === undefined) return 1;
      if (vb === null || vb === undefined) return -1;
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      if (typeof va === 'boolean' && typeof vb === 'boolean')
        return ((va ? 1 : 0) - (vb ? 1 : 0)) * dir;
      return String(va).localeCompare(String(vb)) * dir;
    });
    return r;
  }, [visibleKws, sortKey, sortDir]);

  const onSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'keyword' || key === 'cluster' || key === 'intent' ? 'asc' : 'desc');
    }
  };

  const allSelected =
    rows.length > 0 && rows.every((r) => selectedIds.has(r.kwId));
  const someSelected =
    !allSelected && rows.some((r) => selectedIds.has(r.kwId));

  const toggleAll = () => {
    if (allSelected) {
      const next = new Set(selectedIds);
      for (const r of rows) next.delete(r.kwId);
      onSelectionChange(next);
    } else {
      const next = new Set(selectedIds);
      for (const r of rows) next.add(r.kwId);
      onSelectionChange(next);
    }
  };

  const toggleOne = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange(next);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border-subtle px-5 py-2 text-xs">
        <span className="text-text-secondary">
          <span className="font-mono text-text-primary">{rows.length}</span> KW
          {rows.length > 1 ? 's' : ''} uniques
          <span className="text-text-muted"> / {totalKws.length} total</span>
          {selectedIds.size > 0 && (
            <span className="ml-3 inline-flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] text-accent">
              {selectedIds.size} sélectionné{selectedIds.size > 1 ? 's' : ''}
              <button
                type="button"
                onClick={() => onSelectionChange(new Set())}
                className="ml-1 text-accent hover:text-accent-hover"
                title="Désélectionner tout"
              >
                ✕
              </button>
            </span>
          )}
        </span>
        <span className="font-mono text-text-muted">
          Tri : {sortKey} {sortDir === 'asc' ? '↑' : '↓'}
        </span>
      </div>
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-bg-surface text-text-secondary shadow-[0_1px_0_rgba(35,35,74,1)]">
            <tr>
              <th className="w-8 border-b border-border-subtle px-3 py-1.5">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected;
                  }}
                  onChange={toggleAll}
                  className="cursor-pointer"
                  aria-label="Tout sélectionner"
                />
              </th>
              <Th sortKey="keyword" cur={sortKey} dir={sortDir} onClick={onSort}>Keyword</Th>
              <Th sortKey="volume" cur={sortKey} dir={sortDir} onClick={onSort} align="right">Volume</Th>
              <Th sortKey="kd" cur={sortKey} dir={sortDir} onClick={onSort} align="right">KD</Th>
              <Th sortKey="cpc" cur={sortKey} dir={sortDir} onClick={onSort} align="right">CPC</Th>
              <Th sortKey="bestPosition" cur={sortKey} dir={sortDir} onClick={onSort} align="right">Pos</Th>
              <Th sortKey="sourceCount" cur={sortKey} dir={sortDir} onClick={onSort} align="right">Acteurs</Th>
              <Th sortKey="cluster" cur={sortKey} dir={sortDir} onClick={onSort}>Cluster</Th>
              <Th sortKey="intent" cur={sortKey} dir={sortDir} onClick={onSort}>Intent</Th>
              <Th sortKey="isGap" cur={sortKey} dir={sortDir} onClick={onSort}>Gap</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const checked = selectedIds.has(r.kwId);
              return (
                <tr
                  key={r.kwId}
                  onClick={() => onRowClick(r.kwId)}
                  className={cn(
                    'cursor-pointer border-b border-border-subtle/40 hover:bg-bg-elevated/40',
                    r.isGap && 'bg-amber-500/[0.04]',
                    checked && 'bg-accent/10',
                  )}
                >
                  <td
                    className="px-3 py-1.5"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleOne(r.kwId);
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleOne(r.kwId)}
                      className="cursor-pointer"
                      aria-label={`Sélectionner ${r.keyword}`}
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <span className="truncate">{r.keyword}</span>
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono text-text-secondary">
                    {r.volume.toLocaleString('fr-FR')}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono text-text-muted">
                    {r.kd ?? '—'}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono text-text-muted">
                    {r.cpc !== null ? `$${r.cpc.toFixed(2)}` : '—'}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono text-text-muted">
                    {r.bestPosition ?? '—'}
                  </td>
                  <td className="px-3 py-1.5">
                    <SourceDots sources={r.sources} />
                  </td>
                  <td className="px-3 py-1.5 text-text-secondary">{r.cluster}</td>
                  <td className="px-3 py-1.5 text-text-muted">{r.intent || '—'}</td>
                  <td className="px-3 py-1.5">
                    {r.isGap ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-300">
                        <AlertTriangle size={9} />
                        Gap
                      </span>
                    ) : (
                      <span className="text-text-muted">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="flex items-center justify-center p-10 text-text-muted">
            Aucune ligne avec les filtres actuels.
          </div>
        )}
      </div>
    </div>
  );
}

function SourceDots({
  sources,
}: {
  sources: { color: string; label: string; isMe: boolean; position: number | null }[];
}) {
  const sorted = [...sources].sort((a, b) => {
    if (a.isMe !== b.isMe) return a.isMe ? -1 : 1;
    return (a.position ?? 999) - (b.position ?? 999);
  });
  const visible = sorted.slice(0, 5);
  const overflow = sorted.length - visible.length;
  return (
    <div className="inline-flex items-center gap-1">
      <span className="font-mono text-xs text-text-secondary">{sources.length}</span>
      <div className="ml-1.5 flex -space-x-1">
        {visible.map((s, i) => (
          <span
            key={`${s.label}-${i}`}
            className="inline-block h-2.5 w-2.5 rounded-full ring-1 ring-bg-base"
            style={{ backgroundColor: s.color }}
            title={`${s.label}${s.position !== null ? ` (pos ${s.position})` : ''}`}
          />
        ))}
        {overflow > 0 && (
          <span className="inline-flex h-2.5 min-w-[10px] items-center justify-center rounded-full bg-bg-elevated px-1 text-[8px] text-text-muted ring-1 ring-bg-base">
            +{overflow}
          </span>
        )}
      </div>
    </div>
  );
}

function Th({
  children,
  sortKey,
  cur,
  dir,
  onClick,
  align = 'left',
}: {
  children: React.ReactNode;
  sortKey: SortKey;
  cur: SortKey;
  dir: SortDir;
  onClick: (k: SortKey) => void;
  align?: 'left' | 'right';
}) {
  const active = cur === sortKey;
  const Icon = !active ? ArrowUpDown : dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th
      className={cn(
        'cursor-pointer select-none border-b border-border-subtle px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide hover:bg-bg-elevated',
        align === 'right' ? 'text-right' : 'text-left',
      )}
      onClick={() => onClick(sortKey)}
    >
      <span
        className={cn(
          'inline-flex items-center gap-1',
          align === 'right' ? 'justify-end' : '',
        )}
      >
        {children}
        <Icon size={10} className={active ? 'text-accent' : 'opacity-50'} />
      </span>
    </th>
  );
}
