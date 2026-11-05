import { Suspense, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { clsx } from 'clsx';
import { LogOut, Menu, UserRound, X } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { CURRENT_PHASE, navFor, ROLE_LABEL, type NavItem } from '@/lib/permissions';
import { NAV_ICONS } from '@/components/icons';
import { Logo } from '@/components/Logo';
import { LoadingState } from '@/components/ui/States';

function groupItems(items: NavItem[]) {
  const groups: { name: string; items: NavItem[] }[] = [];
  for (const item of items) {
    const g = groups.find((x) => x.name === item.group);
    if (g) g.items.push(item);
    else groups.push({ name: item.group, items: [item] });
  }
  return groups;
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { profile, signOut } = useAuth();
  const items = navFor(profile?.role);
  const groups = groupItems(items);
  const single = groups.length === 1;

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center px-5">
        <Link to="/" onClick={onNavigate}>
          <Logo className="h-7" />
        </Link>
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4" aria-label="Menu dashboard">
        {groups.map((g) => (
          <div key={g.name}>
            {!single && <p className="px-3 pb-1.5 text-[11px] font-bold tracking-wider text-cocoa-400 uppercase">{g.name}</p>}
            <ul className="space-y-0.5">
              {g.items.map((item) => {
                const Icon = NAV_ICONS[item.icon];
                return (
                  <li key={item.path}>
                    <NavLink
                      to={item.path}
                      end={item.path === '/dashboard' || item.path === '/dashboard/produksi'}
                      onClick={onNavigate}
                      className={({ isActive }) =>
                        clsx(
                          'flex items-center gap-3 rounded-xl px-3 font-semibold transition-colors',
                          single ? 'h-14 text-base' : 'h-10 text-sm',
                          isActive ? 'bg-brand-500 text-white shadow-sm' : 'text-cocoa-700 hover:bg-cream-200',
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {Icon && <Icon className={single ? 'size-5' : 'size-4'} aria-hidden />}
                          <span className="flex-1">{item.label}</span>
                          {item.phase > CURRENT_PHASE && (
                            <span className={clsx('rounded-md px-1.5 text-[10px] font-bold', isActive ? 'bg-white/20' : 'bg-cream-200 text-cocoa-500')}>
                              F{item.phase}
                            </span>
                          )}
                        </>
                      )}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="border-t border-cream-200 p-3">
        <NavLink
          to="/dashboard/profil"
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-xl p-2 hover:bg-cream-200"
        >
          <span className="grid size-9 place-items-center rounded-full bg-cocoa-800 text-white">
            <UserRound className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{profile?.nama || profile?.email}</span>
            <span className="block text-xs text-cocoa-500">{profile ? ROLE_LABEL[profile.role] : ''}</span>
          </span>
        </NavLink>
        <button
          onClick={() => void signOut()}
          className="mt-1 flex h-10 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-cocoa-700 hover:bg-cream-200"
        >
          <LogOut className="size-4" />
          Keluar
        </button>
      </div>
    </div>
  );
}

export function DashboardLayout() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);

  return (
    <div className="min-h-dvh bg-cream-100 lg:pl-64">
      {/* Sidebar desktop */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-cream-200 bg-cream-50 lg:block">
        <SidebarContent />
      </aside>

      {/* Bar atas HP */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-cream-200 bg-cream-50/95 px-4 backdrop-blur lg:hidden">
        <Logo className="h-6" />
        <button onClick={() => setOpen(true)} className="rounded-lg p-2 text-cocoa-700 hover:bg-cream-200" aria-label="Buka menu">
          <Menu className="size-6" />
        </button>
      </header>

      {/* Laci menu HP */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-cocoa-900/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-cream-50 shadow-xl">
            <button onClick={() => setOpen(false)} className="absolute top-3 right-3 rounded-lg p-2 hover:bg-cream-200" aria-label="Tutup menu">
              <X className="size-5" />
            </button>
            <SidebarContent onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
        <Suspense fallback={<LoadingState />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
