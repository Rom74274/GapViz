import { Link, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, User, Users, AlertCircle } from 'lucide-react';
import { db } from '@/lib/db';

export function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();

  const project = useLiveQuery(
    () => (projectId ? db.projects.get(projectId) : undefined),
    [projectId],
  );

  const competitors = useLiveQuery(
    () =>
      projectId
        ? db.competitors.where('projectId').equals(projectId).toArray()
        : [],
    [projectId],
  );

  const keywordCount = useLiveQuery(
    () =>
      projectId
        ? db.keywords.where('projectId').equals(projectId).count()
        : 0,
    [projectId],
  );

  if (project === undefined) {
    return <div className="p-10 text-text-muted">Chargement…</div>;
  }

  if (project === null || project === undefined && projectId) {
    return (
      <div className="mx-auto max-w-md px-6 py-20 text-center">
        <AlertCircle className="mx-auto mb-3 text-text-muted" size={32} />
        <p className="text-text-secondary">Projet introuvable.</p>
        <Link
          to="/projects"
          className="mt-4 inline-flex items-center gap-1.5 text-sm text-accent hover:text-accent-hover"
        >
          <ArrowLeft size={14} />
          Retour aux projets
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <Link
        to="/projects"
        className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft size={14} />
        Tous les projets
      </Link>

      <header className="mt-3 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{project!.name}</h1>
          <p className="mt-1 font-mono text-sm text-text-muted">
            {project!.myDomain} · {project!.country}
          </p>
        </div>
        <div className="flex gap-4 rounded-lg border border-border-subtle bg-bg-surface px-4 py-2 text-xs">
          <Stat label="Mots-clés" value={keywordCount ?? '…'} />
          <Stat label="Sites" value={competitors?.length ?? '…'} />
        </div>
      </header>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold">Acteurs</h2>
        <ul className="space-y-2">
          {competitors?.map((c) => (
            <li
              key={c.id}
              className="flex items-center gap-3 rounded-md border border-border-subtle bg-bg-surface px-3 py-2"
            >
              <div
                className="flex h-7 w-7 items-center justify-center rounded-md"
                style={{ backgroundColor: c.color + '22', color: c.color }}
              >
                {c.isMe ? <User size={14} /> : <Users size={14} />}
              </div>
              <div className="flex-1">
                <span className="text-sm font-medium">{c.label}</span>
                <span className="ml-2 font-mono text-xs text-text-muted">
                  {c.domain}
                </span>
              </div>
              {c.isMe && (
                <span className="rounded-full bg-bg-elevated px-2 py-0.5 text-xs text-text-secondary">
                  Mon site
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8 rounded-lg border border-dashed border-border-subtle bg-bg-surface/50 p-8 text-center">
        <p className="text-text-secondary">
          Le graph de clusters apparaîtra ici une fois le clustering Claude lancé.
        </p>
        <p className="mt-1 text-xs text-text-muted">
          Étape 4 — clustering Claude — à venir.
        </p>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex flex-col items-end">
      <span className="font-mono text-base text-text-primary">{value}</span>
      <span className="text-text-muted">{label}</span>
    </div>
  );
}
