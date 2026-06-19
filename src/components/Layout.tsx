import { NavLink, Outlet } from 'react-router-dom';
import { FolderKanban, Settings, CreditCard, LogOut } from 'lucide-react';
import { useAuth, signOut } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

const navItems = [
  { to: '/', label: 'Projets', icon: FolderKanban, end: true },
  { to: '/settings', label: 'Réglages', icon: Settings, end: false },
  { to: '/pricing', label: 'Plan', icon: CreditCard, end: false },
];

export function Layout() {
  const { user, profile } = useAuth();
  const email = user?.email ?? '';
  // Initiale pour l'avatar : profile.display_name si dispo sinon part avant @
  const displayName =
    (profile as { display_name?: string } | null)?.display_name ||
    email.split('@')[0] ||
    'Star Gap';
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <div className="relative flex h-full">
      <Sidebar
        displayName={displayName}
        email={email}
        initials={initials}
      />
      <main className="relative z-10 ml-64 flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}

function Sidebar({
  displayName,
  email,
  initials,
}: {
  displayName: string;
  email: string;
  initials: string;
}) {
  return (
    <aside className="glass-card glass-edge fixed left-0 top-0 z-20 flex h-full w-64 flex-col p-4">
      {/* Logo + version */}
      <div className="mb-8 flex items-center gap-2.5 px-2 pt-2">
        <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="h-7 w-7" />
        <div className="flex items-baseline gap-2">
          <span className="text-base font-semibold tracking-tight">Star Gap</span>
          <span className="font-mono text-[10px] text-text-muted">v1.0</span>
        </div>
      </div>

      {/* Navigation principale */}
      <nav className="flex flex-1 flex-col gap-0.5">
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                isActive
                  ? 'bg-white/10 text-text-primary'
                  : 'text-text-secondary hover:bg-white/5 hover:text-text-primary',
              )
            }
          >
            <Icon size={16} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Profil bas */}
      <div className="border-t border-white/10 pt-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-1.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/30 text-xs font-semibold text-text-primary">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-text-primary">
              {displayName}
            </p>
            {email && (
              <p className="truncate text-[10px] text-text-muted">{email}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => void signOut()}
            className="rounded p-1.5 text-text-muted hover:bg-white/10 hover:text-text-primary"
            title="Se déconnecter"
            aria-label="Se déconnecter"
          >
            <LogOut size={13} />
          </button>
        </div>
      </div>
    </aside>
  );
}
