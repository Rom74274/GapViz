import { useEffect, useState } from 'react';
import {
  Eye,
  EyeOff,
  Save,
  Trash2,
  Database,
  LogOut,
  User as UserIcon,
  Mail,
  Loader2,
  CloudUpload,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  Cloud,
  Zap,
  ChevronDown,
  Wrench,
  CreditCard,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useSettings } from '@/lib/store';
import { clearAllClusterCache, getCacheStats } from '@/lib/clustering';
import { useAuth } from '@/hooks/useAuth';
import { signOut } from '@/lib/authStore';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import {
  listMigratableProjects,
  migrateLocalProjectsToSupabase,
  type MigratableProject,
  type MigrationProgress,
  type MigrationResult,
} from '@/lib/dataLayer';
import { PLAN_LIMITS, PLAN_LABELS, shouldResetClusteringsCount } from '@/lib/plans';
import type { UserPlan } from '@/lib/supabaseTypes';

const ADVANCED_OPEN_LS_KEY = 'stargap-settings-advanced-open';

function useLocalStorageToggle(
  key: string,
  defaultValue: boolean,
): [boolean, (v: boolean) => void] {
  const [value, setValue] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored === null) return defaultValue;
      return stored === 'true';
    } catch {
      return defaultValue;
    }
  });
  const set = (v: boolean) => {
    setValue(v);
    try {
      localStorage.setItem(key, String(v));
    } catch {
      /* ignore — quota dépassé ou storage désactivé */
    }
  };
  return [value, set];
}

export function SettingsPage() {
  const apiKey = useSettings((s) => s.apiKey);
  const [advancedOpen, setAdvancedOpen] = useLocalStorageToggle(
    ADVANCED_OPEN_LS_KEY,
    false,
  );

  // Le CTA "Activer BYOK" dans ClusteringModeSection a besoin d'ouvrir la
  // section avancée si elle est fermée, puis de focus l'input BYOK. On lift
  // la logique ici pour avoir accès à advancedOpen.
  const requestActivateBYOK = () => {
    setAdvancedOpen(true);
    // Laisse React render le champ avant de tenter le focus.
    setTimeout(() => {
      document
        .querySelector<HTMLInputElement>('input[placeholder^="sk-ant"]')
        ?.focus();
    }, 60);
  };

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Réglages</h1>

      <AccountSection />

      <ClusteringModeSection
        hasOwnApiKey={Boolean(apiKey)}
        onActivateBYOK={requestActivateBYOK}
      />

      <MigrationSection />

      <OnboardingHelpSection />

      <AdvancedSection open={advancedOpen} onToggle={() => setAdvancedOpen(!advancedOpen)}>
        <BYOKSection />
        <ModelSection />
        <ClusterCacheSection />
      </AdvancedSection>
    </div>
  );
}

// ============================================================================
// Options avancées (collapsible, persisté en localStorage)
// ============================================================================

