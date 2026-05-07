import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, AlertCircle } from 'lucide-react';
import { db } from '@/lib/db';
import { RunClusteringButton } from '@/components/clustering/RunClusteringButton';
import { GraphCanvas } from '@/components/graph/GraphCanvas';
import { ClusterPanel } from '@/components/graph/ClusterPanel';

export function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [highlightedClusterId, setHighlightedClusterId] = useState<string | null>(null);

  const project = useLiveQuery(
    () => (projectId ? db.projects.get(projectId) : undefined),
    [projectId],
  );
  const competitorCount = useLiveQuery(
    () => (projectId ? db.competitors.where('projectId').equals(projectId).count() : 0),
    [projectId],
  );
  const keywordCount = useLiveQuery(
    () => (projectId ? db.keywords.where('projectId').equals(projectId).count() : 0),
    [projectId],
  );

  if (project === undefined) {
    return <div className="p-10 text-text-muted">Chargement…</div>;
  }
  if (project === null) {
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
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle bg-bg-surface/60 px-5 py-2.5 backdrop-blur">
        <div className="flex items-center gap-3">
          <Link
            to="/projects"
            className="rounded p-1 text-text-muted hover:bg-bg-elevated hover:text-text-primary"
            aria-label="Retour aux projets"
          >
            <ArrowLeft size={16} />
          </Link>
          <h1 className="text-base font-semibold tracking-tight">{project.name}</h1>
          <span className="font-mono text-xs text-text-muted">
            {project.myDomain} · {project.country}
          </span>
          <span className="font-mono text-xs text-text-muted">
            · {keywordCount ?? '…'} KWs · {competitorCount ?? '…'} sites
          </span>
        </div>
        <RunClusteringButton projectId={projectId!} variant="compact" />
      </header>

      <div className="relative flex-1 overflow-hidden">
        <GraphCanvas
          projectId={projectId!}
          highlightedClusterId={highlightedClusterId}
        />
        <ClusterPanel
          projectId={projectId!}
          highlightedClusterId={highlightedClusterId}
          onHighlight={setHighlightedClusterId}
        />
      </div>
    </div>
  );
}
