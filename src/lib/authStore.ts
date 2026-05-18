import { create } from 'zustand';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from './supabase';
import type { SupabaseProfile } from './supabaseTypes';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthState {
  status: AuthStatus;
  user: User | null;
  profile: SupabaseProfile | null;
  session: Session | null;
  configError: boolean; // true si Supabase pas configuré (cred placeholders)
  // Internals — exposés pour init/cleanup uniquement.
  _setSession: (session: Session | null) => void;
  _setProfile: (profile: SupabaseProfile | null) => void;
  _setStatus: (status: AuthStatus) => void;
  reloadProfile: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'loading',
  user: null,
  profile: null,
  session: null,
  configError: !isSupabaseConfigured(),
  _setSession: (session) =>
    set({
      session,
      user: session?.user ?? null,
    }),
  _setProfile: (profile) => set({ profile }),
  _setStatus: (status) => set({ status }),
  reloadProfile: async () => {
    const { user } = get();
    if (!user) return;
    console.log('[auth] reloadProfile start', { userId: user.id });
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();
      if (error) {
        console.warn('[auth] reloadProfile error (non-blocking)', error);
        return;
      }
      console.log('[auth] reloadProfile ok', { hasProfile: Boolean(data) });
      set({ profile: (data as SupabaseProfile | null) ?? null });
    } catch (e) {
      console.error('[auth] reloadProfile threw', e);
    }
  },
}));

// ---------------------------------------------------------------------------
// Init au démarrage de l'app — singleton, ne pas appeler en dehors d'App.tsx.
// ---------------------------------------------------------------------------

let initialized = false;

export function initAuth(): void {
  if (initialized) return;
  initialized = true;

  // Si Supabase n'est pas configuré, on reste en "unauthenticated" + flag
  // configError pour que la LoginPage puisse afficher un avertissement.
  if (!isSupabaseConfigured()) {
    useAuthStore.setState({
      status: 'unauthenticated',
      configError: true,
    });
    return;
  }

  // 1) Session existante au boot.
  supabase.auth
    .getSession()
    .then(({ data: { session } }) => {
      console.log('[auth] getSession resolved', { hasSession: Boolean(session) });
      applySession(session);
    })
    .catch((err) => {
      console.error('[auth] getSession failed', err);
      useAuthStore.getState()._setStatus('unauthenticated');
    });

  // 2) Listener sur les changements d'auth (signin, signout, refresh token).
  supabase.auth.onAuthStateChange((event, session) => {
    console.log('[auth] event', event, { hasSession: Boolean(session) });
    applySession(session);
  });
}

// Important : on ne BLOQUE PAS la transition vers 'authenticated' sur le
// fetch du profile. Si la table profiles est manquante / RLS bloque /
// réseau lent, l'utilisateur passe quand même en authenticated et peut
// naviguer ; le profile arrive en background.
function applySession(session: Session | null): void {
  useAuthStore.getState()._setSession(session);
  if (session?.user) {
    useAuthStore.getState()._setStatus('authenticated');
    useAuthStore
      .getState()
      .reloadProfile()
      .catch((e) => console.error('[auth] reloadProfile (background) failed', e));
  } else {
    useAuthStore.getState()._setProfile(null);
    useAuthStore.getState()._setStatus('unauthenticated');
  }
}

// ---------------------------------------------------------------------------
// Actions publiques
// ---------------------------------------------------------------------------

export async function signInWithPassword(
  email: string,
  password: string,
): Promise<{ error: Error | null }> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return { error: error ?? null };
}

export async function signUpWithPassword(
  email: string,
  password: string,
): Promise<{ error: Error | null }> {
  const { error } = await supabase.auth.signUp({ email, password });
  return { error: error ?? null };
}

export async function signInWithGoogle(): Promise<{ error: Error | null }> {
  const redirectTo = `${window.location.origin}${import.meta.env.BASE_URL ?? '/'}`;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo },
  });
  return { error: error ?? null };
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}
