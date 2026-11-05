import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { ShieldAlert, UserX } from 'lucide-react';
import { useAuth } from './AuthProvider';
import { FullPageLoading } from '@/components/ui/States';
import { Button } from '@/components/ui/Button';
import { canView, homePathFor, isStaffRole, type ModuleKey } from '@/lib/permissions';
import type { ReactNode } from 'react';

function CenterMessage({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="rounded-full bg-cream-200 p-4 text-cocoa-600">{icon}</div>
      <h1 className="text-2xl font-bold">{title}</h1>
      <div className="max-w-md text-sm text-cocoa-600">{children}</div>
    </div>
  );
}

export function AccountInactive() {
  const { signOut } = useAuth();
  return (
    <CenterMessage icon={<UserX className="size-8" />} title="Akun dinonaktifkan">
      <p>Akun Anda sedang tidak aktif. Hubungi Owner bila menurut Anda ini keliru.</p>
      <Button variant="secondary" className="mt-4" onClick={() => void signOut()}>
        Keluar
      </Button>
    </CenterMessage>
  );
}

export function AccessDenied() {
  return (
    <CenterMessage icon={<ShieldAlert className="size-8" />} title="Akses ditolak">
      <p>Peran Anda tidak memiliki akses ke halaman ini.</p>
    </CenterMessage>
  );
}

/** Harus masuk (peran apa pun). */
export function RequireAuth() {
  const { loading, session } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageLoading />;
  if (!session) return <Navigate to={`/masuk?next=${encodeURIComponent(location.pathname)}`} replace />;
  return <Outlet />;
}

/** Khusus staf. Owner wajib 2FA sebelum bisa memakai dashboard. */
export function RequireStaff() {
  const { loading, session, profile, mfaRequired } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageLoading />;
  if (!session) return <Navigate to={`/masuk?next=${encodeURIComponent(location.pathname)}`} replace />;
  if (!profile || !isStaffRole(profile.role)) return <Navigate to="/akun" replace />;
  if (!profile.aktif) return <AccountInactive />;
  if (mfaRequired) return <Navigate to={`/dashboard/2fa?next=${encodeURIComponent(location.pathname)}`} replace />;
  return <Outlet />;
}

/** Penjaga per modul berdasarkan matriks hak akses. */
export function RequireModule({ module, children }: { module: ModuleKey; children: ReactNode }) {
  const { profile } = useAuth();
  if (!canView(profile?.role, module)) return <AccessDenied />;
  return <>{children}</>;
}

/** Khusus member (pelanggan). Staf diarahkan ke dashboard. */
export function RequireMember() {
  const { loading, session, profile } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageLoading />;
  if (!session) return <Navigate to={`/masuk?next=${encodeURIComponent(location.pathname)}`} replace />;
  if (profile && isStaffRole(profile.role)) return <Navigate to={homePathFor(profile.role)} replace />;
  if (profile && !profile.aktif) return <AccountInactive />;
  return <Outlet />;
}

/** Halaman masuk/daftar: bila sudah masuk, arahkan ke halaman awal. */
export function GuestOnly() {
  const { loading, session, profile } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageLoading />;
  if (session && profile) {
    const next = safeNext(new URLSearchParams(location.search).get('next'));
    return <Navigate to={next ?? homePathFor(profile.role)} replace />;
  }
  return <Outlet />;
}

/** Hanya izinkan tujuan internal (cegah open redirect). */
export function safeNext(next: string | null): string | null {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return null;
  return next;
}
