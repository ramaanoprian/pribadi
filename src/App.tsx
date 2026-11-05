import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { PublicLayout } from '@/layouts/PublicLayout';
import { DashboardLayout } from '@/layouts/DashboardLayout';
import { GuestOnly, RequireAuth, RequireMember, RequireModule, RequireStaff } from '@/auth/guards';
import { NAV_ITEMS } from '@/lib/permissions';
import { Home } from '@/pages/public/Home';
import { NotFound } from '@/pages/public/NotFound';
import { Login } from '@/pages/auth/Login';
import { Register } from '@/pages/auth/Register';
import { ForgotPassword } from '@/pages/auth/ForgotPassword';
import { SetPassword } from '@/pages/auth/SetPassword';
import { Account } from '@/pages/account/Account';
import { FullPageLoading } from '@/components/ui/States';

// Halaman staf dimuat terpisah agar pengunjung website tidak mengunduhnya.
const Mfa = lazy(() => import('@/pages/auth/Mfa').then((m) => ({ default: m.Mfa })));
const Overview = lazy(() => import('@/pages/dashboard/Overview').then((m) => ({ default: m.Overview })));
const Accounts = lazy(() => import('@/pages/dashboard/Accounts').then((m) => ({ default: m.Accounts })));
const ActivityLog = lazy(() => import('@/pages/dashboard/ActivityLog').then((m) => ({ default: m.ActivityLog })));
const Settings = lazy(() => import('@/pages/dashboard/Settings').then((m) => ({ default: m.Settings })));
const MyProfile = lazy(() => import('@/pages/dashboard/MyProfile').then((m) => ({ default: m.MyProfile })));
const ComingSoon = lazy(() => import('@/pages/dashboard/ComingSoon').then((m) => ({ default: m.ComingSoon })));

// Modul yang belum dibangun: tampil sesuai hak akses, berisi info fase.
const upcoming = NAV_ITEMS.filter((i) => i.phase > 1);

export default function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<Home />} />
        <Route element={<GuestOnly />}>
          <Route path="masuk" element={<Login />} />
          <Route path="daftar" element={<Register />} />
          <Route path="lupa-kata-sandi" element={<ForgotPassword />} />
        </Route>
        <Route path="atur-kata-sandi" element={<SetPassword />} />
        <Route element={<RequireMember />}>
          <Route path="akun" element={<Account />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Route>

      <Route element={<RequireAuth />}>
        <Route path="dashboard/2fa" element={<Suspense fallback={<FullPageLoading />}><Mfa /></Suspense>} />
      </Route>

      <Route path="dashboard" element={<RequireStaff />}>
        <Route element={<DashboardLayout />}>
          <Route index element={<Overview />} />
          <Route path="profil" element={<MyProfile />} />
          <Route path="akun" element={<RequireModule module="akun"><Accounts /></RequireModule>} />
          <Route path="log-aktivitas" element={<RequireModule module="log_aktivitas"><ActivityLog /></RequireModule>} />
          <Route path="pengaturan" element={<RequireModule module="pengaturan"><Settings /></RequireModule>} />
          {upcoming.map((item) => (
            <Route
              key={item.path}
              path={item.path.replace('/dashboard/', '')}
              element={
                <RequireModule module={item.module}>
                  <ComingSoon title={item.label} phase={item.phase} />
                </RequireModule>
              }
            />
          ))}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}
