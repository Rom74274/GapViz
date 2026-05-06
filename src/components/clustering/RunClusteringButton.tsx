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

interface Props {
  projectId: string;
}

export function RunClusteringButton({ projectId }: Props) {
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
  }, [projectId]);

  if (!apiKey) {
    return (
      <Card>
        <KeyRound size={18} className="text-text-secondary" />
        <div className="flex-1">
          <p className="text-sm">
            Le clustering nécessite ta clé API Anthropic.
          </p>
          <Link
            to="/settings"
            className="text-xs text-accent hover:text-accent-hover"
          >
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
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-3 flex-wrap">
          <p className="text-sm">
            <span className="font-mono">{kwCount}</span> mots-clés uniques à clusteriser
          </p>
          <span className="text-xs font-mono text-text-muted">
            estimé ~{formatUSD(estimate.usd)} · {model}
          </span>
        </div>
        {status === 'running' && (
          <p className="mt-1 text-xs text-text-secondary">
            Appel Claude en cours… (5–60 s selon la taille)
          </p>
        )}
        {status === 'done' && result && (
          <p className="mt-1 flex items-center gap-1.5 text-xs text-green-400">
            <Check size={12} />
            {result.clusterCount} clusters créés
            {result.fromCache ? ' (depuis le cache, gratuit)' : result.usage ? ` · coût réel ${formatUSD(result.usage.usd)}` : ''}
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
        {status === 'running'
          ? 'Clustering…'
          : hasExisting
            ? 'Re-cluster'
            : 'Lancer le clustering'}
      </button>
    </Card>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border-subtle bg-bg-surface p-4">
      {children}
    </div>
  );
}
