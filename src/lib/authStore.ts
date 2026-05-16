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
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();
    if (error) {
      console.error('[auth] reloadProfile error', error);
      return;
    }
    set({ profile: (data as SupabaseProfile | null) ?? null });
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
    .then(async ({ data: { session } }) => {
      useAuthStore.getState()._setSession(session);
      if (session?.user) {
        await useAuthStore.getState().reloadProfile();
        useAuthStore.getState()._setStatus('authenticated');
      } else {
        useAuthStore.getState()._setStatus('unauthenticated');
      }
    })
    .catch((err) => {
      console.error('[auth] getSession failed', err);
      useAuthStore.getState()._setStatus('unauthenticated');
    });

  // 2) Listener sur les changements d'auth (signin, signout, refresh token).
  supabase.auth.onAuthStateChange(async (event, session) => {
    console.log('[auth] event', event);
    useAuthStore.getState()._setSession(session);
    if (session?.user) {
      await useAuthStore.getState().reloadProfile();
      useAuthStore.getState()._setStatus('authenticated');
    } else {
      useAuthStore.getState()._setProfile(null);
      useAuthStore.getState()._setStatus('unauthenticated');
    }
  });
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
