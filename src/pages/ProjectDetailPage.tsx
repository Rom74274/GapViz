import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, AlertCircle, Network, Table2, Plus } from 'lucide-react';
import { db } from '@/lib/db';
import { RunClusteringButton } from '@/components/clustering/RunClusteringButton';
import { AddSiteFromExport } from '@/components/onboarding/AddSiteFromExport';
import { GraphCanvas, type GraphCanvasHandle } from '@/components/graph/GraphCanvas';
import { Starfield } from '@/components/Starfield';
import { ClusterPanel } from '@/components/graph/ClusterPanel';
import { ProjectStats } from '@/components/graph/ProjectStats';
import { KeywordTable } from '@/components/graph/KeywordTable';
import { KeywordDetailSidebar } from '@/components/graph/KeywordDetailSidebar';
import { FilterBar } from '@/components/filters/FilterBar';
import { useProjectGraph } from '@/lib/useProjectGraph';
import { useProjectFilters } from '@/lib/filterStore';
import { isKeywordVisible } from '@/lib/filterLogic';
import {
  fetchProjectDetailFromSupabase,
  syncProjectToDexie,
} from '@/lib/dataLayer';
import type { KeywordNode } from '@/components/graph/graphLayout';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

export function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { status: authStatus } = useAuth();
  const [highlightedClusterId, setHighlightedClusterId] = useState<string | null>(null);
  const [view, setView] = useState<'graph' | 'table'>('graph');
  const [selectedKwId, setSelectedKwId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [remoteSyncState, setRemoteSyncState] = useState<
    'idle' | 'syncing' | 'synced' | 'absent' | 'error'
  >('idle');
  const [addSiteOpen, setAddSiteOpen] = useState(false);
  const graphRef = useRef<GraphCanvasHandle>(null);

  // Sync Supabase → Dexie en write-through au mount du projet. Tout
  // l'arbre downstream (GraphCanvas, FilterBar, ClusterPanel) lit Dexie
  // via useLiveQuery et voit les données fraîches automatiquement.
  useEffect(() => {
    let cancelled = false;
    if (!projectId || authStatus !== 'authenticated') return;
    setRemoteSyncState('syncing');
    fetchProjectDetailFromSupabase(projectId).then(async (result) => {
      if (cancelled) return;
      if (!result.ok) {
        setRemoteSyncState(result.reason === 'not_found' ? 'absent' : 'error');
        return;
      }
      try {
        await syncProjectToDexie(result.data);
        if (!cancelled) setRemoteSyncState('synced');
      } catch (e) {
        console.error('[projectDetail] syncToDexie failed', e);
        if (!cancelled) setRemoteSyncState('error');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, authStatus]);

  const { graph, project } = useProjectGraph(projectId ?? '');
  const filters = useProjectFilters(projectId ?? '');

  const competitorCount = useLiveQuery(
    () => (projectId ? db.competitors.where('projectId').equals(projectId).count() : 0),
    [projectId],
  );

  const { allKws, visibleKws } = useMemo(() => {
    const all: KeywordNode[] = graph
      ? graph.nodes.filter((n): n is KeywordNode => n.kind === 'keyword')
      : [];
    const visible = all.filter((n) => isKeywordVisible(n, filters));
    return { allKws: all, visibleKws: visible };
  }, [graph, filters]);

  const selectedNode = useMemo<KeywordNode | null>(() => {
    if (!selectedKwId) return null;
    return allKws.find((n) => n.id === selectedKwId) ?? null;
  }, [selectedKwId, allKws]);

  // Reset la sélection au changement de projet.
  useEffect(() => {
    setSelectedIds(new Set());
    setSelectedKwId(null);
  }, [projectId]);

  // Le projet peut être en cours de sync depuis Supabase : on attend la
  // résolution du fetch remote avant de conclure "introuvable".
  if (project === undefined) {
    return <div className="p-10 text-text-muted">Chargement…</div>;
  }
  if (project === null && (remoteSyncState === 'idle' || remoteSyncState === 'syncing')) {
    return <div className="p-10 text-text-muted">Chargement depuis le cloud…</div>;
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

  const zoomToCluster = (id: string) => graphRef.current?.zoomToCluster(id);

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
            · {competitorCount ?? '…'} sites
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAddSiteOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border-subtle bg-bg-surface px-3 py-1.5 text-xs text-text-secondary hover:border-accent/60 hover:text-accent"
            title="Importer un autre site depuis Ahrefs"
          >
            <Plus size={12} />
            Ajouter un site
          </button>
          <ViewToggle view={view} onChange={setView} />
          <RunClusteringButton projectId={projectId!} variant="compact" />
        </div>
      </header>

      <AddSiteFromExport
        projectId={projectId!}
        open={addSiteOpen}
        onClose={() => setAddSiteOpen(false)}
        onImportComplete={() => {
          // Le sync write-through dans AddSiteFromExport a déjà repeuplé
          // Dexie. Les useLiveQuery du graph / table re-rendent automatiquement.
        }}
      />

      <ProjectStats visibleKws={visibleKws} totalKws={allKws} />

      <FilterBar
        projectId={projectId!}
        projectName={project.name}
        visibleKws={visibleKws}
        totalKwCount={allKws.length}
        onZoomToCluster={zoomToCluster}
        selectedIds={selectedIds}
      />

      <div className="relative flex-1 overflow-hidden">
        {view === 'graph' ? (
          <>
            {/* Starfield ambient — uniquement sur la vue graph (cluster).
                Monté à l'intérieur du container pour ne pas dépasser. */}
            <Starfield />
            <GraphCanvas
              ref={graphRef}
              projectId={projectId!}
              highlightedClusterId={highlightedClusterId}
              selectedKeywordId={selectedKwId}
              onSelectKeyword={setSelectedKwId}
            />
            <ClusterPanel
              projectId={projectId!}
              highlightedClusterId={highlightedClusterId}
              onHighlight={setHighlightedClusterId}
              onZoomToCluster={zoomToCluster}
            />
          </>
        ) : (
          <KeywordTable
            visibleKws={visibleKws}
            totalKws={allKws}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            onRowClick={(kwId) => {
              setSelectedKwId(kwId);
            }}
          />
        )}
        {selectedNode && (
          <KeywordDetailSidebar
            node={selectedNode}
            projectId={projectId!}
            onClose={() => setSelectedKwId(null)}
          />
        )}
      </div>
    </div>
  );
}

function ViewToggle({
  view,
  onChange,
}: {
  view: 'graph' | 'table';
  onChange: (v: 'graph' | 'table') => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-border-subtle p-0.5">
      <button
        type="button"
        onClick={() => onChange('graph')}
        className={cn(
          'flex items-center gap-1 rounded-sm px-2 py-1 text-xs transition-colors',
          view === 'graph'
            ? 'bg-bg-elevated text-text-primary'
            : 'text-text-muted hover:text-text-primary',
        )}
        title="Vue graph"
      >
        <Network size={12} />
        Graph
      </button>
      <button
        type="button"
        onClick={() => onChange('table')}
        className={cn(
          'flex items-center gap-1 rounded-sm px-2 py-1 text-xs transition-colors',
          view === 'table'
            ? 'bg-bg-elevated text-text-primary'
            : 'text-text-muted hover:text-text-primary',
        )}
        title="Vue tableau"
      >
        <Table2 size={12} />
        Tableau
      </button>
    </div>
  );
}

