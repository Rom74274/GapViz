import { useEffect, useRef, useState } from 'react';
import { ExternalLink, Loader2, Sparkles, X, Zap, AlertTriangle } from 'lucide-react';
import {
  createImportSession,
  buildAhrefsImportUrl,
  getImportSession,
  fetchProjectDetailFromSupabase,
  syncProjectToDexie,
} from '@/lib/dataLayer';
import { DomainAutocomplete } from '@/components/onboarding/DomainAutocomplete';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Modal "Ajouter un site depuis Ahrefs" — utilisé sur ProjectDetailPage pour
// importer les KWs d'un concurrent (ou rafraîchir ceux d'un site existant)
// via l'extension Chrome Star Gap.
//
// Diffère de NewProjectPage import : ici on passe existingProjectId à
// createImportSession → l'Edge Function merge dans le projet courant
// au lieu d'en créer un nouveau.
// ---------------------------------------------------------------------------

interface Props {
  projectId: string;
  open: boolean;
  onClose: () => void;
  // Callback déclenché après import réussi (le parent peut refresh sa data)
  onImportComplete?: () => void;
}

type Status = 'idle' | 'waiting' | 'completed' | 'failed' | 'expired';

export function AddSiteFromAhrefs({ projectId, open, onClose, onImportComplete }: Props) {
  const [domain, setDomain] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const pollAbortRef = useRef(false);

  // Reset au open/close.
  useEffect(() => {
    if (!open) {
      pollAbortRef.current = true;
      setDomain('');
      setToken(null);
      setStatus('idle');
      setError(null);
      setStarting(false);
    }
  }, [open]);

  // Polling sur le status quand token actif.
  useEffect(() => {
    if (!token) return;
    pollAbortRef.current = false;
    setStatus('waiting');
    const startedAt = Date.now();
    const MAX_DURATION = 10 * 60 * 1000;
    let done = false;

    const checkOnce = async (): Promise<boolean> => {
      if (done || pollAbortRef.current) return true;
      if (Date.now() - startedAt > MAX_DURATION) {
        done = true;
        setStatus('expired');
        setError("Délai dépassé. Relance l'import.");
        return true;
      }
      try {
        const session = await getImportSession(token);
        if (done || pollAbortRef.current) return true;
        if (!session) return false;
        if (session.status === 'completed') {
          done = true;
          setStatus('completed');
          // Re-fetch + sync Dexie pour que la page projet voie le nouveau site.
          const detail = await fetchProjectDetailFromSupabase(projectId);
          if (detail.ok) await syncProjectToDexie(detail.data);
          onImportComplete?.();
          // Auto-close 1.5s après succès.
          setTimeout(() => {
            if (!pollAbortRef.current) onClose();
          }, 1500);
          return true;
        }
        if (session.status === 'failed') {
          done = true;
          setStatus('failed');
          setError(session.error_message || "Échec de l'import");
          return true;
        }
        if (session.status === 'expired') {
          done = true;
          setStatus('expired');
          setError("Session expirée.");
          return true;
        }
        return false;
      } catch (e) {
        console.error('[add-site-poll] error', e);
        return false;
      }
    };

    const intervalId = window.setInterval(async () => {
      const finished = await checkOnce();
      if (finished) window.clearInterval(intervalId);
    }, 2000);

    const onVisible = () => {
      if (document.visibilityState === 'visible') checkOnce();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', checkOnce);

    checkOnce();

    return () => {
      pollAbortRef.current = true;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', checkOnce);
    };
  }, [token, projectId, onClose, onImportComplete]);

  const start = async () => {
    const cleanDomain = domain.trim().toLowerCase();
    if (!cleanDomain) {
      setError('Renseigne un domaine.');
      return;
    }
    setStarting(true);
    setError(null);
    try {
      const { token: newToken } = await createImportSession({
        domain: cleanDomain,
        source: 'ahrefs',
        existingProjectId: projectId,
      });
      setToken(newToken);
      const url = buildAhrefsImportUrl(cleanDomain, newToken);
      window.open(url, '_blank');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur création session');
    } finally {
      setStarting(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md rounded-xl border border-accent/30 bg-bg-surface p-6 shadow-2xl"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 rounded p-1 text-text-muted hover:bg-bg-elevated hover:text-text-primary"
          aria-label="Fermer"
        >
          <X size={16} />
        </button>

        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
            <Zap size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold tracking-tight">
              Ajouter un site depuis Ahrefs
            </h2>
            <p className="mt-1 text-xs text-text-secondary">
              Importe les mots-clés d'un concurrent dans ce projet. Si le domaine
              existe déjà, ses positions seront rafraîchies.
            </p>
          </div>
        </div>

        {status === 'idle' && (
          <div className="mt-5 space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs text-text-secondary">
                Domaine du site
              </span>
              <DomainAutocomplete
                value={domain}
                onChange={setDomain}
                placeholder="exemple.com"
              />
            </label>
            {error && (
              <p className="flex items-center gap-1.5 text-xs text-red-300">
                <AlertTriangle size={11} />
                {error}
              </p>
            )}
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-border-subtle px-3 py-1.5 text-xs text-text-muted hover:border-border-strong hover:text-text-secondary"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={start}
                disabled={starting || !domain.trim()}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover',
                  'disabled:cursor-not-allowed disabled:opacity-60',
                )}
              >
                {starting ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <ExternalLink size={14} />
                )}
                Ouvrir Ahrefs
              </button>
            </div>
          </div>
        )}

        {status === 'waiting' && (
          <div className="mt-5 rounded-md border border-accent/30 bg-bg-base p-3 text-xs">
            <p className="flex items-center gap-2 font-medium text-accent">
              <Loader2 size={12} className="animate-spin" />
              En attente du clic Export sur Ahrefs…
            </p>
            <p className="mt-1 text-text-secondary">
              Connecte-toi à Ahrefs si besoin, puis clique sur{' '}
              <strong className="text-text-primary">Export → CSV</strong>{' '}
              au-dessus de la table.
            </p>
          </div>
        )}

        {status === 'completed' && (
          <div className="mt-5 rounded-md border border-green-400/40 bg-green-400/5 p-3 text-xs">
            <p className="flex items-center gap-2 font-medium text-green-300">
              <Sparkles size={12} />
              Site ajouté avec succès !
            </p>
          </div>
        )}

        {(status === 'failed' || status === 'expired') && error && (
          <div className="mt-5 rounded-md border border-red-400/40 bg-red-400/5 p-3 text-xs">
            <p className="flex items-center gap-2 font-medium text-red-300">
              <AlertTriangle size={12} />
              {error}
            </p>
            <button
              type="button"
              onClick={() => {
                setStatus('idle');
                setError(null);
                setToken(null);
              }}
              className="mt-2 text-text-secondary hover:text-text-primary underline"
            >
              Réessayer
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