function AdvancedSection({
  open,
  onToggle,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-lg border border-border-subtle bg-bg-surface px-5 py-3 text-left transition-colors hover:border-border-strong"
      >
        <div className="flex items-center gap-2.5">
          <Wrench size={14} className="text-text-muted" />
          <span className="text-sm font-semibold">Options avancées</span>
          <span className="text-[10px] uppercase tracking-wider text-text-muted">
            BYOK · modèle · cache
          </span>
        </div>
        <ChevronDown
          size={14}
          className={cn(
            'text-text-muted transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>
      {open && <div className="mt-3 space-y-6">{children}</div>}
    </section>
  );
}

// ============================================================================
// BYOK (clé API Anthropic perso)
// ============================================================================

function BYOKSection() {
  const apiKey = useSettings((s) => s.apiKey);
  const setApiKey = useSettings((s) => s.setApiKey);
  const [draft, setDraft] = useState(apiKey ?? '');
  const [reveal, setReveal] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const save = () => {
    setApiKey(draft.trim() || null);
    setSavedAt(Date.now());
  };
  const clear = () => {
    setDraft('');
    setApiKey(null);
    setSavedAt(Date.now());
  };

  return (
    <section className="space-y-3 rounded-lg border border-border-subtle bg-bg-surface p-5">
      <div>
        <h2 className="text-sm font-semibold">Clé API Anthropic (BYOK)</h2>
        <p className="mt-1 text-xs text-text-secondary">
          Ta clé est stockée localement (localStorage) et utilisée pour appeler Claude
          directement depuis ton navigateur. Elle ne transite par aucun serveur tiers.
          Quand une clé est renseignée, le clustering passe en mode BYOK et n'est plus
          compté dans ton quota.
        </p>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type={reveal ? 'text' : 'password'}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="sk-ant-..."
            className="w-full rounded-md border border-border-subtle bg-bg-base px-3 py-2 pr-10 font-mono text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="button"
            onClick={() => setReveal((r) => !r)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-text-muted hover:text-text-primary"
            aria-label={reveal ? 'Masquer' : 'Afficher'}
          >
            {reveal ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        <button
          type="button"
          onClick={save}
          className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover"
        >
          <Save size={14} />
          Enregistrer
        </button>
        {apiKey && (
          <button
            type="button"
            onClick={clear}
            className="inline-flex items-center gap-1.5 rounded-md border border-border-subtle px-3 py-2 text-sm text-text-secondary hover:border-border-strong hover:text-text-primary"
          >
            <Trash2 size={14} />
            Effacer
          </button>
        )}
      </div>

      {savedAt && <p className="text-xs text-text-muted">Enregistré.</p>}
    </section>
  );
}

// ============================================================================
// Modèle Claude (BYOK uniquement)
// ============================================================================

function ModelSection() {
  const apiKey = useSettings((s) => s.apiKey);
  const model = useSettings((s) => s.model);
  const setModel = useSettings((s) => s.setModel);

  return (
    <section className="space-y-3 rounded-lg border border-border-subtle bg-bg-surface p-5">
      <div>
        <h2 className="text-sm font-semibold">Modèle de clustering (BYOK)</h2>
        <p className="mt-1 text-xs text-text-secondary">
          Sonnet 4.6 recommandé pour le naming des clusters. Haiku si tu veux économiser.
          <span className="mt-1 block text-text-muted">
            Ce choix ne s'applique qu'au mode BYOK. En mode managé, le modèle dépend de ton plan
            (Haiku pour Free, Sonnet pour Pro/Agency).
          </span>
        </p>
      </div>
      <select
        value={model}
        onChange={(e) => setModel(e.target.value)}
        disabled={!apiKey}
        className="rounded-md border border-border-subtle bg-bg-base px-3 py-2 font-mono text-sm focus:border-accent focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      >
        <option value="claude-sonnet-4-6">claude-sonnet-4-6 (recommandé)</option>
        <option value="claude-haiku-4-5-20251001">claude-haiku-4-5</option>
        <option value="claude-opus-4-7">claude-opus-4-7</option>
      </select>
    </section>
  );
}

// ============================================================================
// Mode clustering (BYOK vs managé) + quota (étape 3c)
// ============================================================================

function ClusteringModeSection({
  hasOwnApiKey,
  onActivateBYOK,
}: {
  hasOwnApiKey: boolean;
  onActivateBYOK: () => void;
}) {
  const { profile, status } = useAuth();
  if (status !== 'authenticated' || !profile) return null;

  const plan: UserPlan = profile.plan ?? 'free';
  const limits = PLAN_LIMITS[plan];
  const quota = limits.maxClusteringsPerMonth;

  // Rolling reset 30j : on calcule la quantité effectivement consommée
  // côté affichage. Le reset réel se fait à la prochaine tentative — c'est
  // déterministe et économe en writes.
  const stale = shouldResetClusteringsCount(profile.clusterings_reset_at);
  const effectiveUsed = stale ? 0 : profile.clusterings_used;

  // Nombre de jours avant le prochain reset.
  const resetMs = profile.clusterings_reset_at
    ? new Date(profile.clusterings_reset_at).getTime() + 30 * 24 * 60 * 60 * 1000
    : Date.now();
  const daysLeft = Math.max(0, Math.ceil((resetMs - Date.now()) / (24 * 60 * 60 * 1000)));

  if (hasOwnApiKey) {
    return (
      <section className="mt-8 space-y-3 rounded-lg border border-accent/30 bg-accent/[0.04] p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
            <KeyRound size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              Mode actif : BYOK
              <span className="rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-accent">
                Ta clé
              </span>
            </h2>
            <p className="mt-1 text-xs text-text-secondary">
              Les clusterings appellent Claude directement depuis ton navigateur avec ta clé personnelle.
              Pas de quota, pas de compteur — tu paies via ton compte Anthropic.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="mt-8 space-y-3 rounded-lg border border-border-subtle bg-bg-surface p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bg-elevated text-text-secondary">
          <Cloud size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            Mode actif : Managé
            <span className="rounded-full border border-border-strong bg-bg-elevated px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-text-secondary">
              Star Gap
            </span>
          </h2>
          <p className="mt-1 text-xs text-text-secondary">
            Les clusterings tournent sur l'infrastructure Star Gap avec le modèle{' '}
            <span className="font-mono text-text-primary">{limits.managedModel}</span>.
          </p>
        </div>
      </div>

      <div className="mt-3 rounded-md border border-border-subtle bg-bg-base/60 p-3">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-xs text-text-secondary">
            Quota plan{' '}
            <span className="font-semibold text-text-primary">{PLAN_LABELS[plan]}</span>
          </p>
          <p className="font-mono text-xs">
            {quota === null ? (
              <span className="text-accent">Illimité</span>
            ) : (
              <>
                <span
                  className={
                    effectiveUsed >= quota ? 'text-red-400' : 'text-text-primary'
                  }
                >
                  {effectiveUsed}
                </span>
                <span className="text-text-muted"> / {quota}</span>
                <span className="ml-2 text-text-muted">
                  · reset dans {daysLeft}j
                </span>
              </>
            )}
          </p>
        </div>
        {quota !== null && (
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-bg-elevated">
            <div
              className={cn(
                'h-full transition-all duration-300',
                effectiveUsed >= quota ? 'bg-red-400' : 'bg-accent',
              )}
              style={{
                width: `${Math.min(100, (effectiveUsed / Math.max(1, quota)) * 100)}%`,
              }}
            />
          </div>
        )}
        {quota !== null && effectiveUsed >= quota && (
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="flex items-center gap-1.5 text-xs text-red-300">
              <AlertCircle size={12} />
              Quota épuisé ce mois.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onActivateBYOK}
                className="inline-flex items-center gap-1 rounded-md border border-border-subtle px-2 py-1 text-[10px] text-text-secondary hover:border-border-strong hover:text-text-primary"
              >
                <Zap size={10} />
                Activer BYOK
              </button>
              <Link
                to="/pricing"
                className="inline-flex items-center gap-1 rounded-md bg-accent px-2 py-1 text-[10px] font-medium text-white hover:bg-accent-hover"
              >
                Voir les plans
              </Link>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// ============================================================================
// Migration Dexie → Supabase (1e.3)
// ============================================================================

function MigrationSection() {
  const { status } = useAuth();
  const [migratable, setMigratable] = useState<MigratableProject[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<MigrationProgress | null>(null);
  const [result, setResult] = useState<MigrationResult | null>(null);

  const refresh = async () => {
    if (status !== 'authenticated') return;
    setLoading(true);
    try {
      const list = await listMigratableProjects();
      setMigratable(list);
    } catch (e) {
      console.error('[migration] list failed', e);
      setMigratable([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  if (status !== 'authenticated') return null;
  if (migratable === null && !loading) return null;

  const onMigrate = async () => {
    setRunning(true);
    setResult(null);
    setProgress(null);
    try {
      const r = await migrateLocalProjectsToSupabase((p) => setProgress(p));
      setResult(r);
      await refresh();
    } catch (e) {
      console.error('[migration] failed', e);
      setResult({
        migrated: [],
        skipped: [],
        failed: [{ id: '?', name: '?', error: e instanceof Error ? e.message : String(e) }],
      });
    } finally {
      setRunning(false);
      setProgress(null);
    }
  };

  const nothingToMigrate = migratable !== null && migratable.length === 0;

  return (
    <section className="mt-6 space-y-3 rounded-lg border border-border-subtle bg-bg-surface p-5">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <CloudUpload size={14} className="text-text-secondary" />
          Migration des projets locaux vers le cloud
        </h2>
        <p className="mt-1 text-xs text-text-secondary">
          Les projets créés avant la migration cloud sont stockés uniquement sur ce
          navigateur. Migre-les vers Supabase pour les retrouver depuis n'importe quel appareil.
        </p>
      </div>

      {loading && (
        <p className="text-xs text-text-muted">Détection des projets locaux…</p>
      )}

      {nothingToMigrate && !running && !result && (
        <p className="flex items-center gap-1.5 text-xs text-text-muted">
          <CheckCircle2 size={12} className="text-green-400" />
          Aucun projet local à migrer.
        </p>
      )}

      {migratable && migratable.length > 0 && !running && (
        <>
          <ul className="space-y-1.5 text-xs">
            {migratable.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between rounded border border-border-subtle bg-bg-base px-3 py-1.5"
              >
                <span className="font-medium text-text-primary">{p.name}</span>
                <span className="font-mono text-text-muted">
                  {p.competitorCount} site{p.competitorCount > 1 ? 's' : ''} ·{' '}
                  {p.keywordCount} kw
                </span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={onMigrate}
            className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover"
          >
            <CloudUpload size={14} />
            Migrer {migratable.length} projet{migratable.length > 1 ? 's' : ''}
          </button>
        </>
      )}

      {running && progress && (
        <div className="rounded border border-border-subtle bg-bg-base px-3 py-2 text-xs">
          <div className="flex items-center gap-2">
            <Loader2 size={12} className="animate-spin text-accent" />
            <span className="font-medium text-text-primary">
              {progress.projectName}
            </span>
            <span className="text-text-muted">
              ({progress.projectIndex + 1}/{progress.totalProjects})
            </span>
          </div>
          <p className="mt-1 font-mono text-text-secondary">
            {progressLabel(progress)}
            {progress.stepTotal > 0 && (
              <span className="text-text-muted">
                {' '}· {progress.stepDone}/{progress.stepTotal}
              </span>
            )}
          </p>
        </div>
      )}

      {result && (
        <div className="space-y-1 text-xs">
          {result.migrated.length > 0 && (
            <p className="flex items-center gap-1.5 text-green-400">
              <CheckCircle2 size={12} />
              {result.migrated.length} projet{result.migrated.length > 1 ? 's' : ''} migré
              {result.migrated.length > 1 ? 's' : ''}.
            </p>
          )}
          {result.failed.length > 0 && (
            <div className="space-y-1">
              {result.failed.map((f) => (
                <p key={f.id} className="flex items-start gap-1.5 text-red-300">
                  <AlertCircle size={12} className="mt-0.5 shrink-0" />
                  <span>
                    <strong>{f.name}</strong> : {f.error}
                  </span>
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function progressLabel(p: MigrationProgress): string {
  switch (p.step) {
    case 'starting':
      return 'Démarrage…';
    case 'project':
      return 'Création du projet…';
    case 'competitors':
      return 'Enregistrement des concurrents…';
    case 'keywords':
      return 'Upload des mots-clés';
    case 'positions':
      return 'Upload des positions';
    case 'done':
      return 'Terminé';
  }
}

// ============================================================================
// Compte (Supabase auth)
// ============================================================================

function AccountSection() {
  const { user, profile, status } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);

  if (status !== 'authenticated' || !user) return null;

  const planLabel = profile?.plan ?? 'free';
  const hasSubscription = Boolean(profile?.stripe_customer_id);
  const planColor =
    planLabel === 'agency'
      ? 'bg-purple-500/15 text-purple-300 border-purple-500/40'
      : planLabel === 'pro'
        ? 'bg-accent/15 text-accent border-accent/40'
        : 'bg-bg-elevated text-text-secondary border-border-strong';

  const onSignOut = async () => {
    setSigningOut(true);
    await signOut();
  };

  const openPortal = async () => {
    setPortalLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-portal-session');
      if (error) throw error;
      const url = (data as { url?: string })?.url;
      if (url) window.location.href = url;
    } catch (e) {
      console.error('[settings] portal error', e);
      alert('Impossible d\'ouvrir le portail Stripe : ' + (e instanceof Error ? e.message : 'erreur'));
    } finally {
      setPortalLoading(false);
    }
  };

  return (
    <section className="mt-8 space-y-4 rounded-lg border border-border-subtle bg-bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bg-elevated text-text-secondary">
            <UserIcon size={16} />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">Compte</h2>
            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-text-secondary">
              <Mail size={11} />
              <span className="truncate">{user.email ?? '—'}</span>
            </div>
            {profile?.display_name && (
              <p className="text-xs text-text-muted">{profile.display_name}</p>
            )}
          </div>
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide',
            planColor,
          )}
        >
          Plan {planLabel}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {hasSubscription && (
          <button
            type="button"
            onClick={openPortal}
            disabled={portalLoading}
            className="inline-flex items-center gap-1.5 rounded-md border border-border-subtle px-3 py-1.5 text-xs text-text-secondary transition-colors hover:border-accent/60 hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            {portalLoading ? <Loader2 size={12} className="animate-spin" /> : <CreditCard size={12} />}
            Gérer mon abonnement
          </button>
        )}
        {!hasSubscription && planLabel === 'free' && (
          <Link
            to="/pricing"
            className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover"
          >
            <CreditCard size={12} />
            Upgrader
          </Link>
        )}
        <button
          type="button"
          onClick={onSignOut}
          disabled={signingOut}
          className="inline-flex items-center gap-1.5 rounded-md border border-border-subtle px-3 py-1.5 text-xs text-text-secondary transition-colors hover:border-red-400/60 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {signingOut ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <LogOut size={12} />
          )}
          Se déconnecter
        </button>
      </div>
    </section>
  );
}

function ClusterCacheSection() {
  const [stats, setStats] = useState<{ count: number; bytes: number } | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const refresh = () => {
    getCacheStats().then(setStats);
  };

  useEffect(() => {
    refresh();
  }, []);

  const onClear = async () => {
    if (!confirm('Vider tout le cache de clustering ? Les prochains clusterings rappelleront Claude.')) {
      return;
    }
    const n = await clearAllClusterCache();
    setFeedback(`${n} entrée(s) supprimée(s).`);
    refresh();
    setTimeout(() => setFeedback(null), 3000);
  };

  return (
    <section className="mt-6 space-y-3 rounded-lg border border-border-subtle bg-bg-surface p-5">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Database size={14} className="text-text-secondary" />
          Cache de clustering
        </h2>
        <p className="mt-1 text-xs text-text-secondary">
          Les résultats de clustering Claude sont mis en cache (par hash du set
          de mots-clés). Si une carte t'a l'air bizarre (un seul cluster, ou
          des KWs non clusterisés), vide le cache et relance avec "Force re-cluster".
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-mono text-xs text-text-secondary">
          {stats === null ? 'Chargement…' : (
            <>
              <span className="text-text-primary">{stats.count}</span> entrée{stats.count > 1 ? 's' : ''}
              <span className="text-text-muted"> · {formatBytes(stats.bytes)}</span>
            </>
          )}
        </span>
        <button
          type="button"
          onClick={onClear}
          disabled={stats === null || stats.count === 0}
          className="inline-flex items-center gap-1.5 rounded-md border border-border-subtle px-3 py-1.5 text-xs text-text-secondary hover:border-red-400 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Trash2 size={12} />
          Vider tout le cache
        </button>
        {feedback && <span className="text-xs text-green-400">{feedback}</span>}
      </div>
    </section>
  );
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
}

// ============================================================================
// OnboardingHelpSection — relance le tour de présentation à la demande.
// ============================================================================

function OnboardingHelpSection() {
  const restartOnboarding = () => {
    try {
      localStorage.removeItem('stargap-onboarding-completed');
    } catch {
      /* ignore */
    }
    window.location.hash = '#/';
    window.location.reload();
  };

  return (
    <section className="mt-6 space-y-3 rounded-lg border border-border-subtle bg-bg-surface p-5">
      <div>
        <h2 className="text-sm font-semibold">Tour de présentation</h2>
        <p className="mt-1 text-xs text-text-muted">
          Relance le tour guidé qui s'affiche au premier login — utile pour
          revoir le flow ou pour le présenter à quelqu'un.
        </p>
      </div>
      <button
        type="button"
        onClick={restartOnboarding}
        className="inline-flex items-center gap-1.5 rounded-md border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs text-accent hover:bg-accent/20"
      >
        Relancer le tour
      </button>
    </section>
  );
}
