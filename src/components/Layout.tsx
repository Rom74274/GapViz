import { NavLink, Outlet } from 'react-router-dom';
import { FolderKanban, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { to: '/', label: 'Projets', icon: FolderKanban, end: true },
  { to: '/settings', label: 'Réglages', icon: Settings, end: false },
];

export function Layout() {
  return (
    <div className="relative flex h-full flex-col">
      <header className="relative z-10 flex items-center justify-between border-b border-border-subtle bg-bg-surface/80 px-6 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="h-7 w-7" />
          <span className="font-semibold tracking-tight">Star Gap</span>
          <span className="text-xs text-text-muted font-mono">v0.2</span>
        </div>
        <nav className="flex items-center gap-1">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors',
                  isActive
                    ? 'bg-bg-elevated text-text-primary'
                    : 'text-text-secondary hover:bg-bg-elevated hover:text-text-primary',
                )
              }
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="relative z-10 flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
