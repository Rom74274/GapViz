import { useLiveQuery } from 'dexie-react-hooks';
import { Layers } from 'lucide-react';
import { db, type Keyword } from '@/lib/db';

interface Props {
  projectId: string;
}

interface ClusterStat {
  id: string;
  name: string;
  kwCount: number;
  totalVolume: number;
  domains: string[];
}

export function ClusterList({ projectId }: Props) {
  const stats = useLiveQuery(async (): Promise<ClusterStat[]> => {
    const [clusters, keywords] = await Promise.all([
      db.clusters.where('projectId').equals(projectId).toArray(),
      db.keywords.where('projectId').equals(projectId).toArray(),
    ]);

    const byCluster = new Map<string, Keyword[]>();
    for (const k of keywords) {
      if (!k.clusterId) continue;
      const list = byCluster.get(k.clusterId);
      if (list) list.push(k);
      else byCluster.set(k.clusterId, [k]);
    }

    return clusters
      .map((c) => {
        const kws = byCluster.get(c.id) ?? [];
        const domains = [...new Set(kws.map((k) => k.sourceDomain))].sort();
        const totalVolume = kws.reduce((sum, k) => sum + k.volume, 0);
        return { id: c.id, name: c.name, kwCount: kws.length, totalVolume, domains };
      })
      .sort((a, b) => b.totalVolume - a.totalVolume);
  }, [projectId]);

  if (!stats || stats.length === 0) return null;

  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <Layers size={14} className="text-text-secondary" />
        Clusters <span className="text-text-muted font-normal">({stats.length})</span>
      </h2>
      <ul className="space-y-1.5">
        {stats.map((c) => (
          <li
            key={c.id}
            className="flex items-center justify-between gap-3 rounded-md border border-border-subtle bg-bg-surface px-3 py-2"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{c.name}</p>
              <p className="font-mono text-xs text-text-muted">
                {c.domains.length} site{c.domains.length > 1 ? 's' : ''}
              </p>
            </div>
            <div className="flex gap-4 text-right">
              <Stat value={c.kwCount.toString()} label="KWs" />
              <Stat value={c.totalVolume.toLocaleString('fr-FR')} label="Vol cumulé" />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-end">
      <span className="font-mono text-sm">{value}</span>
      <span className="text-xs text-text-muted">{label}</span>
    </div>
  );
}

