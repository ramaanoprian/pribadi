import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { PublicLayout } from '@/layouts/PublicLayout';
import { DashboardLayout } from '@/layouts/DashboardLayout';
import { GuestOnly, RequireAuth, RequireMember, RequireModule, RequireStaff } from '@/auth/guards';
import { CURRENT_PHASE, NAV_ITEMS } from '@/lib/permissions';
import { Home } from '@/pages/public/Home';
import { NotFound } from '@/pages/public/NotFound';
import { Login } from '@/pages/auth/Login';
import { Register } from '@/pages/auth/Register';
import { ForgotPassword } from '@/pages/auth/ForgotPassword';
import { SetPassword } from '@/pages/auth/SetPassword';
import { Account } from '@/pages/account/Account';
import { Menu } from '@/pages/public/Menu';
import { ProductDetail } from '@/pages/public/ProductDetail';
import { Cart } from '@/pages/public/Cart';
import { Checkout } from '@/pages/public/Checkout';
import { Track, TrackByToken } from '@/pages/public/Track';
import { Story } from '@/pages/public/Story';
import { Location } from '@/pages/public/Location';
import { FullPageLoading } from '@/components/ui/States';

// Halaman staf dimuat terpisah agar pengunjung website tidak mengunduhnya.
const Mfa = lazy(() => import('@/pages/auth/Mfa').then((m) => ({ default: m.Mfa })));
const Overview = lazy(() => import('@/pages/dashboard/Overview').then((m) => ({ default: m.Overview })));
const Accounts = lazy(() => import('@/pages/dashboard/Accounts').then((m) => ({ default: m.Accounts })));
const ActivityLog = lazy(() => import('@/pages/dashboard/ActivityLog').then((m) => ({ default: m.ActivityLog })));
const Settings = lazy(() => import('@/pages/dashboard/Settings').then((m) => ({ default: m.Settings })));
const MyProfile = lazy(() => import('@/pages/dashboard/MyProfile').then((m) => ({ default: m.MyProfile })));
const Orders = lazy(() => import('@/pages/dashboard/orders/Orders').then((m) => ({ default: m.Orders })));
const OrderDetail = lazy(() => import('@/pages/dashboard/orders/OrderDetail').then((m) => ({ default: m.OrderDetail })));
const Catalog = lazy(() => import('@/pages/dashboard/Catalog').then((m) => ({ default: m.Catalog })));
const Promos = lazy(() => import('@/pages/dashboard/Promos').then((m) => ({ default: m.Promos })));
const Customers = lazy(() => import('@/pages/dashboard/Customers').then((m) => ({ default: m.Customers })));
const CustomerDetail = lazy(() => import('@/pages/dashboard/Customers').then((m) => ({ default: m.CustomerDetail })));
const WebContent = lazy(() => import('@/pages/dashboard/WebContent').then((m) => ({ default: m.WebContent })));
const WhatsApp = lazy(() => import('@/pages/dashboard/WhatsApp').then((m) => ({ default: m.WhatsApp })));
const ProductionInput = lazy(() => import('@/pages/dashboard/production/ProductionInput').then((m) => ({ default: m.ProductionInput })));
const ProductionHistory = lazy(() => import('@/pages/dashboard/production/ProductionHistory').then((m) => ({ default: m.ProductionHistory })));
const Ingredients = lazy(() => import('@/pages/dashboard/production/Ingredients').then((m) => ({ default: m.Ingredients })));
const Recipes = lazy(() => import('@/pages/dashboard/production/Recipes').then((m) => ({ default: m.Recipes })));
const FinishedStock = lazy(() => import('@/pages/dashboard/production/FinishedStock').then((m) => ({ default: m.FinishedStock })));
const ComingSoon = lazy(() => import('@/pages/dashboard/ComingSoon').then((m) => ({ default: m.ComingSoon })));

// Modul yang belum dibangun: tampil sesuai hak akses, berisi info fase.
const upcoming = NAV_ITEMS.filter((i) => i.phase > CURRENT_PHASE);

export default function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<Home />} />
        <Route path="menu" element={<Menu />} />
        <Route path="menu/:slug" element={<ProductDetail />} />
        <Route path="keranjang" element={<Cart />} />
        <Route path="checkout" element={<Checkout />} />
        <Route path="lacak" element={<Track />} />
        <Route path="lacak/:token" element={<TrackByToken />} />
        <Route path="cerita" element={<Story />} />
        <Route path="lokasi" element={<Location />} />
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
          <Route path="pesanan" element={<RequireModule module="pesanan"><Orders /></RequireModule>} />
          <Route path="pesanan/:id" element={<RequireModule module="pesanan"><OrderDetail /></RequireModule>} />
          <Route path="katalog" element={<RequireModule module="katalog"><Catalog /></RequireModule>} />
          <Route path="promo" element={<RequireModule module="harga_promo"><Promos /></RequireModule>} />
          <Route path="pelanggan" element={<RequireModule module="pelanggan"><Customers /></RequireModule>} />
          <Route path="pelanggan/:id" element={<RequireModule module="pelanggan"><CustomerDetail /></RequireModule>} />
          <Route path="konten" element={<RequireModule module="konten_web"><WebContent /></RequireModule>} />
          <Route path="produksi" element={<RequireModule module="produksi"><ProductionInput /></RequireModule>} />
          <Route path="produksi/riwayat" element={<RequireModule module="produksi"><ProductionHistory /></RequireModule>} />
          <Route path="stok-bahan" element={<RequireModule module="stok_bahan"><Ingredients /></RequireModule>} />
          <Route path="resep" element={<RequireModule module="resep"><Recipes /></RequireModule>} />
          <Route path="stok-produk" element={<RequireModule module="stok_produk"><FinishedStock /></RequireModule>} />
          <Route path="whatsapp" element={<RequireModule module="whatsapp"><WhatsApp /></RequireModule>} />
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
