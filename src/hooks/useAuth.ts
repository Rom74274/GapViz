import { useShallow } from 'zustand/react/shallow';
import { useAuthStore } from '@/lib/authStore';

// Le snapshot doit être ref-stable entre les renders sinon Zustand boucle
// (infinite update loop). useShallow compare les champs un à un et ne
// déclenche un re-render que si l'un d'eux change vraiment.

export {
  signInWithPassword,
  signUpWithPassword,
  signInWithGoogle,
  signOut,
} from '@/lib/authStore';

export function useAuth() {
  return useAuthStore(
    useShallow((s) => ({
      status: s.status,
      user: s.user,
      profile: s.profile,
      session: s.session,
      configError: s.configError,
    })),
  );
}
