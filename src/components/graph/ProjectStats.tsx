import { useMemo } from 'react';
import { Eye, Target, AlertTriangle, TrendingUp, Activity } from 'lucide-react';
import type { KeywordNode } from './graphLayout';

interface Props {
  visibleKws: KeywordNode[];
  totalKws: KeywordNode[];
}

interface Stats {
  visibleCount: number;
  totalCount: number;
  visibleVolume: number;
  visibleGapCount: number;
  visibleGapVolume: number;
  coveragePct: number;
}

function compute(visible: KeywordNode[], all: KeywordNode[]): Stats {
  const visibleCount = visible.length;
  const totalCount = all.length;
  let visibleVolume = 0;
  let visibleGapCount = 0;
  let visibleGapVolume = 0;
  for (const kw of visible) {
    visibleVolume += kw.volume;
    if (kw.isGap) {
      visibleGapCount += 1;
      visibleGapVolume += kw.volume;
    }
  }
  // Couverture calculée sur le total du projet (pas sur le filtré).
  const totalAllVolume = all.reduce((s, k) => s + k.volume, 0);
  const myVolume = all.filter((k) => !k.isGap).reduce((s, k) => s + k.volume, 0);
  const coveragePct = totalAllVolume > 0 ? Math.round((myVolume / totalAllVolume) * 100) : 0;
  return {
    visibleCount,
    totalCount,
    visibleVolume,
    visibleGapCount,
    visibleGapVolume,
    coveragePct,
  };
}

export function ProjectStats({ visibleKws, totalKws }: Props) {
  const stats = useMemo(() => compute(visibleKws, totalKws), [visibleKws, totalKws]);
  const filtered = stats.visibleCount < stats.totalCount;

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-border-subtle bg-bg-base/50 px-5 py-1.5 text-xs">
      <Stat
        icon={<Eye size={11} />}
        label="KWs"
        value={
          <>
            <span className={filtered ? 'text-amber-300' : 'text-text-primary'}>
              {stats.visibleCount}
            </span>
            <span className="text-text-muted"> / {stats.totalCount}</span>
          </>
        }
      />
      <Stat
        icon={<TrendingUp size={11} />}
        label="Volume"
        value={
          <span className="text-text-primary">{formatVolume(stats.visibleVolume)}</span>
        }
      />
      <Stat
        icon={<AlertTriangle size={11} className="text-amber-400" />}
        label="Gaps"
        value={
          <span className="text-amber-300">
            {stats.visibleGapCount}
            <span className="text-text-muted"> · {formatVolume(stats.visibleGapVolume)} vol manqué</span>
          </span>
        }
      />
      <Stat
        icon={<Activity size={11} />}
        label="Couverture"
        value={
          <span
            className={
              stats.coveragePct >= 60
                ? 'text-green-400'
                : stats.coveragePct >= 30
                  ? 'text-amber-300'
                  : 'text-red-400'
            }
          >
            {stats.coveragePct}%
          </span>
        }
      />
      {filtered && (
        <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-text-muted">
          <Target size={10} />
          stats sur les KWs filtrés
        </span>
      )}
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="inline-flex items-center gap-1.5">
      <span className="text-text-muted">{icon}</span>
      <span className="text-[10px] uppercase tracking-wide text-text-muted">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}

function formatVolume(v: number): string {
  if (v < 1000) return v.toString();
  if (v < 1_000_000) return `${(v / 1000).toFixed(v < 10000 ? 1 : 0)}K`;
  return `${(v / 1_000_000).toFixed(2)}M`;
}
