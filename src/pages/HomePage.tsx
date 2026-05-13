import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Plus,
  FolderKanban,
  Trash2,
  TrendingUp,
  AlertTriangle,
  Activity,
  Users,
} from 'lucide-react';
import { db, type Keyword } from '@/lib/db';

interface ProjectStat {
  kwCount: number;
  uniqueKwCount: number;
  competitorCount: number;
  gapCount: number;
  coveragePct: number;
  lastActivityAt: number;
}

export function HomePage() {
  const projects = useLiveQuery(() =>
    db.projects.orderBy('createdAt').reverse().toArray(),
  );

  const stats = useLiveQuery(async (): Promise<Record<string, ProjectStat>> => {
    if (!projects || projects.length === 0) return {};
    const out: Record<string, ProjectStat> = {};
    for (const p of projects) {
      const [keywords, competitorCount] = await Promise.all([
        db.keywords.where('projectId').equals(p.id).toArray(),
        db.competitors.where('projectId').equals(p.id).count(),
      ]);
      const meDomains = new Set(
        (await db.competitors.where('projectId').equals(p.id).toArray())
          .filter((c) => c.isMe)
          .map((c) => c.domain),
      );
      const unique = aggregateUniqueKws(keywords, meDomains);
      const coveragePct =
        unique.total > 0
          ? Math.round((unique.mineVolume / Math.max(1, unique.totalVolume)) * 100)
          : 0;
      out[p.id] = {
        kwCount: keywords.length,
        uniqueKwCount: unique.total,
        competitorCount,
        gapCount: unique.gaps,
        coveragePct,
        lastActivityAt: p.updatedAt ?? p.createdAt,
      };
    }
    return out;
  }, [projects]);

  const onDelete = async (id: string, name: string) => {
    if (
      !confirm(
        `Supprimer le projet "${name}" ?\nLes mots-clés et concurrents associés seront effacés.`,
      )
    ) {
      return;
    }
    await db.transaction(
      'rw',
      [db.projects, db.competitors, db.keywords, db.clusters],
      async () => {
        await db.keywords.where('projectId').equals(id).delete();
        await db.competitors.where('projectId').equals(id).delete();
        await db.clusters.where('projectId').equals(id).delete();
        await db.projects.delete(id);
      },
    );
  };

  const projectCount = projects?.length ?? 0;
  const totalKws = stats
    ? Object.values(stats).reduce((s, x) => s + x.uniqueKwCount, 0)
    : 0;
  const totalGaps = stats
    ? Object.values(stats).reduce((s, x) => s + x.gapCount, 0)
    : 0;

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Tes projets SEO</h1>
          <p className="mt-2 max-w-xl text-sm text-text-secondary">
            {projectCount === 0
              ? 'Crée ton premier projet pour commencer à explorer tes gaps SEO.'
              : 'Sélectionne un projet pour ouvrir le graph, ou crée-en un nouveau.'}
          </p>
        </div>
        <Link
          to="/projects/new"
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-accent/20 transition-colors hover:bg-accent-hover"
        >
          <Plus size={16} />
          Nouveau projet
        </Link>
      </header>

      <section className="mt-8">
        {projects === undefined ? (
          <EmptyState>Chargement…</EmptyState>
        ) : projects.length === 0 ? (
          <EmptyState icon={<FolderKanban size={36} className="text-text-muted" />}>
            <p className="text-text-secondary">Aucun projet pour l'instant.</p>
            <Link
              to="/projects/new"
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
            >
              <Plus size={16} />
              Créer mon premier projet
            </Link>
          </EmptyState>
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
              <ProjectCard
                key={p.id}
                projectId={p.id}
                name={p.name}
                domain={p.myDomain}
                country={p.country}
                stat={stats?.[p.id]}
                onDelete={() => onDelete(p.id, p.name)}
              />
            ))}
          </ul>
        )}
      </section>

      {projects && projects.length > 1 && stats && (
        <footer className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border-subtle pt-4 text-xs text-text-secondary">
          <Summary
            icon={<FolderKanban size={12} />}
            label={`${projectCount} projets`}
          />
          <Summary
            icon={<TrendingUp size={12} />}
            label={`${totalKws.toLocaleString('fr-FR')} KWs uniques`}
          />
          <Summary
            icon={<AlertTriangle size={12} className="text-amber-400" />}
            label={`${totalGaps.toLocaleString('fr-FR')} gaps identifiés`}
          />
        </footer>
      )}
    </div>
  );
}

