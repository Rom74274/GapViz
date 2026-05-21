import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Minus, ArrowLeft, Loader2, CreditCard } from 'lucide-react';
import { PLAN_LABELS, PLAN_LIMITS } from '@/lib/plans';
import type { UserPlan } from '@/lib/supabaseTypes';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

const PLAN_ORDER: UserPlan[] = ['free', 'pro', 'agency'];

const PLAN_BLURB: Record<UserPlan, string> = {
  free: 'Pour tester l\'outil sur un projet.',
  pro: 'Pour les SEO indépendants qui jonglent avec plusieurs sites.',
  agency: 'Pour les agences qui gèrent un portefeuille de clients.',
};

const PLAN_PRICE: Record<UserPlan, string> = {
  free: '0€',
  pro: '19€',
  agency: '79€',
};

// On affiche les limites sous forme lisible pour humains.
function describeLimit(value: number | null, unit: string): string {
  if (value === null) return 'Illimité';
  return `${value.toLocaleString('fr-FR')} ${unit}`;
}

export function PricingPage() {
  const { profile, status } = useAuth();
  const currentPlan: UserPlan = profile?.plan ?? 'free';
  const isAuth = status === 'authenticated';
  const [loadingPlan, setLoadingPlan] = useState<UserPlan | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startCheckout = async (plan: UserPlan) => {
    setLoadingPlan(plan);
    setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke(
        'create-checkout-session',
        { body: { plan } },
      );
      if (fnErr) throw fnErr;
      const url = (data as { url?: string })?.url;
      if (!url) throw new Error('Pas d\'URL Stripe reçue');
      window.location.href = url;
    } catch (e) {
      console.error('[pricing] checkout error', e);
      setError(e instanceof Error ? e.message : 'Erreur checkout');
      setLoadingPlan(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-10">
        {isAuth && (
          <Link
            to="/projects"
            className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary"
          >
            <ArrowLeft size={12} />
            Retour
          </Link>
        )}
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Plans Star Gap</h1>
        <p className="mt-2 max-w-2xl text-sm text-text-secondary">
          Le clustering, le graph et les exports — tout dépend de la taille de tes
          projets. Choisis le plan adapté à ton volume.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {PLAN_ORDER.map((plan) => {
          const limits = PLAN_LIMITS[plan];
          const isCurrent = plan === currentPlan;
          const isUpgrade =
            PLAN_ORDER.indexOf(plan) > PLAN_ORDER.indexOf(currentPlan);

          return (
            <article
              key={plan}
              className={cn(
                'flex flex-col rounded-xl border bg-bg-surface p-6 transition-colors',
                isCurrent
                  ? 'border-accent/50 shadow-lg shadow-accent/10'
                  : 'border-border-subtle hover:border-border-strong',
              )}
            >
              <header className="flex items-baseline justify-between gap-3">
                <h2 className="text-xl font-semibold tracking-tight">
                  {PLAN_LABELS[plan]}
                </h2>
                {isCurrent && (
                  <span className="rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-accent">
                    Actuel
                  </span>
                )}
              </header>

              <p className="mt-2 text-xs text-text-secondary">{PLAN_BLURB[plan]}</p>

              <p className="mt-5 font-mono text-2xl font-semibold">
                {PLAN_PRICE[plan]}
                {plan !== 'free' && PLAN_PRICE[plan] !== 'Contact' && (
                  <span className="text-sm font-normal text-text-muted">/mois</span>
                )}
              </p>

              <ul className="mt-6 space-y-2 text-sm">
                <Feature
                  label="Projets"
                  value={describeLimit(limits.maxProjects, '')}
                  on
                />
                <Feature
                  label="Mots-clés par projet"
                  value={describeLimit(limits.maxKeywordsPerProject, '')}
                  on
                />
                <Feature
                  label="Concurrents par projet"
                  value={describeLimit(limits.maxCompetitorsPerProject, '')}
                  on
                />
                <Feature
                  label="Clusterings managés / mois"
                  value={
                    limits.maxClusteringsPerMonth === null
                      ? 'Illimité'
                      : `${limits.maxClusteringsPerMonth}`
                  }
                  hint="Illimité avec ta propre clé Claude"
                  on
                />
                <Feature label="Export CSV" value={limits.csvExport ? 'Oui' : 'Non'} on={limits.csvExport} />
                <Feature
                  label="Vue tableau complète"
                  value={limits.tableRowsVisible === null ? 'Oui' : `${limits.tableRowsVisible} lignes visibles`}
                  on={limits.tableRowsVisible === null}
                />
                <Feature label="Sans watermark" value={limits.watermark ? 'Non' : 'Oui'} on={!limits.watermark} />
                <Feature label="BYOK Claude API" value="Oui" on />
              </ul>

              <div className="mt-6 flex-1" />

              {isCurrent ? (
                <button
                  type="button"
                  disabled
                  className="mt-4 inline-flex items-center justify-center rounded-md border border-border-subtle bg-bg-elevated px-3 py-2 text-sm text-text-muted"
                >
                  Plan actuel
                </button>
              ) : isUpgrade ? (
                <button
                  type="button"
                  onClick={() => startCheckout(plan)}
                  disabled={loadingPlan !== null}
                  className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loadingPlan === plan ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <CreditCard size={14} />
                  )}
                  {loadingPlan === plan ? 'Redirection…' : `Passer au ${PLAN_LABELS[plan]}`}
                </button>
              ) : (
                <span className="mt-4 inline-flex items-center justify-center rounded-md border border-border-subtle px-3 py-2 text-xs text-text-muted">
                  Inférieur à ton plan actuel
                </span>
              )}
            </article>
          );
        })}
      </div>

      {error && (
        <p className="mt-4 rounded-md border border-red-400/40 bg-red-400/10 px-3 py-2 text-xs text-red-300">
          {error}
        </p>
      )}

      <footer className="mt-8 text-xs text-text-muted">
        Paiement sécurisé par Stripe. Tu peux annuler à tout moment depuis les réglages.
      </footer>
    </div>
  );
}

function Feature({
  label,
  value,
  hint,
  on,
}: {
  label: string;
  value: string;
  hint?: string;
  on: boolean;
}) {
  return (
    <li className="flex items-start gap-2">
      <span
        className={cn(
          'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full',
          on ? 'bg-green-500/15 text-green-400' : 'bg-bg-elevated text-text-muted',
        )}
      >
        {on ? <Check size={10} /> : <Minus size={10} />}
      </span>
      <div className="min-w-0">
        <p className="text-text-primary">
          <span className="text-text-secondary">{label} :</span>{' '}
          <span className="font-medium">{value}</span>
        </p>
        {hint && <p className="text-[10px] text-text-muted">{hint}</p>}
      </div>
    </li>
  );
}
