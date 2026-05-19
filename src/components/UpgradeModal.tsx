import { X, Sparkles, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PLAN_LABELS, type LimitResult } from '@/lib/plans';
import type { UserPlan } from '@/lib/supabaseTypes';
import { cn } from '@/lib/utils';

interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
  // Résultat retourné par un checkX(plan, ...). Si null, le modal ne s'ouvre pas.
  result: LimitResult | null;
  currentPlan: UserPlan;
}

export function UpgradeModal({ open, onClose, result, currentPlan }: UpgradeModalProps) {
  if (!open || !result || result.allowed) return null;

  const suggested = result.suggestedPlan;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md rounded-xl border border-border-subtle bg-bg-surface p-6 shadow-2xl"
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
            <Sparkles size={18} />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold tracking-tight">Limite atteinte</h2>
            <p className="mt-1 text-sm text-text-secondary">{result.message}</p>
            {typeof result.limit === 'number' && typeof result.current === 'number' && (
              <p className="mt-2 font-mono text-xs text-text-muted">
                Utilisé : <span className="text-text-primary">{result.current}</span> /{' '}
                <span className="text-text-primary">{result.limit}</span>
              </p>
            )}
          </div>
        </div>

        {suggested && (
          <div className="mt-5 rounded-lg border border-accent/30 bg-accent/5 p-3">
            <p className="text-xs uppercase tracking-wide text-accent/80">
              Plan recommandé
            </p>
            <p className="mt-0.5 text-lg font-semibold text-text-primary">
              {PLAN_LABELS[suggested]}
            </p>
          </div>
        )}

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border-subtle px-3 py-1.5 text-sm text-text-secondary hover:border-border-strong hover:text-text-primary"
          >
            Plus tard
          </button>
          <Link
            to="/pricing"
            onClick={onClose}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover',
              currentPlan === 'agency' && 'hidden',
            )}
          >
            Voir les plans
            <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </div>
  );
}