function ProjectCard({
  projectId,
  name,
  domain,
  country,
  stat,
  onDelete,
}: {
  projectId: string;
  name: string;
  domain: string;
  country: string;
  stat: ProjectStat | undefined;
  onDelete: () => void;
}) {
  const coverage = stat?.coveragePct ?? 0;
  const coverageColor =
    coverage >= 60 ? 'text-green-400' : coverage >= 30 ? 'text-amber-300' : 'text-red-400';

  return (
    <li className="group relative">
      <Link
        to={`/projects/${projectId}`}
        className="block rounded-xl border border-border-subtle bg-bg-surface/85 p-5 backdrop-blur transition-all hover:border-accent/40 hover:bg-bg-surface hover:shadow-xl hover:shadow-accent/5"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-semibold tracking-tight">{name}</h3>
            <p className="mt-0.5 truncate font-mono text-xs text-text-muted">
              {domain} · {country}
            </p>
          </div>
          {stat && (
            <div className={`text-right ${coverageColor}`}>
              <p className="font-mono text-lg font-semibold leading-none">
                {coverage}%
              </p>
              <p className="mt-0.5 text-[9px] uppercase tracking-wide text-text-muted">
                Couverture
              </p>
            </div>
          )}
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <Tile
            icon={<TrendingUp size={11} />}
            value={stat ? stat.uniqueKwCount.toLocaleString('fr-FR') : '…'}
            label="KWs uniques"
          />
          <Tile
            icon={<AlertTriangle size={11} className="text-amber-400" />}
            value={stat ? stat.gapCount.toLocaleString('fr-FR') : '…'}
            label="Gaps"
          />
          <Tile
            icon={<Users size={11} />}
            value={stat ? stat.competitorCount.toString() : '…'}
            label="Sites"
          />
        </div>

        <div className="mt-4 flex items-center justify-between text-[10px] text-text-muted">
          <span className="flex items-center gap-1">
            <Activity size={10} />
            {stat ? formatDate(stat.lastActivityAt) : '—'}
          </span>
          <span className="text-text-muted/70">Ouvrir →</span>
        </div>
      </Link>
      <button
        type="button"
        onClick={onDelete}
        className="absolute right-3 top-3 rounded p-1 text-text-muted opacity-0 transition-opacity hover:bg-bg-elevated hover:text-red-400 group-hover:opacity-100"
        aria-label="Supprimer le projet"
      >
        <Trash2 size={14} />
      </button>
    </li>
  );
}

function Tile({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
}) {
  return (
    <div className="rounded-md bg-bg-base/60 px-2 py-1.5">
      <div className="flex items-center gap-1 text-text-muted">{icon}</div>
      <p className="mt-0.5 font-mono text-sm text-text-primary">{value}</p>
      <p className="text-[9px] uppercase tracking-wide text-text-muted">{label}</p>
    </div>
  );
}

function EmptyState({
  icon,
  children,
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border-subtle bg-bg-surface/30 p-12 text-center">
      {icon && <div className="mb-3 flex justify-center">{icon}</div>}
      {children}
    </div>
  );
}

function Summary({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-text-muted">{icon}</span>
      <span>{label}</span>
    </span>
  );
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

interface UniqueAgg {
  total: number;
  totalVolume: number;
  mineVolume: number;
  gaps: number;
}

function aggregateUniqueKws(
  keywords: Keyword[],
  meDomains: Set<string>,
): UniqueAgg {
  // Group by KW text, agrège les sources et calcule la couverture en volume.
  type Group = { keyword: string; volume: number; sourceMine: boolean };
  const map = new Map<string, Group>();
  for (const k of keywords) {
    const key = k.keyword.trim().toLowerCase();
    const isMe = meDomains.has(k.sourceDomain);
    const existing = map.get(key);
    if (existing) {
      existing.volume = Math.max(existing.volume, k.volume);
      if (isMe) existing.sourceMine = true;
    } else {
      map.set(key, { keyword: k.keyword, volume: k.volume, sourceMine: isMe });
    }
  }
  let total = 0;
  let totalVolume = 0;
  let mineVolume = 0;
  let gaps = 0;
  for (const g of map.values()) {
    total++;
    totalVolume += g.volume;
    if (g.sourceMine) mineVolume += g.volume;
    else gaps++;
  }
  return { total, totalVolume, mineVolume, gaps };
}
