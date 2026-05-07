import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronDown, ChevronRight, AlertTriangle, Layers } from 'lucide-react';
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
}

export function ClusterPanel({ projectId, highlightedClusterId, onHighlight, onZoomToCluster }: Props) {
  const [open, setOpen] = useState(true);

  const stats = useLiveQuery(async (): Promise<ClusterStat[]> => {
    const [clusters, keywords, competitors] = await Promise.all([
      db.clusters.where('projectId').equals(projectId).toArray(),
      db.keywords.where('projectId').equals(projectId).toArray(),
      db.competitors.where('projectId').equals(projectId).toArray(),
    ]);
    const meDomains = new Set(competitors.filter((c) => c.isMe).map((c) => c.domain));
    const byCluster = new Map<string, { kws: typeof keywords; mine: number }>();
    for (const k of keywords) {
      if (!k.clusterId) continue;
      const cur = byCluster.get(k.clusterId);
      if (cur) cur.kws.push(k);
      else byCluster.set(k.clusterId, { kws: [k], mine: 0 });
    }
    // Compte la couverture en dédupliquant les KWs par texte.
    const out: ClusterStat[] = [];
    for (const c of clusters) {
      const data = byCluster.get(c.id);
      if (!data) continue;
      const kwToSources = new Map<string, Set<string>>();
      for (const k of data.kws) {
        const key = k.keyword.trim().toLowerCase();
        const set = kwToSources.get(key) ?? new Set<string>();
        set.add(k.sourceDomain);
        kwToSources.set(key, set);
      }
      let myKwCount = 0;
      let competitorKwCount = 0;
      let totalVolume = 0;
      const seen = new Set<string>();
      for (const k of data.kws) {
        const key = k.keyword.trim().toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        const sources = kwToSources.get(key)!;
        const mine = [...sources].some((d) => meDomains.has(d));
        if (mine) myKwCount++;
        else competitorKwCount++;
        totalVolume += k.volume;
      }
      out.push({
        id: c.id,
        name: c.name,
        kwCount: myKwCount + competitorKwCount,
        myKwCount,
        competitorKwCount,
        totalVolume,
        isMyCovered: myKwCount > 0,
      });
    }
    // Tri : non couverts d'abord (par volume desc), puis couverts (par volume desc).
    return out.sort((a, b) => {
      if (a.isMyCovered !== b.isMyCovered) return a.isMyCovered ? 1 : -1;
      return b.totalVolume - a.totalVolume;
    });
  }, [projectId]);

  if (!stats || stats.length === 0) return null;

  const absent = stats.filter((s) => !s.isMyCovered);

  return (
    <aside className="absolute bottom-3 left-3 z-10 flex max-h-[60vh] w-[260px] flex-col rounded-lg border border-border-subtle bg-bg-surface/90 backdrop-blur">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between gap-2 rounded-t-lg px-3 py-2 text-left text-xs font-semibold text-text-primary hover:bg-bg-elevated"
      >
        <span className="flex items-center gap-2">
          <Layers size={12} className="text-text-secondary" />
          Clusters
          <span className="font-mono text-text-muted">({stats.length})</span>
          {absent.length > 0 && (
            <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-300">
              <AlertTriangle size={10} />
              {absent.length} non couvert{absent.length > 1 ? 's' : ''}
            </span>
          )}
        </span>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      {open && (
        <ul className="overflow-y-auto border-t border-border-subtle">
          {stats.map((c) => {
            const highlighted = highlightedClusterId === c.id;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => {
                    if (highlighted) {
                      onHighlight(null);
                    } else {
                      onHighlight(c.id);
                      onZoomToCluster?.(c.id);
                    }
                  }}
                  className={cn(
                    'flex w-full items-start justify-between gap-2 border-b border-border-subtle/60 px-3 py-2 text-left transition-colors hover:bg-bg-elevated',
                    highlighted && 'bg-bg-elevated',
                    !c.isMyCovered && 'bg-amber-500/5',
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      {!c.isMyCovered && (
                        <AlertTriangle size={10} className="shrink-0 text-amber-400" />
                      )}
                      <span
                        className={cn(
                          'truncate text-xs font-medium',
                          c.isMyCovered ? 'text-text-primary' : 'text-amber-300',
                        )}
                      >
                        {c.name}
                      </span>
                    </div>
                    <p className="mt-0.5 font-mono text-[10px] text-text-muted">
                      {c.isMyCovered ? (
                        <>
                          {c.myKwCount} à toi · {c.competitorKwCount} concurrents
                        </>
                      ) : (
                        <span className="text-amber-300/80">
                          Non couvert · {c.competitorKwCount} KWs concurrents
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-mono text-[11px] text-text-secondary">
                      {c.totalVolume.toLocaleString('fr-FR')}
                    </p>
                    <p className="text-[9px] text-text-muted">vol</p>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
