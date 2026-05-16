import { Navigate, Outlet } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

export function AuthGuard() {
  const { status } = useAuth();

  if (status === 'loading') {
    return <SplashScreen />;
  }
  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
}

function SplashScreen() {
  return (
    <div className="relative flex h-full flex-col items-center justify-center gap-3">
      <div className="flex items-center gap-3">
        <img
          src={`${import.meta.env.BASE_URL}favicon.svg`}
          alt=""
          className="h-8 w-8"
        />
        <span className="text-xl font-semibold tracking-tight text-text-primary">
          Star Gap
        </span>
      </div>
      <div className="flex items-center gap-2 text-xs text-text-muted">
        <Loader2 size={12} className="animate-spin" />
        Connexion…
      </div>
    </div>
  );
}
