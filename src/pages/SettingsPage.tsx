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
} from 'lucide-react';
import { useSettings } from '@/lib/store';
import { clearAllClusterCache, getCacheStats } from '@/lib/clustering';
import { useAuth } from '@/hooks/useAuth';
import { signOut } from '@/lib/authStore';
import { cn } from '@/lib/utils';
import {
  listMigratableProjects,
  migrateLocalProjectsToSupabase,
  type MigratableProject,
  type MigrationProgress,
  type MigrationResult,
} from '@/lib/dataLayer';

export function SettingsPage() {
  const apiKey = useSettings((s) => s.apiKey);
  const setApiKey = useSettings((s) => s.setApiKey);
  const model = useSettings((s) => s.model);
  const setModel = useSettings((s) => s.setModel);

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
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Réglages</h1>

      <AccountSection />

      <section className="mt-6 space-y-3 rounded-lg border border-border-subtle bg-bg-surface p-5">
        <div>
          <h2 className="text-sm font-semibold">Clé API Anthropic (BYOK)</h2>
          <p className="mt-1 text-xs text-text-secondary">
            Ta clé est stockée localement (localStorage) et utilisée pour appeler Claude
            directement depuis ton navigateur. Elle ne transite par aucun serveur tiers.
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

        {savedAt && (
          <p className="text-xs text-text-muted">Enregistré.</p>
        )}
      </section>

      <section className="mt-6 space-y-3 rounded-lg border border-border-subtle bg-bg-surface p-5">
        <div>
          <h2 className="text-sm font-semibold">Modèle de clustering</h2>
          <p className="mt-1 text-xs text-text-secondary">
            Sonnet 4.6 recommandé pour le naming des clusters. Haiku si tu veux économiser.
          </p>
        </div>
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="rounded-md border border-border-subtle bg-bg-base px-3 py-2 font-mono text-sm focus:border-accent focus:outline-none"
        >
          <option value="claude-sonnet-4-6">claude-sonnet-4-6 (recommandé)</option>
          <option value="claude-haiku-4-5-20251001">claude-haiku-4-5</option>
          <option value="claude-opus-4-7">claude-opus-4-7</option>
        </select>
      </section>

      <MigrationSection />

      <ClusterCacheSection />
    </div>
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

  if (status !== 'authenticated' || !user) return null;

  const planLabel = profile?.plan ?? 'free';
  const planColor =
    planLabel === 'agency'
      ? 'bg-purple-500/15 text-purple-300 border-purple-500/40'
      : planLabel === 'pro'
        ? 'bg-accent/15 text-accent border-accent/40'
        : 'bg-bg-elevated text-text-secondary border-border-strong';

  const onSignOut = async () => {
    setSigningOut(true);
    await signOut();
    // L'AuthGuard redirige vers /login automatiquement.
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
