import { useAuthStore } from '@/lib/authStore';

// Hook fin et orienté composant : expose un snapshot stable du store
// d'auth + les actions principales. Les actions sont des fonctions module-level
// du store (cf. authStore.ts) et n'ont pas besoin d'être rebinder à chaque render.

export {
  signInWithPassword,
  signUpWithPassword,
  signInWithGoogle,
  signOut,
} from '@/lib/authStore';

export function useAuth() {
  return useAuthStore((s) => ({
    status: s.status,
    user: s.user,
    profile: s.profile,
    session: s.session,
    configError: s.configError,
  }));
}
