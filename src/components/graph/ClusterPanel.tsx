import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Layers, Info, X } from 'lucide-react';
import { db } from '@/lib/db';
import { cn } from '@/lib/utils';

interface Props {
  projectId: string;
  highlightedClusterId: string | null;
  onHighlight: (clusterId: string | null) => void;
  onZoomToCluster?: (clusterId: string) => void;
}

interface ClusterStat {
  id: string;
  name: string;
  kwCount: number;
  myKwCount: number;
  competitorKwCount: number;
  totalVolume: number;
  isMyCovered: boolean;
  dotColor: string;
}

const OPP_DOT = '#FFD43B';

export function ClusterPanel({ projectId, highlightedClusterId, onHighlight, onZoomToCluster }: Props) {
  const [open, setOpen] = useState(true);
  const [legendOpen, setLegendOpen] = useState(true);

  const data = useLiveQuery(async () => {
    const [clusters, keywords, competitors] = await Promise.all([
      db.clusters.where('projectId').equals(projectId).toArray(),
      db.keywords.where('projectId').equals(projectId).toArray(),
      db.competitors.where('projectId').equals(projectId).toArray(),
    ]);
    const meDomains = new Set(competitors.filter((c) => c.isMe).map((c) => c.domain));
    const colorByDomain = new Map(competitors.map((c) => [c.domain, c.color]));

    const byCluster = new Map<string, typeof keywords>();
    for (const k of keywords) {
      if (!k.clusterId) continue;
      const cur = byCluster.get(k.clusterId);
      if (cur) cur.push(k);
      else byCluster.set(k.clusterId, [k]);
    }

    const stats: ClusterStat[] = [];
    for (const c of clusters) {
      const kws = byCluster.get(c.id);
      if (!kws) continue;
      const kwToSources = new Map<string, Set<string>>();
      for (const k of kws) {
        const key = k.keyword.trim().toLowerCase();
        const set = kwToSources.get(key) ?? new Set<string>();
        set.add(k.sourceDomain);
        kwToSources.set(key, set);
      }
      let myKwCount = 0;
      let competitorKwCount = 0;
      let totalVolume = 0;
      const seen = new Set<string>();
      const compDomainCount = new Map<string, number>();
      for (const k of kws) {
        const key = k.keyword.trim().toLowerCase();
        if (!meDomains.has(k.sourceDomain)) {
          compDomainCount.set(k.sourceDomain, (compDomainCount.get(k.sourceDomain) ?? 0) + 1);
        }
        if (seen.has(key)) continue;
        seen.add(key);
        const sources = kwToSources.get(key)!;
        const mine = [...sources].some((d) => meDomains.has(d));
        if (mine) myKwCount++;
        else competitorKwCount++;
        totalVolume += k.volume;
      }
      const isMyCovered = myKwCount > 0;
      // Couleur de pastille : jaune si opportunité (non couvert), sinon la
      // couleur du concurrent dominant dans le cluster.
      let dominantDomain = '';
      let best = -1;
      for (const [d, n] of compDomainCount) {
        if (n > best) {
          best = n;
          dominantDomain = d;
        }
      }
      const dotColor = isMyCovered
        ? (colorByDomain.get(dominantDomain) ?? '#8b92aa')
        : OPP_DOT;
      stats.push({
        id: c.id,
        name: c.name,
        kwCount: myKwCount + competitorKwCount,
        myKwCount,
        competitorKwCount,
        totalVolume,
        isMyCovered,
        dotColor,
      });
    }
    stats.sort((a, b) => {
      if (a.isMyCovered !== b.isMyCovered) return a.isMyCovered ? 1 : -1;
      return b.totalVolume - a.totalVolume;
    });

    const legend = competitors
      .map((c) => ({ label: c.label, color: c.color, isMe: c.isMe }))
      .sort((a, b) => (a.isMe === b.isMe ? a.label.localeCompare(b.label) : a.isMe ? -1 : 1));

    return { stats, legend };
  }, [projectId]);

  if (!data || data.stats.length === 0) return null;
  const { stats, legend } = data;

  // Replié : bouton carré « layers » en haut à gauche.
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Afficher les clusters"
        className="absolute left-4 top-4 z-20 flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-[rgba(12,15,30,0.72)] text-[#9aa0d0] backdrop-blur-md transition-colors hover:bg-white/[0.06]"
      >
        <Layers size={16} />
      </button>
    );
  }

  return (
    <aside className="absolute bottom-4 left-4 top-4 z-20 flex w-[288px] flex-col overflow-hidden rounded-2xl border border-white/[0.07] bg-[rgba(12,15,30,0.72)] backdrop-blur-md">
      {/* En-tête */}
      <div className="flex shrink-0 items-center gap-2 px-4 pb-3 pt-3.5">
        <Layers size={16} className="text-[#9aa0d0]" />
        <span className="text-[14px] font-semibold text-[#e6e9f2]">Clusters</span>
        <span className="font-mono text-[13px] text-[#6b7290]">{stats.length}</span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          title="Masquer les clusters"
          className="ml-auto flex h-6 w-6 items-center justify-center rounded-md text-text-muted hover:bg-white/[0.06] hover:text-text-primary"
        >
          <X size={15} />
        </button>
      </div>

      {/* Liste */}
      <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-2.5">
        {stats.map((c) => {
          const highlighted = highlightedClusterId === c.id;
          return (
            <li key={c.id}>
              <button
                type="button"
                onMouseEnter={() => onHighlight(c.id)}
                onMouseLeave={() => onHighlight(null)}
                onClick={() => onZoomToCluster?.(c.id)}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors',
                  highlighted ? 'bg-white/[0.06]' : 'hover:bg-white/[0.05]',
                )}
              >
                <span
                  className="inline-block h-2 w-2 shrink-0 rounded-full"
                  style={{
                    backgroundColor: c.dotColor,
                    boxShadow: c.isMyCovered ? undefined : `0 0 8px ${c.dotColor}`,
                  }}
                />
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      'block truncate text-[13px] font-medium',
                      c.isMyCovered ? 'text-[#dfe3ef]' : 'text-amber-300',
                    )}
                  >
                    {c.name}
                  </span>
                  <span className="block truncate text-[11px] text-[#6b7290]">
                    {c.myKwCount} à toi · {c.competitorKwCount} concurrents
                  </span>
                </span>
                <span className="shrink-0 font-mono text-[12px] text-[#8b92aa]">
                  {c.totalVolume.toLocaleString('fr-FR')}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {/* Légende */}
      <div className="shrink-0 border-t border-white/[0.07] bg-white/[0.02]">
        {legendOpen ? (
          <div className="px-4 py-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[#727a92]">
                Légende
              </span>
              <button
                type="button"
                onClick={() => setLegendOpen(false)}
                className="flex h-5 w-5 items-center justify-center rounded text-text-muted hover:bg-white/[0.06] hover:text-text-primary"
                title="Masquer la légende"
              >
                <X size={13} />
              </button>
            </div>
            <ul className="flex flex-col gap-1.5 text-[12px] text-[#c3c8db]">
              {legend.map((l) => (
                <li key={l.label} className="flex items-center gap-2">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{
                      backgroundColor: l.color,
                      boxShadow: l.isMe ? `0 0 7px ${l.color}` : undefined,
                    }}
                  />
                  <span className={cn('truncate', l.isMe && 'font-semibold')}>{l.label}</span>
                </li>
              ))}
              <li className="flex items-center gap-2">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: OPP_DOT, boxShadow: `0 0 8px ${OPP_DOT}` }}
                />
                <span>glow = opportunité</span>
              </li>
              <li className="flex items-center gap-2">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full border-[1.5px] border-dashed"
                  style={{ borderColor: OPP_DOT }}
                />
                <span>cluster non couvert</span>
              </li>
            </ul>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setLegendOpen(true)}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-[12px] text-[#8b92aa] hover:bg-white/[0.04] hover:text-text-secondary"
          >
            <Info size={14} />
            Afficher la légende
          </button>
        )}
      </div>
    </aside>
  );
}
