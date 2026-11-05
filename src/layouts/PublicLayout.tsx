import { Link, NavLink, Outlet } from 'react-router-dom';
import { clsx } from 'clsx';
import { LayoutDashboard, LogIn, UserRound } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { useAuth } from '@/auth/AuthProvider';
import { isStaffRole } from '@/lib/permissions';
import { settingValue, useSettings } from '@/hooks/useSettings';
import { formatPhone, normalizePhone } from '@/lib/phone';

export function PublicLayout() {
  const { session, profile } = useAuth();
  const { data: settings } = useSettings();
  const storeName = settingValue<string>(settings, 'toko.nama', 'GutVibes');
  const wa = settingValue<string>(settings, 'toko.whatsapp', '');
  const address = settingValue<string>(settings, 'toko.alamat', '');
  const staff = isStaffRole(profile?.role);

  const link = ({ isActive }: { isActive: boolean }) =>
    clsx('rounded-lg px-3 py-2 text-sm font-semibold transition-colors', isActive ? 'text-brand-600' : 'text-cocoa-700 hover:text-brand-600');

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-cream-200 bg-cream-100/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
          <Link to="/" aria-label={`${storeName} — Beranda`}>
            <Logo className="h-7 sm:h-8" />
          </Link>
          <nav className="flex items-center gap-1">
            <NavLink to="/" end className={link}>
              Beranda
            </NavLink>
            {session ? (
              <Link
                to={staff ? '/dashboard' : '/akun'}
                className="ml-1 inline-flex h-10 items-center gap-2 rounded-xl bg-cocoa-800 px-3.5 text-sm font-semibold text-white hover:bg-cocoa-900"
              >
                {staff ? <LayoutDashboard className="size-4" /> : <UserRound className="size-4" />}
                <span>{staff ? 'Dashboard' : 'Akun Saya'}</span>
              </Link>
            ) : (
              <Link
                to="/masuk"
                className="ml-1 inline-flex h-10 items-center gap-2 rounded-xl bg-brand-500 px-3.5 text-sm font-semibold text-white hover:bg-brand-600"
              >
                <LogIn className="size-4" />
                Masuk
              </Link>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="bg-cocoa-900 text-cream-200">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 sm:grid-cols-2">
          <div>
            <Logo white className="h-8" />
            <p className="mt-3 max-w-xs text-sm text-cream-300">Kue & roti rumahan, dipanggang segar setiap hari.</p>
          </div>
          <div className="space-y-1 text-sm sm:text-right">
            {address && <p>{address}</p>}
            {wa && <p>WhatsApp: {formatPhone(normalizePhone(wa) ?? wa)}</p>}
            <p className="text-cream-300">
              © {new Date().getFullYear()} {storeName}
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
