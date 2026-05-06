import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, FolderKanban, Trash2 } from 'lucide-react';
import { db } from '@/lib/db';

export function ProjectsPage() {
  const projects = useLiveQuery(() => db.projects.orderBy('createdAt').reverse().toArray());

  const projectStats = useLiveQuery(async () => {
    if (!projects) return {};
    const stats: Record<string, { kwCount: number; competitorCount: number }> = {};
    for (const p of projects) {
      const [kwCount, competitorCount] = await Promise.all([
        db.keywords.where('projectId').equals(p.id).count(),
        db.competitors.where('projectId').equals(p.id).count(),
      ]);
      stats[p.id] = { kwCount, competitorCount };
    }
    return stats;
  }, [projects]);

  const onDelete = async (id: string, name: string) => {
    if (!confirm(`Supprimer le projet "${name}" ?\nLes mots-clés et concurrents associés seront effacés.`)) {
      return;
    }
    await db.transaction('rw', [db.projects, db.competitors, db.keywords, db.clusters], async () => {
      await db.keywords.where('projectId').equals(id).delete();
      await db.competitors.where('projectId').equals(id).delete();
      await db.clusters.where('projectId').equals(id).delete();
      await db.projects.delete(id);
    });
  };

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Projets</h1>
        <Link
          to="/projects/new"
          className="inline-flex items-center gap-2 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover"
        >
          <Plus size={16} />
          Nouveau projet
        </Link>
      </header>

      <div className="mt-6">
        {projects === undefined ? (
          <div className="rounded-lg border border-dashed border-border-subtle p-10 text-center text-text-muted">
            Chargement…
          </div>
        ) : projects.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border-subtle p-10 text-center">
            <FolderKanban className="mx-auto mb-3 text-text-muted" size={32} />
            <p className="text-text-secondary">Aucun projet pour l'instant.</p>
            <Link
              to="/projects/new"
              className="mt-4 inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
            >
              <Plus size={16} />
              Créer mon premier projet
            </Link>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {projects.map((p) => {
              const s = projectStats?.[p.id];
              return (
                <li
                  key={p.id}
                  className="group relative rounded-lg border border-border-subtle bg-bg-surface p-4 transition-colors hover:border-border-strong"
                >
                  <Link to={`/projects/${p.id}`} className="block">
                    <h3 className="font-semibold tracking-tight">{p.name}</h3>
                    <p className="mt-0.5 font-mono text-xs text-text-muted">
                      {p.myDomain} · {p.country}
                    </p>
                    <div className="mt-3 flex items-center gap-4 text-xs text-text-secondary">
                      <span>
                        <span className="font-mono text-text-primary">
                          {s?.kwCount ?? '…'}
                        </span>{' '}
                        KWs
                      </span>
                      <span>
                        <span className="font-mono text-text-primary">
                          {s?.competitorCount ?? '…'}
                        </span>{' '}
                        sites
                      </span>
                    </div>
                  </Link>
                  <button
                    type="button"
                    onClick={() => onDelete(p.id, p.name)}
                    className="absolute right-3 top-3 rounded p-1 text-text-muted opacity-0 transition-opacity hover:bg-bg-elevated hover:text-red-400 group-hover:opacity-100"
                    aria-label="Supprimer le projet"
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
