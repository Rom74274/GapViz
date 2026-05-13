import { useMemo } from 'react';
import { Eye, AlertTriangle, TrendingUp, Activity, Target } from 'lucide-react';
import type { KeywordNode } from './graphLayout';
import { cn } from '@/lib/utils';

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
  const totalAllVolume = all.reduce((s, k) => s + k.volume, 0);
  const myVolume = all
    .filter((k) => !k.isGap)
    .reduce((s, k) => s + k.volume, 0);
  const coveragePct =
    totalAllVolume > 0 ? Math.round((myVolume / totalAllVolume) * 100) : 0;
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
  const coverageColor =
    stats.coveragePct >= 60
      ? 'text-green-400'
      : stats.coveragePct >= 30
        ? 'text-amber-300'
        : 'text-red-400';
  const coverageBar =
    stats.coveragePct >= 60
      ? 'from-green-500/80 to-green-400'
      : stats.coveragePct >= 30
        ? 'from-amber-500/80 to-amber-300'
        : 'from-red-500/80 to-red-400';

  return (
    <div className="relative border-b border-border-subtle/70 bg-gradient-to-r from-bg-base/60 via-bg-surface/40 to-bg-base/60 px-5 py-3 backdrop-blur">
      <div className="flex flex-wrap items-center gap-x-7 gap-y-2.5">
        {/* KWS */}
        <StatBlock
          icon={<Eye size={13} />}
          iconBg="bg-indigo-500/15"
          iconColor="text-indigo-300"
          label="Mots-clés"
        >
          <span
            className={cn(
              'text-base font-semibold tabular-nums',
              filtered ? 'text-amber-300' : 'text-text-primary',
            )}
          >
            {stats.visibleCount.toLocaleString('fr-FR')}
          </span>
          <span className="ml-1 text-xs text-text-muted">
            / {stats.totalCount.toLocaleString('fr-FR')}
          </span>
        </StatBlock>

        <Divider />

        {/* VOLUME */}
        <StatBlock
          icon={<TrendingUp size={13} />}
          iconBg="bg-blue-500/15"
          iconColor="text-blue-300"
          label="Volume cumulé"
        >
          <span className="text-base font-semibold tabular-nums text-text-primary">
            {formatVolume(stats.visibleVolume)}
          </span>
          <span className="ml-1 text-xs text-text-muted">/mois</span>
        </StatBlock>

        <Divider />

        {/* GAPS — la métrique star */}
        <StatBlock
          icon={<AlertTriangle size={13} />}
          iconBg="bg-amber-500/15"
          iconColor="text-amber-400"
          label="Gaps"
          accent
        >
          <span className="text-base font-semibold tabular-nums text-amber-300">
            {stats.visibleGapCount.toLocaleString('fr-FR')}
          </span>
          <span className="ml-1.5 text-xs text-text-muted">
            · <span className="text-amber-200/80">{formatVolume(stats.visibleGapVolume)}</span> vol manqué
          </span>
        </StatBlock>

        <Divider />

        {/* COUVERTURE — visuel avec progress bar */}
        <div className="flex items-center gap-2.5">
          <span
            className={cn(
              'flex h-6 w-6 items-center justify-center rounded-md',
              stats.coveragePct >= 60
                ? 'bg-green-500/15 text-green-300'
                : stats.coveragePct >= 30
                  ? 'bg-amber-500/15 text-amber-300'
                  : 'bg-red-500/15 text-red-300',
            )}
          >
            <Activity size={13} />
          </span>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-text-muted">
              Couverture
            </span>
            <div className="flex items-baseline gap-2">
              <span className={cn('text-base font-semibold tabular-nums', coverageColor)}>
                {stats.coveragePct}%
              </span>
              <div className="h-1 w-20 overflow-hidden rounded-full bg-bg-elevated">
                <div
                  className={cn(
                    'h-full rounded-full bg-gradient-to-r transition-all duration-500',
                    coverageBar,
                  )}
                  style={{ width: `${stats.coveragePct}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {filtered && (
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-300">
            <Target size={10} />
            stats sur les KWs filtrés
          </span>
        )}
      </div>
    </div>
  );
}

function StatBlock({
  icon,
  iconBg,
  iconColor,
  label,
  children,
  accent,
}: {
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  label: string;
  children: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className={cn('flex h-6 w-6 items-center justify-center rounded-md', iconBg, iconColor)}>
        {icon}
      </span>
      <div className="flex flex-col gap-0.5">
        <span
          className={cn(
            'text-[10px] uppercase tracking-wide',
            accent ? 'text-amber-400/80' : 'text-text-muted',
          )}
        >
          {label}
        </span>
        <span className="leading-none">{children}</span>
      </div>
    </div>
  );
}

function Divider() {
  return <span className="hidden h-8 w-px self-center bg-border-subtle/60 lg:block" />;
}

function formatVolume(v: number): string {
  if (v < 1000) return v.toLocaleString('fr-FR');
  if (v < 1_000_000) return `${(v / 1000).toFixed(v < 10000 ? 1 : 0)}K`;
  return `${(v / 1_000_000).toFixed(2)}M`;
}
