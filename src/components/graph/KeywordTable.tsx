import { useMemo, useState } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown, AlertTriangle } from 'lucide-react';
import type { KeywordNode } from './graphLayout';
import { cn } from '@/lib/utils';

type SortKey = 'keyword' | 'volume' | 'kd' | 'cpc' | 'position' | 'domain' | 'cluster' | 'intent' | 'gap';
type SortDir = 'asc' | 'desc';

interface Props {
  visibleKws: KeywordNode[];
  totalKws: KeywordNode[];
}

export function KeywordTable({ visibleKws, totalKws }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('volume');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const rows = useMemo(() => {
    // 1 ligne par (KW × source) pour avoir la position et le domaine.
    type Row = {
      kwId: string;
      keyword: string;
      volume: number;
      kd: number | null;
      cpc: number | null;
      position: number | null;
      domain: string;
      domainLabel: string;
      domainColor: string;
      cluster: string;
      intent: string;
      isGap: boolean;
    };
    const out: Row[] = [];
    for (const kw of visibleKws) {
      if (kw.sources.length === 0) {
        out.push({
          kwId: kw.id,
          keyword: kw.keyword,
          volume: kw.volume,
          kd: kw.kd,
          cpc: kw.cpc,
          position: null,
          domain: '',
          domainLabel: '—',
          domainColor: '#6a6a8a',
          cluster: kw.clusterName,
          intent: kw.intent.join('|'),
          isGap: kw.isGap,
        });
        continue;
      }
      for (const s of kw.sources) {
        out.push({
          kwId: kw.id,
          keyword: kw.keyword,
          volume: kw.volume,
          kd: kw.kd,
          cpc: kw.cpc,
          position: s.position,
          domain: s.domain,
          domainLabel: s.label,
          domainColor: s.color,
          cluster: kw.clusterName,
          intent: kw.intent.join('|'),
          isGap: kw.isGap,
        });
      }
    }
    out.sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      const va = sortKey === 'gap' ? a.isGap : (a as Record<string, unknown>)[sortKey];
      const vb = sortKey === 'gap' ? b.isGap : (b as Record<string, unknown>)[sortKey];
      if (va === null || va === undefined) return 1;
      if (vb === null || vb === undefined) return -1;
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      if (typeof va === 'boolean' && typeof vb === 'boolean') return ((va ? 1 : 0) - (vb ? 1 : 0)) * dir;
      return String(va).localeCompare(String(vb)) * dir;
    });
    return out;
  }, [visibleKws, sortKey, sortDir]);

  const onSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'keyword' || key === 'cluster' || key === 'domain' ? 'asc' : 'desc');
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border-subtle px-5 py-2 text-xs">
        <span className="text-text-secondary">
          <span className="font-mono text-text-primary">{rows.length}</span> ligne{rows.length > 1 ? 's' : ''}
          <span className="text-text-muted"> ({visibleKws.length} / {totalKws.length} KWs uniques)</span>
        </span>
        <span className="font-mono text-text-muted">
          Tri : {sortKey} {sortDir === 'asc' ? '↑' : '↓'}
        </span>
      </div>
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-bg-surface text-text-secondary shadow-[0_1px_0_rgba(35,35,74,1)]">
            <tr>
              <Th sortKey="keyword" cur={sortKey} dir={sortDir} onClick={onSort}>Keyword</Th>
              <Th sortKey="volume" cur={sortKey} dir={sortDir} onClick={onSort} align="right">Volume</Th>
              <Th sortKey="kd" cur={sortKey} dir={sortDir} onClick={onSort} align="right">KD</Th>
              <Th sortKey="cpc" cur={sortKey} dir={sortDir} onClick={onSort} align="right">CPC</Th>
              <Th sortKey="position" cur={sortKey} dir={sortDir} onClick={onSort} align="right">Pos</Th>
              <Th sortKey="domain" cur={sortKey} dir={sortDir} onClick={onSort}>Domaine</Th>
              <Th sortKey="cluster" cur={sortKey} dir={sortDir} onClick={onSort}>Cluster</Th>
              <Th sortKey="intent" cur={sortKey} dir={sortDir} onClick={onSort}>Intent</Th>
              <Th sortKey="gap" cur={sortKey} dir={sortDir} onClick={onSort}>Gap</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={`${r.kwId}-${r.domain}-${i}`}
                className="border-b border-border-subtle/40 hover:bg-bg-elevated/40"
              >
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
                  {r.position ?? '—'}
                </td>
                <td className="px-3 py-1.5">
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="inline-block h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: r.domainColor }}
                    />
                    <span className="truncate font-mono text-[11px] text-text-secondary">
                      {r.domainLabel}
                    </span>
                  </span>
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
            ))}
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
      <span className="inline-flex items-center gap-1">
        {children}
        <Icon size={10} className={active ? 'text-accent' : 'opacity-50'} />
      </span>
    </th>
  );
}
