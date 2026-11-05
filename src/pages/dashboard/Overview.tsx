import { useQuery } from '@tanstack/react-query';
import { Link, Navigate } from 'react-router-dom';
import { AlertTriangle, CalendarClock, ClipboardCheck, PackageCheck, UserCog, Users, MailQuestion, Wallet } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/auth/AuthProvider';
import { errorMessage } from '@/lib/errors';
import { formatDateTime, formatRupiah } from '@/lib/format';
import { FULFILLMENT_LABEL } from '@/lib/orders';
import { StatusBadge } from '@/components/order/OrderParts';
import { useDeviceStatus } from '@/hooks/useWhatsApp';
import { OwnerFinance } from './finance/OwnerFinance';
import { Alert } from '@/components/ui/Card';
import { ROLE_LABEL } from '@/lib/permissions';
import { Card, PageHeader } from '@/components/ui/Card';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { describeAudit } from './auditText';

function Stat({ icon, label, value, to }: { icon: React.ReactNode; label: string; value: React.ReactNode; to?: string }) {
  const body = (
    <Card className="flex items-center gap-4 transition hover:ring-brand-200">
      <div className="grid size-11 place-items-center rounded-xl bg-brand-50 text-brand-600">{icon}</div>
      <div>
        <p className="text-sm text-cocoa-600">{label}</p>
        <p className="text-2xl font-bold tabular-nums">{value}</p>
      </div>
    </Card>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

function WhatsAppAlerts({ owner }: { owner: boolean }) {
  const failed = useQuery({
    queryKey: ['wa_messages', 'gagal_count'],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { count, error } = await supabase.from('whatsapp_messages').select('id', { count: 'exact', head: true }).eq('status', 'gagal');
      if (error) throw error;
      return count ?? 0;
    },
  });
  const device = useDeviceStatus(owner);
  const disconnected = owner && device.data && (!device.data.configured || !device.data.connected);
  if (!failed.data && !disconnected) return null;
  return (
    <div className="space-y-3">
      {disconnected && (
        <Alert tone="red" title={device.data!.configured ? 'Perangkat WhatsApp terputus' : 'Token Fonnte belum diatur'}>
          Notifikasi ke pelanggan tidak terkirim. <Link to="/dashboard/whatsapp?tab=koneksi" className="font-semibold underline">Periksa koneksi</Link>
        </Alert>
      )}
      {failed.data ? (
        <Alert tone="amber" title={`${failed.data} pesan WhatsApp gagal terkirim`}>
          <Link to="/dashboard/whatsapp" className="font-semibold underline">
            Lihat log & kirim ulang
          </Link>
        </Alert>
      ) : null}
    </div>
  );
}

function OperationalOverview() {
  const q = useQuery({
    queryKey: ['overview', 'operasional'],
    refetchInterval: 60_000,
    queryFn: async () => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date(start.getTime() + 86_400_000);
      const count = (s: 'menunggu_konfirmasi' | 'dikonfirmasi' | 'siap') =>
        supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', s);
      const [menunggu, dikonfirmasi, siap, hariIni, stok, bahan] = await Promise.all([
        count('menunggu_konfirmasi'),
        count('dikonfirmasi'),
        count('siap'),
        supabase
          .from('orders')
          .select('id, kode, nama_pemesan, jadwal, fulfillment, status, total')
          .gte('jadwal', start.toISOString())
          .lt('jadwal', end.toISOString())
          .not('status', 'in', '(selesai,dibatalkan)')
          .order('jadwal'),
        supabase.from('products').select('id, nama, stok, satuan').eq('aktif', true).eq('sale_mode', 'ready_stock').lte('stok', 5).order('stok'),
        supabase.from('ingredients').select('id, nama, stok, min_stock, satuan').eq('aktif', true),
      ]);
      const err = menunggu.error ?? dikonfirmasi.error ?? siap.error ?? hariIni.error ?? stok.error ?? bahan.error;
      if (err) throw err;
      const bahanMenipis = (bahan.data ?? []).filter((b) => Number(b.stok) <= Number(b.min_stock));
      return { menunggu: menunggu.count ?? 0, dikonfirmasi: dikonfirmasi.count ?? 0, siap: siap.count ?? 0, hariIni: hariIni.data ?? [], stok: stok.data ?? [], bahanMenipis };
    },
  });
  if (q.isLoading) return <LoadingState />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />;
  const d = q.data!;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={<Wallet className="size-5" />} label="Menunggu konfirmasi" value={d.menunggu} to="/dashboard/pesanan?status=menunggu_konfirmasi" />
        <Stat icon={<ClipboardCheck className="size-5" />} label="Perlu disiapkan" value={d.dikonfirmasi} to="/dashboard/pesanan?status=dikonfirmasi" />
        <Stat icon={<PackageCheck className="size-5" />} label="Siap ambil/kirim" value={d.siap} to="/dashboard/pesanan?status=siap" />
        <Stat icon={<CalendarClock className="size-5" />} label="Jadwal hari ini" value={d.hariIni.length} />
      </div>
      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <Card>
          <h2 className="mb-3 font-sans text-lg font-bold">Jadwal hari ini</h2>
          {d.hariIni.length === 0 ? (
            <EmptyState title="Tidak ada jadwal ambil/antar hari ini" />
          ) : (
            <ul className="divide-y divide-cream-200">
              {d.hariIni.map((o) => (
                <li key={o.id}>
                  <Link to={`/dashboard/pesanan/${o.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:bg-cream-50">
                    <span className="text-sm">
                      <span className="font-semibold tabular-nums">{new Date(o.jadwal).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</span> · {o.nama_pemesan}
                      <span className="block text-xs text-cocoa-500">
                        {o.kode} · {FULFILLMENT_LABEL[o.fulfillment]} · {formatRupiah(o.total)}
                      </span>
                    </span>
                    <StatusBadge status={o.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <h2 className="mb-3 flex items-center gap-2 font-sans text-lg font-bold">
            <AlertTriangle className="size-5 text-amber-500" /> Stok menipis
          </h2>
          {d.stok.length === 0 ? (
            <p className="text-sm text-cocoa-500">Semua produk ready stock aman (stok di atas 5).</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {d.stok.map((p) => (
                <li key={p.id} className="flex justify-between">
                  <span>{p.nama}</span>
                  <span className={p.stok === 0 ? 'font-bold text-red-600' : 'font-semibold text-amber-700'}>{p.stok === 0 ? 'Habis' : `${p.stok} ${p.satuan}`}</span>
                </li>
              ))}
            </ul>
          )}
          <h3 className="mt-5 mb-2 font-sans font-bold">Bahan baku menipis</h3>
          {d.bahanMenipis.length === 0 ? (
            <p className="text-sm text-cocoa-500">Semua bahan di atas stok minimum.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {d.bahanMenipis.map((b) => (
                <li key={b.id} className="flex justify-between">
                  <span>{b.nama}</span>
                  <span className={Number(b.stok) <= 0 ? 'font-bold text-red-600' : 'font-semibold text-amber-700'}>
                    {Number(b.stok) <= 0 ? 'Habis' : `${Number(b.stok).toLocaleString('id-ID')} ${b.satuan}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Link to="/dashboard/stok-bahan" className="mt-3 inline-block text-sm font-semibold text-brand-600 hover:underline">
            Stok bahan
          </Link>
        </Card>
      </div>
    </div>
  );
}

function OwnerOverview() {
  const stats = useQuery({
    queryKey: ['overview', 'owner'],
    queryFn: async () => {
      const [staf, member, undangan, log] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }).neq('role', 'member').eq('aktif', true),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'member'),
        supabase.from('staff_invitations').select('id', { count: 'exact', head: true }).in('status', ['menunggu', 'gagal']),
        supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(6),
      ]);
      const err = staf.error ?? member.error ?? undangan.error ?? log.error;
      if (err) throw err;
      return { staf: staf.count ?? 0, member: member.count ?? 0, undangan: undangan.count ?? 0, log: log.data ?? [] };
    },
  });

  if (stats.isLoading) return <LoadingState />;
  if (stats.isError) return <ErrorState message={errorMessage(stats.error)} onRetry={() => void stats.refetch()} />;
  const d = stats.data!;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Stat icon={<UserCog className="size-5" />} label="Staf aktif" value={d.staf} to="/dashboard/akun" />
        <Stat icon={<Users className="size-5" />} label="Member terdaftar" value={d.member} to="/dashboard/akun?tab=member" />
        <Stat icon={<MailQuestion className="size-5" />} label="Undangan perlu dicek" value={d.undangan} to="/dashboard/akun?tab=undangan" />
      </div>
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-sans text-lg font-bold">Aktivitas terbaru</h2>
          <Link to="/dashboard/log-aktivitas" className="text-sm font-semibold text-brand-600 hover:underline">
            Lihat semua
          </Link>
        </div>
        {d.log.length === 0 ? (
          <EmptyState title="Belum ada aktivitas" />
        ) : (
          <ul className="divide-y divide-cream-200">
            {d.log.map((l) => (
              <li key={l.id} className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-sm">
                  <span className="font-semibold">{l.actor_nama ?? 'Sistem'}</span> {describeAudit(l)}
                </span>
                <span className="text-xs text-cocoa-500">{formatDateTime(l.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

export function Overview() {
  const { profile } = useAuth();
  if (profile?.role === 'admin_baking') return <Navigate to="/dashboard/produksi" replace />;
  return (
    <>
      <PageHeader
        title={`Halo, ${profile?.nama?.split(' ')[0] ?? ''}`}
        description={`Anda masuk sebagai ${profile ? ROLE_LABEL[profile.role] : ''}.`}
      />
      <div className="space-y-8">
        <WhatsAppAlerts owner={profile?.role === 'owner'} />
        {profile?.role === 'owner' && <OwnerFinance />}
        <section>
          {profile?.role === 'owner' && <h2 className="mb-4 text-xl font-bold">Operasional</h2>}
          <OperationalOverview />
        </section>
        {profile?.role === 'owner' && (
          <section>
            <h2 className="mb-4 text-xl font-bold">Akun & aktivitas</h2>
            <OwnerOverview />
          </section>
        )}
      </div>
    </>
  );
}
