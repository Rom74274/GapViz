import { useMemo } from 'react';
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
  Cloud,
  HardDrive,
  Puzzle,
  Check,
  ExternalLink,
} from 'lucide-react';
import { db, type Keyword, type Project } from '@/lib/db';
import { useSupabaseProjects, purgeProjectFromDexie } from '@/lib/dataLayer';
import { supabase } from '@/lib/supabase';
import { EXTENSION_INSTALL_URL, useExtensionInstalled } from '@/lib/extensionInstall';
import { cn } from '@/lib/utils';

interface ProjectStat {
  kwCount: number;
  uniqueKwCount: number;
  competitorCount: number;
  gapCount: number;
  coveragePct: number;
  lastActivityAt: number;
}

export function HomePage() {
  const localProjects = useLiveQuery(() =>
    db.projects.orderBy('createdAt').reverse().toArray(),
  );
  const {
    projects: remoteProjects,
    loading: remoteLoading,
    refetch: refetchRemote,
  } = useSupabaseProjects();

  // Merge local + cloud : on dédupe par id, le remote gagne (= cloud source
  // of truth quand un projet existe des deux côtés). Trie par createdAt desc.
  const { projects, projectSources } = useMemo(() => {
    const map = new Map<string, Project>();
    const sources = new Map<string, 'local' | 'cloud'>();
    for (const p of localProjects ?? []) {
      map.set(p.id, p);
      sources.set(p.id, 'local');
    }
    for (const p of remoteProjects) {
      map.set(p.id, p);
      sources.set(p.id, 'cloud');
    }
    const merged = [...map.values()].sort((a, b) => b.createdAt - a.createdAt);
    return { projects: merged, projectSources: sources };
  }, [localProjects, remoteProjects]);

  // Stats par projet lues depuis Dexie (cache write-through). Pour les
  // projets cloud pas encore ouverts, le cache est vide → stats à 0. Elles
  // s'enrichiront automatiquement quand ProjectDetailPage déclenchera le
  // sync write-through au mount.
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
        `Supprimer le projet "${name}" ?\nLes mots-clés et concurrents associés seront effacés (local et cloud).`,
      )
    ) {
      return;
    }
    const source = projectSources.get(id);
    // Source-of-truth first : si cloud, on supprime Supabase d'abord
    // (CASCADE purge competitors / keywords / positions / clusters).
    // Si ça échoue, on ne touche pas le cache Dexie pour ne pas créer un
    // état incohérent — l'utilisateur peut retenter.
    if (source === 'cloud') {
      const { error } = await supabase.from('projects').delete().eq('id', id);
      if (error) {
        console.error('[home] supabase project delete error', error);
        alert(`Erreur Supabase : ${error.message}`);
        return;
      }
      refetchRemote();
    }
    // Puis on invalide le cache Dexie (= source-of-truth pour les projets
    // local-only pas encore migrés).
    await purgeProjectFromDexie(id);
  };

  const projectCount = projects?.length ?? 0;
  const totalKws = stats
    ? Object.values(stats).reduce((s, x) => s + x.uniqueKwCount, 0)
    : 0;
  const totalGaps = stats
    ? Object.values(stats).reduce((s, x) => s + x.gapCount, 0)
    : 0;

  const {
    installed: extensionInstalled,
    version: extensionVersion,
    needsUpdate: extensionNeedsUpdate,
    expectedVersion: extensionExpectedVersion,
  } = useExtensionInstalled();

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
          data-tour-id="tour-new-project-btn"
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-accent/20 transition-colors hover:bg-accent-hover"
        >
          <Plus size={16} />
          Nouveau projet
        </Link>
      </header>

      {projectCount > 0 && !extensionInstalled && <ExtensionBanner />}
      {projectCount > 0 && extensionInstalled && extensionNeedsUpdate && (
        <ExtensionUpdateBanner
          currentVersion={extensionVersion!}
          expectedVersion={extensionExpectedVersion}
        />
      )}

      <section className="mt-8">
        {localProjects === undefined || remoteLoading ? (
          <EmptyState>Chargement…</EmptyState>
        ) : projects.length === 0 ? (
          <FirstTimeEmptyState extensionInstalled={extensionInstalled} />
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
                source={projectSources.get(p.id) ?? 'local'}
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
  source,
  onDelete,
}: {
  projectId: string;
  name: string;
  domain: string;
  country: string;
  stat: ProjectStat | undefined;
  source: 'local' | 'cloud';
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
            <div className="flex items-center gap-2">
              <h3 className="truncate text-lg font-semibold tracking-tight">{name}</h3>
              <SourceBadge source={source} />
            </div>
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

function SourceBadge({ source }: { source: 'local' | 'cloud' }) {
  const isCloud = source === 'cloud';
  return (
    <span
      title={isCloud ? 'Projet synchronisé dans le cloud' : 'Projet local — non migré'}
      className={cn(
        'inline-flex h-5 shrink-0 items-center gap-1 rounded-full border px-1.5 text-[9px] font-medium uppercase tracking-wide',
        isCloud
          ? 'border-accent/40 bg-accent/10 text-accent'
          : 'border-border-subtle bg-bg-elevated text-text-muted',
      )}
    >
      {isCloud ? <Cloud size={9} /> : <HardDrive size={9} />}
      {isCloud ? 'Cloud' : 'Local'}
    </span>
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

function FirstTimeEmptyState({ extensionInstalled }: { extensionInstalled: boolean }) {
  return (
    <div className="rounded-xl border border-dashed border-border-subtle bg-bg-surface/30 p-12 text-center">
      <div className="mb-4 flex justify-center">
        <FolderKanban size={36} className="text-text-muted" />
      </div>
      <h2 className="text-lg font-semibold tracking-tight">
        Aucun projet pour l'instant
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-text-secondary">
        Crée ton premier projet SEO pour visualiser tes gaps concurrentiels.
        Tu pourras importer tes mots-clés depuis Ahrefs, Semrush ou SE Ranking
        en 1 clic.
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Link
          to="/projects/new"
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
        >
          <Plus size={16} />
          Créer mon premier projet
        </Link>
      </div>

      <div className="mt-6 inline-flex items-center gap-2 rounded-md border border-border-subtle bg-bg-surface/60 px-3 py-1.5 text-xs">
        {extensionInstalled ? (
          <>
            <Check size={12} className="text-green-400" />
            <span className="text-text-secondary">
              Extension Star Gap détectée — prête pour l'import
            </span>
          </>
        ) : (
          <>
            <Puzzle size={12} className="text-accent" />
            <span className="text-text-secondary">
              Pense à{' '}
              <a
                href={EXTENSION_INSTALL_URL}
                target="_blank"
                rel="noreferrer"
                className="text-accent hover:text-accent-hover"
              >
                installer l'extension Chrome
              </a>{' '}
              pour automatiser l'import
            </span>
          </>
        )}
      </div>
    </div>
  );
}

function ExtensionBanner() {
  return (
    <div className="mt-6 flex flex-wrap items-center gap-3 rounded-md border border-accent/30 bg-accent/5 px-4 py-3 text-xs">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
        <Puzzle size={13} />
      </span>
      <p className="min-w-0 flex-1 text-text-secondary">
        <strong className="text-text-primary">Extension Chrome non détectée.</strong>{' '}
        Installe-la pour importer tes mots-clés depuis Ahrefs, Semrush ou
        SE Ranking en 1 clic, au lieu d'exporter / importer manuellement.
      </p>
      <a
        href={EXTENSION_INSTALL_URL}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 rounded-md border border-accent/40 bg-accent/10 px-3 py-1.5 text-[11px] font-medium text-accent hover:bg-accent/20"
      >
        <ExternalLink size={11} />
        Installer
      </a>
    </div>
  );
}

function ExtensionUpdateBanner({
  currentVersion,
  expectedVersion,
}: {
  currentVersion: string;
  expectedVersion: string;
}) {
  return (
    <div className="mt-6 flex flex-wrap items-center gap-3 rounded-md border border-orange-400/40 bg-orange-400/5 px-4 py-3 text-xs">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-orange-400/15 text-orange-300">
        <AlertTriangle size={13} />
      </span>
      <p className="min-w-0 flex-1 text-text-secondary">
        <strong className="text-text-primary">
          Mise à jour de l'extension disponible.
        </strong>{' '}
        Tu utilises la v{currentVersion}, la dernière version est la v{expectedVersion}.
        Ouvre{' '}
        <code className="rounded bg-bg-elevated px-1 py-0.5 text-text-primary">
          chrome://extensions
        </code>{' '}
        et clique sur le bouton « Actualiser » de Star Gap Importer.
      </p>
      <a
        href={EXTENSION_INSTALL_URL}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 rounded-md border border-orange-400/40 bg-orange-400/10 px-3 py-1.5 text-[11px] font-medium text-orange-300 hover:bg-orange-400/20"
      >
        <ExternalLink size={11} />
        Voir
      </a>
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
