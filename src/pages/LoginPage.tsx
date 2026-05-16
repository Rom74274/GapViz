import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Loader2, Mail, Lock, AlertCircle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import {
  signInWithGoogle,
  signInWithPassword,
  signUpWithPassword,
} from '@/lib/authStore';
import { cn } from '@/lib/utils';

type Tab = 'signin' | 'signup';

export function LoginPage() {
  const { status, configError } = useAuth();
  const [tab, setTab] = useState<Tab>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Si déjà authentifié, on file vers l'accueil.
  useEffect(() => {
    setError(null);
    setInfo(null);
  }, [tab]);

  if (status === 'authenticated') {
    return <Navigate to="/" replace />;
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (tab === 'signin') {
        const { error } = await signInWithPassword(email.trim(), password);
        if (error) setError(translateAuthError(error.message));
      } else {
        const { error } = await signUpWithPassword(email.trim(), password);
        if (error) {
          setError(translateAuthError(error.message));
        } else {
          setInfo(
            'Compte créé. Vérifie tes emails si la confirmation est activée — sinon tu peux te connecter directement.',
          );
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const onGoogle = async () => {
    setBusy(true);
    setError(null);
    const { error } = await signInWithGoogle();
    if (error) {
      setError(translateAuthError(error.message));
      setBusy(false);
    }
    // Sinon : redirect OAuth → la page se recharge, pas besoin de reset busy.
  };

  return (
    <div className="relative flex h-full items-center justify-center px-6 py-10">
      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-border-subtle bg-bg-surface/80 p-6 shadow-2xl backdrop-blur">
        <header className="mb-5 flex flex-col items-center gap-2 text-center">
          <img
            src={`${import.meta.env.BASE_URL}favicon.svg`}
            alt=""
            className="h-10 w-10"
          />
          <h1 className="text-xl font-semibold tracking-tight">Star Gap</h1>
          <p className="text-xs text-text-muted">
            {tab === 'signin'
              ? 'Connecte-toi pour ouvrir tes projets.'
              : 'Crée ton compte pour commencer.'}
          </p>
        </header>

        {configError && (
          <div className="mb-4 flex items-start gap-2 rounded-md border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <span>
              Supabase n'est pas configuré (variables .env). L'auth ne fonctionnera
              pas tant que <code className="font-mono">VITE_SUPABASE_URL</code> et{' '}
              <code className="font-mono">VITE_SUPABASE_ANON_KEY</code> ne sont pas
              renseignés.
            </span>
          </div>
        )}

        <div className="mb-4 grid grid-cols-2 gap-1 rounded-lg border border-border-subtle bg-bg-base/40 p-1">
          <TabButton active={tab === 'signin'} onClick={() => setTab('signin')}>
            Se connecter
          </TabButton>
          <TabButton active={tab === 'signup'} onClick={() => setTab('signup')}>
            S'inscrire
          </TabButton>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <Field icon={<Mail size={14} />} label="Email">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              placeholder="toi@exemple.com"
              className="w-full bg-transparent text-sm outline-none placeholder:text-text-muted"
            />
          </Field>
          <Field icon={<Lock size={14} />} label="Mot de passe">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={tab === 'signin' ? 'current-password' : 'new-password'}
              required
              minLength={6}
              placeholder="••••••••"
              className="w-full bg-transparent text-sm outline-none placeholder:text-text-muted"
            />
          </Field>

          {error && (
            <div className="flex items-start gap-2 rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-300">
              <AlertCircle size={12} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {info && (
            <div className="rounded-md bg-green-500/10 px-3 py-2 text-xs text-green-300">
              {info}
            </div>
          )}

          <button
            type="submit"
            disabled={busy || configError}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            {tab === 'signin' ? 'Se connecter' : 'Créer mon compte'}
          </button>
        </form>

        <div className="my-4 flex items-center gap-3 text-[10px] text-text-muted">
          <span className="h-px flex-1 bg-border-subtle" />
          OU
          <span className="h-px flex-1 bg-border-subtle" />
        </div>

        <button
          type="button"
          onClick={onGoogle}
          disabled={busy || configError}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border-subtle bg-bg-base/40 px-4 py-2 text-sm text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          <GoogleLogo />
          Continuer avec Google
        </button>

        <p className="mt-5 text-center text-[10px] text-text-muted">
          {tab === 'signin'
            ? 'Pas encore de compte ? Bascule sur S\'inscrire ci-dessus.'
            : 'En t\'inscrivant, tu acceptes l\'usage personnel / test de Star Gap.'}
        </p>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
        active
          ? 'bg-bg-elevated text-text-primary'
          : 'text-text-muted hover:text-text-secondary',
      )}
    >
      {children}
    </button>
  );
}

function Field({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] uppercase tracking-wide text-text-muted">
        {label}
      </span>
      <div className="flex items-center gap-2 rounded-lg border border-border-subtle bg-bg-base/60 px-3 py-2 focus-within:border-accent">
        <span className="text-text-muted">{icon}</span>
        {children}
      </div>
    </label>
  );
}

function GoogleLogo() {
  return (
    <svg width="14" height="14" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.185l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.167 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}

function translateAuthError(msg: string): string {
  if (/Invalid login credentials/i.test(msg)) return 'Email ou mot de passe incorrect.';
  if (/User already registered/i.test(msg)) return 'Un compte existe déjà avec cet email.';
  if (/Password should be at least/i.test(msg))
    return 'Le mot de passe doit faire au moins 6 caractères.';
  if (/rate limit/i.test(msg)) return 'Trop de tentatives — réessaie dans 1 minute.';
  return msg;
}
