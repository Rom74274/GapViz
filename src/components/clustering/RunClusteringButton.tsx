import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Sparkles,
  Loader2,
  AlertCircle,
  KeyRound,
  RefreshCw,
  Check,
  ChevronDown,
  Zap,
  Trash2,
} from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useSettings } from '@/lib/store';
import { db } from '@/lib/db';
import {
  runClustering,
  estimateClusteringCost,
  formatUSD,
  uniqueKeywordCount,
  clearProjectClusterCache,
  type ClusterRunResult,
} from '@/lib/clustering';
import { cn } from '@/lib/utils';

interface Props {
  projectId: string;
  variant?: 'card' | 'compact';
}

export function RunClusteringButton({ projectId, variant = 'card' }: Props) {
  const apiKey = useSettings((s) => s.apiKey);
  const model = useSettings((s) => s.model);

  const existingClusterCount = useLiveQuery(
    () => db.clusters.where('projectId').equals(projectId).count(),
    [projectId],
  );

  const [kwCount, setKwCount] = useState<number | null>(null);
  const [status, setStatus] = useState<'idle' | 'running' | 'error' | 'done'>('idle');
  const [result, setResult] = useState<ClusterRunResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    uniqueKeywordCount(projectId).then(setKwCount);
  }, [projectId, existingClusterCount]);

  const run = async (force: boolean) => {
    if (!apiKey) return;
    setStatus('running');
    setError(null);
    try {
      const r = await runClustering(projectId, { apiKey, model, force });
      setResult(r);
      setStatus('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue');
      setStatus('error');
    }
  };

  const clearCache = async () => {
    const count = await clearProjectClusterCache(projectId);
    setError(null);
    setStatus('idle');
    setResult(null);
    alert(`${count} entrée(s) de cache effacée(s) pour ce projet.`);
  };

  if (variant === 'compact') {
    return (
      <CompactView
        apiKey={apiKey}
        kwCount={kwCount}
        model={model}
        status={status}
        result={result}
        error={error}
        hasExisting={(existingClusterCount ?? 0) > 0}
        onRun={() => run(false)}
        onForceRun={() => run(true)}
        onClearCache={clearCache}
      />
    );
  }

  if (!apiKey) {
    return (
      <Card>
        <KeyRound size={18} className="text-text-secondary" />
        <div className="flex-1">
          <p className="text-sm">Le clustering nécessite ta clé API Anthropic.</p>
          <Link to="/settings" className="text-xs text-accent hover:text-accent-hover">
            Configurer dans les réglages →
          </Link>
        </div>
      </Card>
    );
  }
  if (kwCount === null) {
    return (
      <Card>
        <Loader2 size={18} className="animate-spin text-text-muted" />
        <span className="text-sm text-text-muted">Chargement…</span>
      </Card>
    );
  }
  if (kwCount === 0) {
    return (
      <Card>
        <AlertCircle size={18} className="text-text-secondary" />
        <span className="text-sm text-text-secondary">
          Importe au moins un CSV pour pouvoir clusteriser.
        </span>
      </Card>
    );
  }

  const estimate = estimateClusteringCost(kwCount, model);
  const hasExisting = (existingClusterCount ?? 0) > 0;

  return (
    <Card>
      <Sparkles size={18} className="text-accent" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-3">
          <p className="text-sm">
            <span className="font-mono">{kwCount}</span> mots-clés uniques à clusteriser
          </p>
          <span className="font-mono text-xs text-text-muted">
            estimé ~{formatUSD(estimate.usd)} · {model}
          </span>
        </div>
        <StatusLine status={status} result={result} error={error} />
      </div>
      <SplitButton
        onPrimary={() => run(false)}
        onForce={() => run(true)}
        onClearCache={clearCache}
        status={status}
        hasExisting={hasExisting}
      />
    </Card>
  );
}

// ============================================================================
// Split button (primary action + dropdown menu)
// ============================================================================

