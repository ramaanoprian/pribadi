import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { clsx } from 'clsx';
import { AtSign, LayoutDashboard, LogIn, Menu as MenuIcon, MessageCircle, ShoppingBag, UserRound, X } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { useAuth } from '@/auth/AuthProvider';
import { isStaffRole } from '@/lib/permissions';
import { useContent, usePublicSettings } from '@/hooks/usePublic';
import { formatPhone, normalizePhone } from '@/lib/phone';
import { useCart } from '@/lib/cart';

const LINKS = [
  { to: '/menu', label: 'Menu' },
  { to: '/lacak', label: 'Lacak Pesanan' },
  { to: '/cerita', label: 'Cerita Kami' },
  { to: '/lokasi', label: 'Lokasi & Kontak' },
];

export function PublicLayout() {
  const { session, profile } = useAuth();
  const { storeName } = usePublicSettings();
  const { c } = useContent();
  const cart = useCart();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);
  const staff = isStaffRole(profile?.role);
  const wa = normalizePhone(c('kontak.whatsapp'));
  const ig = c('kontak.instagram');

  const link = ({ isActive }: { isActive: boolean }) =>
    clsx('rounded-lg px-3 py-2 text-sm font-semibold transition-colors', isActive ? 'text-brand-600' : 'text-cocoa-700 hover:text-brand-600');

  const account = session ? (
    <Link
      to={staff ? '/dashboard' : '/akun'}
      className="inline-flex h-10 items-center gap-2 rounded-xl bg-cocoa-800 px-3 text-sm font-semibold text-white hover:bg-cocoa-900"
    >
      {staff ? <LayoutDashboard className="size-4" /> : <UserRound className="size-4" />}
      <span className="hidden sm:inline">{staff ? 'Dashboard' : 'Akun Saya'}</span>
    </Link>
  ) : (
    <Link to="/masuk" className="inline-flex h-10 items-center gap-2 rounded-xl bg-white px-3 text-sm font-semibold text-cocoa-800 ring-1 ring-cream-300 hover:bg-cream-50">
      <LogIn className="size-4" />
      <span className="hidden sm:inline">Masuk</span>
    </Link>
  );

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-cream-200 bg-cream-100/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
          <Link to="/" aria-label={`${storeName} — Beranda`}>
            <Logo className="h-7 sm:h-8" />
          </Link>
          <nav className="hidden items-center gap-1 lg:flex" aria-label="Menu utama">
            {LINKS.map((l) => (
              <NavLink key={l.to} to={l.to} className={link}>
                {l.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/keranjang" className="relative grid size-10 place-items-center rounded-xl bg-brand-500 text-white hover:bg-brand-600" aria-label={`Keranjang (${cart.count})`}>
              <ShoppingBag className="size-5" />
              {cart.count > 0 && (
                <span className="absolute -top-1.5 -right-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-cocoa-900 px-1 text-[11px] font-bold">{cart.count > 99 ? '99+' : cart.count}</span>
              )}
            </Link>
            {account}
            <button className="grid size-10 place-items-center rounded-xl text-cocoa-700 hover:bg-cream-200 lg:hidden" onClick={() => setOpen((o) => !o)} aria-label="Menu" aria-expanded={open}>
              {open ? <X className="size-5" /> : <MenuIcon className="size-5" />}
            </button>
          </div>
        </div>
        {open && (
          <nav className="border-t border-cream-200 bg-cream-50 px-4 py-2 lg:hidden" aria-label="Menu utama">
            {LINKS.map((l) => (
              <NavLink key={l.to} to={l.to} className={({ isActive }) => clsx('block rounded-lg px-3 py-3 font-semibold', isActive ? 'text-brand-600' : 'text-cocoa-800')}>
                {l.label}
              </NavLink>
            ))}
          </nav>
        )}
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="bg-cocoa-900 text-cream-200">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-3">
          <div>
            <Logo white className="h-8" />
            <p className="mt-3 max-w-xs text-sm text-cream-300">Kue & roti rumahan, dipanggang segar setiap hari.</p>
          </div>
          <div className="space-y-1 text-sm">
            <p className="font-semibold text-white">Kunjungi kami</p>
            {c('lokasi.alamat') && <p className="whitespace-pre-line">{c('lokasi.alamat')}</p>}
            {c('lokasi.jam_buka') && <p className="whitespace-pre-line text-cream-300">{c('lokasi.jam_buka')}</p>}
          </div>
          <div className="space-y-2 text-sm">
            <p className="font-semibold text-white">Hubungi</p>
            {wa && (
              <a href={`https://wa.me/${wa}`} className="flex items-center gap-2 hover:text-white" target="_blank" rel="noreferrer">
                <MessageCircle className="size-4" /> {formatPhone(wa)}
              </a>
            )}
            {ig && (
              <a href={`https://instagram.com/${ig}`} className="flex items-center gap-2 hover:text-white" target="_blank" rel="noreferrer">
                <AtSign className="size-4" /> @{ig}
              </a>
            )}
            <p className="pt-2 text-cream-300">
              © {new Date().getFullYear()} {storeName}
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
