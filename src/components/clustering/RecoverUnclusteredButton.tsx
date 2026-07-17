import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Wand2, Loader2, Check, AlertCircle, X } from 'lucide-react';
import { db } from '@/lib/db';
import { recoverUnclustered, type RecoverReport } from '@/lib/clustering';
import { cn } from '@/lib/utils';

interface Props {
  projectId: string;
}

const UNCLUSTERED_LABEL = 'non clusterisé';

// Presets de seuil de confiance. Plus bas = récupère plus (au risque de
// quelques classements approximatifs). Cf. recover.ts pour la calibration.
const PRESETS = [
  { key: 'safe', label: 'Prudent', minScore: 0.35 },
  { key: 'normal', label: 'Normal', minScore: 0.2 },
  { key: 'aggressive', label: 'Agressif', minScore: 0.1 },
] as const;

export function RecoverUnclusteredButton({ projectId }: Props) {
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState<(typeof PRESETS)[number]['key']>('normal');
  const [status, setStatus] = useState<'idle' | 'previewing' | 'applying' | 'done' | 'error'>(
    'idle',
  );
  const [report, setReport] = useState<RecoverReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progressMsg, setProgressMsg] = useState<string>('');

  // Nombre d'orphelins (cluster "Non clusterisé" + clusterId null) — via Dexie,
  // se met à jour tout seul après une récupération.
  const orphanCount = useLiveQuery(async () => {
    const [clusters, keywords] = await Promise.all([
      db.clusters.where('projectId').equals(projectId).toArray(),
      db.keywords.where('projectId').equals(projectId).toArray(),
    ]);
    const unclusteredIds = new Set(
      clusters.filter((c) => c.name.trim().toLowerCase() === UNCLUSTERED_LABEL).map((c) => c.id),
    );
    // Dédup par texte (les KWs sont flat 1×source).
    const seen = new Set<string>();
    let count = 0;
    for (const k of keywords) {
      const isOrphan = k.clusterId === null || unclusteredIds.has(k.clusterId);
      if (!isOrphan) continue;
      const key = k.keyword.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      count++;
    }
    return count;
  }, [projectId]);

  const minScore = PRESETS.find((p) => p.key === preset)!.minScore;

  const runPreview = async (nextPreset = preset) => {
    setStatus('previewing');
    setError(null);
    setReport(null);
    try {
      const ms = PRESETS.find((p) => p.key === nextPreset)!.minScore;
      const r = await recoverUnclustered(projectId, {
        apply: false,
        minScore: ms,
        onProgress: setProgressMsg,
      });
      setReport(r);
      setStatus('idle');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue');
      setStatus('error');
    }
  };

  const apply = async () => {
    setStatus('applying');
    setError(null);
    try {
      const r = await recoverUnclustered(projectId, {
        apply: true,
        minScore,
        onProgress: setProgressMsg,
      });
      setReport(r);
      setStatus('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue');
      setStatus('error');
    }
  };

  const openModal = () => {
    setOpen(true);
    setStatus('idle');
    setReport(null);
    setError(null);
    runPreview();
  };

  const close = () => {
    setOpen(false);
    setStatus('idle');
    setReport(null);
    setError(null);
  };

  if (!orphanCount || orphanCount === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="glass-pill inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary"
        title="Re-classer les mots-clés « Non clusterisé » dans les clusters existants — sans appel Claude, gratuit"
      >
        <Wand2 size={12} className="text-accent" />
        Récupérer {orphanCount.toLocaleString('fr-FR')} orphelins
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="glass-strong w-full max-w-lg rounded-2xl p-5">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                  <Wand2 size={15} className="text-accent" />
                  Récupérer les non-clusterisés
                </h2>
                <p className="mt-1 text-xs text-text-muted">
                  Re-classe les orphelins dans les clusters existants par similarité.
                  100 % local — aucun appel Claude, aucun coût.
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                className="text-text-muted hover:text-text-primary"
                aria-label="Fermer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Sélecteur de seuil */}
            <div className="mb-3 flex items-center gap-2">
              <span className="text-[11px] text-text-muted">Confiance :</span>
              {PRESETS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  disabled={status === 'previewing' || status === 'applying'}
                  onClick={() => {
                    setPreset(p.key);
                    runPreview(p.key);
                  }}
                  className={cn(
                    'rounded-full px-2.5 py-1 text-[11px] transition-colors disabled:opacity-50',
                    preset === p.key
                      ? 'bg-accent text-white'
                      : 'bg-bg-elevated text-text-secondary hover:text-text-primary',
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {(status === 'previewing' || status === 'applying') && (
              <div className="flex items-center gap-2 py-6 text-sm text-text-secondary">
                <Loader2 size={16} className="animate-spin" />
                {progressMsg || (status === 'applying' ? 'Application…' : 'Analyse…')}
              </div>
            )}

            {status === 'error' && error && (
              <div className="flex items-start gap-2 rounded-lg bg-red-500/10 p-3 text-xs text-red-300">
                <AlertCircle size={14} className="mt-0.5 shrink-0" />
                {error}
              </div>
            )}

            {report && (status === 'idle' || status === 'done') && (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <Stat value={report.totalOrphans} label="orphelins" />
                  <Stat value={report.recovered} label="récupérables" tone="green" />
                  <Stat value={report.remaining} label="resteront isolés" tone="muted" />
                </div>

                {report.perCluster.length > 0 && (
                  <div>
                    <p className="mb-1 text-[11px] font-medium text-text-secondary">
                      Répartition vers les clusters :
                    </p>
                    <div className="max-h-28 overflow-y-auto rounded-lg border border-border-subtle">
                      {report.perCluster.slice(0, 12).map((c) => (
                        <div
                          key={c.clusterId}
                          className="flex items-center justify-between border-b border-border-subtle/50 px-2.5 py-1 text-[11px] last:border-0"
                        >
                          <span className="truncate text-text-primary">{c.name}</span>
                          <span className="ml-2 shrink-0 font-mono text-text-muted">
                            +{c.count}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {report.samples.length > 0 && status === 'idle' && (
                  <div>
                    <p className="mb-1 text-[11px] font-medium text-text-secondary">
                      Exemples d’affectation :
                    </p>
                    <div className="max-h-32 overflow-y-auto rounded-lg border border-border-subtle">
                      {report.samples.map((a) => (
                        <div
                          key={a.keywordId}
                          className="flex items-center justify-between gap-2 border-b border-border-subtle/50 px-2.5 py-1 text-[11px] last:border-0"
                        >
                          <span className="truncate text-text-secondary">{a.keyword}</span>
                          <span className="shrink-0 text-text-muted">→ {a.clusterName}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {status === 'done' && report.applied && (
                  <div className="flex items-center gap-2 rounded-lg bg-green-500/10 p-3 text-xs text-green-300">
                    <Check size={14} className="shrink-0" />
                    {report.recovered.toLocaleString('fr-FR')} mots-clés récupérés et rangés.
                    {report.remaining > 0 &&
                      ` ${report.remaining.toLocaleString('fr-FR')} restent isolés (aucun cluster proche).`}
                  </div>
                )}
              </div>
            )}

            <div className="mt-4 flex justify-end gap-2">
              {status === 'done' ? (
                <button
                  type="button"
                  onClick={close}
                  className="btn-primary-glow rounded-full px-4 py-2 text-sm font-medium text-white"
                >
                  Terminé
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={close}
                    className="rounded-full px-4 py-2 text-sm text-text-secondary hover:text-text-primary"
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={apply}
                    disabled={
                      status === 'previewing' ||
                      status === 'applying' ||
                      !report ||
                      report.recovered === 0
                    }
                    className="btn-primary-glow inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {status === 'applying' ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Wand2 size={14} />
                    )}
                    Récupérer {report?.recovered ?? 0}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Stat({
  value,
  label,
  tone = 'default',
}: {
  value: number;
  label: string;
  tone?: 'default' | 'green' | 'muted';
}) {
  return (
    <div className="rounded-lg bg-bg-elevated px-2 py-2">
      <p
        className={cn(
          'font-mono text-lg font-semibold',
          tone === 'green' && 'text-green-400',
          tone === 'muted' && 'text-text-muted',
          tone === 'default' && 'text-text-primary',
        )}
      >
        {value.toLocaleString('fr-FR')}
      </p>
      <p className="text-[10px] text-text-muted">{label}</p>
    </div>
  );
}