function SplitButton({
  onPrimary,
  onForce,
  onClearCache,
  status,
  hasExisting,
  size = 'normal',
}: {
  onPrimary: () => void;
  onForce: () => void;
  onClearCache: () => void;
  status: 'idle' | 'running' | 'error' | 'done';
  hasExisting: boolean;
  size?: 'normal' | 'small';
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [open]);

  const small = size === 'small';
  const Icon = status === 'running'
    ? Loader2
    : hasExisting ? RefreshCw : Sparkles;
  const primaryLabel = status === 'running'
    ? 'Clustering…'
    : hasExisting ? 'Re-cluster' : 'Lancer le clustering';

  return (
    <div ref={wrapperRef} className="relative inline-flex">
      <button
        type="button"
        onClick={onPrimary}
        disabled={status === 'running'}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-l-md border-r border-r-white/15 bg-accent font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50',
          small ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm',
        )}
      >
        <Icon size={small ? 12 : 14} className={status === 'running' ? 'animate-spin' : ''} />
        {primaryLabel}
      </button>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={status === 'running'}
        className={cn(
          'inline-flex items-center rounded-r-md bg-accent text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50',
          small ? 'px-1.5 py-1' : 'px-2 py-1.5',
        )}
        aria-label="Plus d'options"
      >
        <ChevronDown size={small ? 12 : 14} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 min-w-[260px] rounded-lg border border-border-subtle bg-bg-surface p-1 shadow-2xl">
          <MenuItem
            onClick={() => {
              setOpen(false);
              onForce();
            }}
            icon={<Zap size={12} className="text-amber-400" />}
            label="Force re-cluster"
            sub="Ignore le cache, relance Claude (coût)"
          />
          <MenuItem
            onClick={() => {
              setOpen(false);
              onClearCache();
            }}
            icon={<Trash2 size={12} className="text-red-400" />}
            label="Vider le cache de ce projet"
            sub="Le prochain clustering rappellera Claude"
          />
        </div>
      )}
    </div>
  );
}

function MenuItem({
  onClick,
  icon,
  label,
  sub,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  sub: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-start gap-2.5 rounded-md p-2 text-left hover:bg-bg-elevated"
    >
      <span className="mt-0.5">{icon}</span>
      <div className="flex-1">
        <p className="text-xs font-medium text-text-primary">{label}</p>
        <p className="mt-0.5 text-[10px] text-text-muted">{sub}</p>
      </div>
    </button>
  );
}

// ============================================================================
// Status line
// ============================================================================

function StatusLine({
  status,
  result,
  error,
}: {
  status: 'idle' | 'running' | 'error' | 'done';
  result: ClusterRunResult | null;
  error: string | null;
}) {
  if (status === 'running') {
    return (
      <p className="mt-1 text-xs text-text-secondary">Appel Claude en cours… (5–60 s)</p>
    );
  }
  if (status === 'done' && result) {
    return (
      <p className="mt-1 flex items-center gap-1.5 text-xs text-green-400">
        <Check size={12} />
        {result.clusterCount} clusters · {result.persistedAssignments} assignations
        {result.fromCache
          ? ' · depuis le cache'
          : result.usage
            ? ` · coût ${formatUSD(result.usage.usd)}`
            : ''}
        {result.unmatchedCount > 0 && ` · ${result.unmatchedCount} non clusterisés`}
      </p>
    );
  }
  if (status === 'error' && error) {
    return (
      <p className="mt-1 flex items-start gap-1.5 text-xs text-red-400">
        <AlertCircle size={12} className="mt-0.5 shrink-0" />
        <span>
          {error}
          <span className="ml-1 text-text-muted">
            (logs détaillés en console — F12)
          </span>
        </span>
      </p>
    );
  }
  return null;
}

// ============================================================================
// Compact (header)
// ============================================================================

function CompactView({
  apiKey,
  kwCount,
  model,
  status,
  result,
  error,
  hasExisting,
  onRun,
  onForceRun,
  onClearCache,
}: {
  apiKey: string | null;
  kwCount: number | null;
  model: string;
  status: 'idle' | 'running' | 'error' | 'done';
  result: ClusterRunResult | null;
  error: string | null;
  hasExisting: boolean;
  onRun: () => void;
  onForceRun: () => void;
  onClearCache: () => void;
}) {
  if (!apiKey) {
    return (
      <Link
        to="/settings"
        className="inline-flex items-center gap-1.5 rounded-md border border-border-subtle bg-bg-surface px-3 py-1.5 text-xs text-text-secondary hover:border-border-strong hover:text-text-primary"
      >
        <KeyRound size={12} />
        Configurer la clé API
      </Link>
    );
  }
  const cost =
    kwCount !== null ? formatUSD(estimateClusteringCost(kwCount, model).usd) : '…';
  return (
    <div className="flex items-center gap-2">
      {status === 'done' && result && (
        <span
          className="hidden text-xs text-green-400 sm:inline"
          title={`${result.persistedAssignments} assignations${result.fromCache ? ' (cache)' : ''}`}
        >
          {result.clusterCount} clusters{result.fromCache ? ' (cache)' : ''}
        </span>
      )}
      {status === 'error' && error && (
        <span className="hidden max-w-xs truncate text-xs text-red-400 sm:inline" title={error}>
          {error}
        </span>
      )}
      <SplitButton
        onPrimary={onRun}
        onForce={onForceRun}
        onClearCache={onClearCache}
        status={status}
        hasExisting={hasExisting}
        size="small"
      />
      <span className="hidden font-mono text-[10px] text-text-muted xl:inline" title={`${kwCount} KWs uniques · ${model}`}>
        ~{cost}
      </span>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border-subtle bg-bg-surface p-4">
      {children}
    </div>
  );
}
