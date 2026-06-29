import { useEffect, useRef, useState } from 'react';
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
  Cloud,
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
  CHUNK_THRESHOLD,
  type ClusterRunResult,
  type ClusterRunProgress,
} from '@/lib/clustering';
import { runManagedClustering, ManagedClusteringError } from '@/lib/dataLayer';
import { useAuth } from '@/hooks/useAuth';
import { checkRunClustering, PLAN_LIMITS, type LimitResult } from '@/lib/plans';
import type { UserPlan } from '@/lib/supabaseTypes';
import { UpgradeModal } from '@/components/UpgradeModal';
import { cn } from '@/lib/utils';

interface Props {
  projectId: string;
  variant?: 'card' | 'compact';
}

export function RunClusteringButton({ projectId, variant = 'card' }: Props) {
  const apiKey = useSettings((s) => s.apiKey);
  const model = useSettings((s) => s.model);
  const { profile } = useAuth();
  const plan: UserPlan = profile?.plan ?? 'free';

  const existingClusterCount = useLiveQuery(
    () => db.clusters.where('projectId').equals(projectId).count(),
    [projectId],
  );

  const [kwCount, setKwCount] = useState<number | null>(null);
  const [status, setStatus] = useState<'idle' | 'running' | 'error' | 'done'>('idle');
  const [result, setResult] = useState<ClusterRunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ClusterRunProgress | null>(null);
  const [upgradeResult, setUpgradeResult] = useState<LimitResult | null>(null);

  useEffect(() => {
    uniqueKeywordCount(projectId).then(setKwCount);
  }, [projectId, existingClusterCount]);

  const run = async (force: boolean) => {
    // Pre-check : la gate vérifie quota managé si pas de BYOK.
    const gate = checkRunClustering(plan, !!apiKey, profile?.clusterings_used ?? 0);
    if (!gate.allowed) {
      setUpgradeResult(gate);
      return;
    }
    setStatus('running');
    setError(null);
    setProgress(null);
    try {
      if (apiKey) {
        // BYOK : appel Claude direct depuis le browser. Pas d'increment
        // compteur (user paie sa propre clé).
        const r = await runClustering(projectId, {
          apiKey,
          model,
          force,
          onProgress: (p) => setProgress(p),
        });
        setResult(r);
      } else {
        // Managé : Edge Function. Gate + Claude + save + increment côté
        // serveur. Pas de progress streaming pour l'instant.
        const r = await runManagedClustering(projectId);
        setResult(r);
      }
      setStatus('done');
    } catch (e) {
      if (e instanceof ManagedClusteringError && e.code === 'quota_exceeded') {
        // Course rare : le serveur a vu le quota épuisé après notre check
        // local. On ouvre l'UpgradeModal avec le détail serveur.
        setUpgradeResult({
          allowed: false,
          reason: 'max_clusterings',
          limit: e.payload.limit,
          current: e.payload.used,
          message: e.message,
        });
        setStatus('idle');
      } else {
        setError(e instanceof Error ? e.message : 'Erreur inconnue');
        setStatus('error');
      }
    } finally {
      setProgress(null);
    }
  };

  const clearCache = async () => {
    const count = await clearProjectClusterCache(projectId);
    setError(null);
    setStatus('idle');
    setResult(null);
    alert(`${count} entrée(s) de cache effacée(s) pour ce projet.`);
  };

  // Modèle effectif : si BYOK, celui choisi dans Settings ; sinon, le
  // modèle managé selon le plan (Haiku Free / Sonnet Pro+Agency).
  const managedModel = PLAN_LIMITS[plan].managedModel;
  const effectiveModel = apiKey ? model : managedModel;
  const isManaged = !apiKey;

  if (variant === 'compact') {
    return (
      <>
        <CompactView
          apiKey={apiKey}
          kwCount={kwCount}
          model={effectiveModel}
          isManaged={isManaged}
          status={status}
          result={result}
          error={error}
          progress={progress}
          hasExisting={(existingClusterCount ?? 0) > 0}
          onRun={() => run(false)}
          onForceRun={() => run(true)}
          onClearCache={clearCache}
        />
        <UpgradeModal
          open={upgradeResult !== null}
          onClose={() => setUpgradeResult(null)}
          result={upgradeResult}
          currentPlan={plan}
        />
      </>
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

  const estimate = isManaged ? null : estimateClusteringCost(kwCount, effectiveModel);
  const hasExisting = (existingClusterCount ?? 0) > 0;

  return (
    <>
      <Card>
        <Sparkles size={18} className="text-accent" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-3">
            <p className="text-sm">
              <span className="font-mono">{kwCount}</span> mots-clés uniques à clusteriser
            </p>
            <span className="font-mono text-xs text-text-muted">
              {isManaged ? (
                <>
                  <Cloud size={11} className="-mt-0.5 mr-1 inline text-accent" />
                  managé · {effectiveModel}
                </>
              ) : estimate ? (
                <>
                  <KeyRound size={11} className="-mt-0.5 mr-1 inline" />
                  BYOK · estimé ~{formatUSD(estimate.usd)} · {effectiveModel}
                  {estimate.chunks > 1 && (
                    <span className="ml-1.5 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-300">
                      chunked · {estimate.chunks} appels
                    </span>
                  )}
                </>
              ) : null}
            </span>
          </div>
          <StatusLine status={status} result={result} error={error} progress={progress} />
        </div>
        <SplitButton
          onPrimary={() => run(false)}
          onForce={() => run(true)}
          onClearCache={clearCache}
          status={status}
          hasExisting={hasExisting}
          // Force re-cluster + clear cache n'ont pas de sens en managé (pas
          // de cache côté serveur, et chaque appel coûte). On masque le
          // menu dropdown.
          showSecondary={!isManaged}
        />
      </Card>
      <UpgradeModal
        open={upgradeResult !== null}
        onClose={() => setUpgradeResult(null)}
        result={upgradeResult}
        currentPlan={plan}
      />
    </>
  );
}

// ============================================================================
// Split button
// ============================================================================

function SplitButton({
  onPrimary,
  onForce,
  onClearCache,
  status,
  hasExisting,
  size = 'normal',
  showSecondary = true,
}: {
  onPrimary: () => void;
  onForce: () => void;
  onClearCache: () => void;
  status: 'idle' | 'running' | 'error' | 'done';
  hasExisting: boolean;
  size?: 'normal' | 'small';
  showSecondary?: boolean;
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
  const Icon = status === 'running' ? Loader2 : hasExisting ? RefreshCw : Sparkles;
  const primaryLabel =
    status === 'running'
      ? 'Clustering…'
      : hasExisting
        ? 'Re-cluster'
        : 'Lancer le clustering';

  return (
    <div ref={wrapperRef} className="relative inline-flex">
      <button
        type="button"
        onClick={onPrimary}
        disabled={status === 'running'}
        className={cn(
          'btn-primary-glow inline-flex items-center gap-1.5 font-medium text-white disabled:cursor-not-allowed disabled:opacity-50',
          showSecondary
            ? 'rounded-l-full border-r border-r-white/15'
            : 'rounded-full',
          small ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm',
        )}
      >
        <Icon size={small ? 12 : 14} className={status === 'running' ? 'animate-spin' : ''} />
        {primaryLabel}
      </button>
      {showSecondary && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          disabled={status === 'running'}
          className={cn(
            'btn-primary-glow inline-flex items-center rounded-r-full text-white disabled:cursor-not-allowed disabled:opacity-50',
            small ? 'px-2 py-1.5' : 'px-2.5 py-2',
          )}
          aria-label="Plus d'options"
        >
          <ChevronDown size={small ? 12 : 14} />
        </button>
      )}
      {open && showSecondary && (
        <div className="glass-strong absolute right-0 top-full z-30 mt-1.5 min-w-[260px] rounded-xl p-1">
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
// Status line + progress bar
// ============================================================================

function StatusLine({
  status,
  result,
  error,
  progress,
}: {
  status: 'idle' | 'running' | 'error' | 'done';
  result: ClusterRunResult | null;
  error: string | null;
  progress: ClusterRunProgress | null;
}) {
  if (status === 'running') {
    if (progress && progress.totalChunks > 1) {
      const pct = Math.round((progress.kwsDone / Math.max(1, progress.kwsTotal)) * 100);
      return (
        <div className="mt-1.5">
          <div className="flex items-center justify-between text-[11px] text-text-secondary">
            <span>
              Chunk <span className="font-mono text-text-primary">{progress.chunk}/{progress.totalChunks}</span>
              <span className="text-text-muted">
                {' '}· {progress.kwsDone.toLocaleString('fr-FR')} / {progress.kwsTotal.toLocaleString('fr-FR')} KWs
              </span>
            </span>
            <span className="font-mono text-text-muted">{pct}%</span>
          </div>
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-bg-elevated">
            <div
              className="h-full bg-accent transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      );
    }
    return (
      <p className="mt-1 text-xs text-text-secondary">Appel Claude en cours… (5–60 s)</p>
    );
  }
  if (status === 'done' && result) {
    return (
      <p className="mt-1 flex items-center gap-1.5 text-xs text-green-400">
        <Check size={12} />
        {result.clusterCount} clusters · {result.persistedAssignments} assignations
        {result.totalChunks > 1 && ` · ${result.totalChunks} chunks`}
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
          <span className="ml-1 text-text-muted">(logs détaillés en console — F12)</span>
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
  isManaged,
  status,
  result,
  error,
  progress,
  hasExisting,
  onRun,
  onForceRun,
  onClearCache,
}: {
  apiKey: string | null;
  kwCount: number | null;
  model: string;
  isManaged: boolean;
  status: 'idle' | 'running' | 'error' | 'done';
  result: ClusterRunResult | null;
  error: string | null;
  progress: ClusterRunProgress | null;
  hasExisting: boolean;
  onRun: () => void;
  onForceRun: () => void;
  onClearCache: () => void;
}) {
  void apiKey; // gardé pour signature mais non utilisé désormais
  const cost =
    !isManaged && kwCount !== null
      ? formatUSD(estimateClusteringCost(kwCount, model).usd)
      : null;
  const willChunk = kwCount !== null && kwCount > CHUNK_THRESHOLD;
  return (
    <div className="flex items-center gap-2">
      {status === 'running' && progress && progress.totalChunks > 1 && (
        <span className="hidden text-xs text-text-secondary sm:inline">
          chunk <span className="font-mono text-text-primary">{progress.chunk}/{progress.totalChunks}</span>
          <span className="text-text-muted">
            {' '}· {progress.kwsDone}/{progress.kwsTotal} KWs
          </span>
        </span>
      )}
      {status === 'done' && result && (
        <span
          className="hidden text-xs text-green-400 sm:inline"
          title={`${result.persistedAssignments} assignations${result.totalChunks > 1 ? ` · ${result.totalChunks} chunks` : ''}${result.fromCache ? ' · cache' : ''}`}
        >
          {result.clusterCount} clusters{result.fromCache ? ' (cache)' : ''}
        </span>
      )}
      {status === 'error' && error && (
        <span
          className="hidden max-w-xs truncate text-xs text-red-400 sm:inline"
          title={error}
        >
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
        showSecondary={!isManaged}
      />
      <span
        className="hidden font-mono text-[10px] text-text-muted xl:inline"
        title={`${kwCount ?? '?'} KWs uniques · ${model}${willChunk ? ' · chunked' : ''}${isManaged ? ' · managé' : ' · BYOK'}`}
      >
        {isManaged ? (
          <>
            <Cloud size={9} className="-mt-0.5 mr-0.5 inline text-accent" />
            managé
          </>
        ) : (
          <>~{cost}</>
        )}
        {willChunk && !isManaged && (
          <span className="ml-1 rounded-full bg-amber-500/15 px-1 py-0.5 text-amber-300">
            chunked
          </span>
        )}
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
