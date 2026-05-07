import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, Loader2, AlertCircle, KeyRound, RefreshCw, Check } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useSettings } from '@/lib/store';
import { db } from '@/lib/db';
import {
  runClustering,
  estimateClusteringCost,
  formatUSD,
  uniqueKeywordCount,
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
        onRun={async () => {
          if (!apiKey) return;
          setStatus('running');
          setError(null);
          try {
            const r = await runClustering(projectId, { apiKey, model });
            setResult(r);
            setStatus('done');
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Erreur inconnue');
            setStatus('error');
          }
        }}
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
  const onRun = async () => {
    setStatus('running');
    setError(null);
    try {
      const r = await runClustering(projectId, { apiKey, model });
      setResult(r);
      setStatus('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
      setStatus('error');
    }
  };

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
        {status === 'running' && (
          <p className="mt-1 text-xs text-text-secondary">
            Appel Claude en cours… (5–60 s)
          </p>
        )}
        {status === 'done' && result && (
          <p className="mt-1 flex items-center gap-1.5 text-xs text-green-400">
            <Check size={12} />
            {result.clusterCount} clusters
            {result.fromCache
              ? ' (depuis le cache, gratuit)'
              : result.usage
                ? ` · coût réel ${formatUSD(result.usage.usd)}`
                : ''}
            {result.unmatchedCount > 0 && ` · ${result.unmatchedCount} non clusterisés`}
          </p>
        )}
        {status === 'error' && error && (
          <p className="mt-1 flex items-start gap-1.5 text-xs text-red-400">
            <AlertCircle size={12} className="mt-0.5 shrink-0" />
            {error}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onRun}
        disabled={status === 'running'}
        className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        {status === 'running' ? (
          <Loader2 size={14} className="animate-spin" />
        ) : hasExisting ? (
          <RefreshCw size={14} />
        ) : (
          <Sparkles size={14} />
        )}
        {status === 'running' ? 'Clustering…' : hasExisting ? 'Re-cluster' : 'Lancer le clustering'}
      </button>
    </Card>
  );
}

function CompactView({
  apiKey,
  kwCount,
  model,
  status,
  result,
  error,
  hasExisting,
  onRun,
}: {
  apiKey: string | null;
  kwCount: number | null;
  model: string;
  status: 'idle' | 'running' | 'error' | 'done';
  result: ClusterRunResult | null;
  error: string | null;
  hasExisting: boolean;
  onRun: () => void;
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
  const tooltipBits: string[] = [];
  if (kwCount !== null) tooltipBits.push(`${kwCount} KWs uniques`);
  tooltipBits.push(`~${cost}`);
  tooltipBits.push(model);
  return (
    <div className="flex items-center gap-2">
      {status === 'done' && result && (
        <span className="hidden text-xs text-green-400 sm:inline">
          {result.clusterCount} clusters
          {result.fromCache ? ' (cache)' : ''}
        </span>
      )}
      {status === 'error' && error && (
        <span className="hidden max-w-xs truncate text-xs text-red-400 sm:inline" title={error}>
          {error}
        </span>
      )}
      <button
        type="button"
        onClick={onRun}
        disabled={status === 'running' || kwCount === 0}
        title={tooltipBits.join(' · ')}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
          hasExisting
            ? 'border border-border-subtle bg-bg-surface text-text-secondary hover:border-border-strong hover:text-text-primary'
            : 'bg-accent text-white hover:bg-accent-hover',
        )}
      >
        {status === 'running' ? (
          <Loader2 size={12} className="animate-spin" />
        ) : hasExisting ? (
          <RefreshCw size={12} />
        ) : (
          <Sparkles size={12} />
        )}
        {status === 'running' ? 'Clustering…' : hasExisting ? 'Re-cluster' : 'Cluster'}
      </button>
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
