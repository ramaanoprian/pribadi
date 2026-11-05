import { useQuery } from '@tanstack/react-query';
import { Link, Navigate } from 'react-router-dom';
import { ShieldCheck, UserCog, Users, MailQuestion } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/auth/AuthProvider';
import { errorMessage } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';
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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={<UserCog className="size-5" />} label="Staf aktif" value={d.staf} to="/dashboard/akun" />
        <Stat icon={<Users className="size-5" />} label="Member terdaftar" value={d.member} to="/dashboard/akun?tab=member" />
        <Stat icon={<MailQuestion className="size-5" />} label="Undangan perlu dicek" value={d.undangan} to="/dashboard/akun?tab=undangan" />
        <Stat icon={<ShieldCheck className="size-5" />} label="2FA Owner" value={<span className="text-lg text-emerald-700">Aktif</span>} />
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
      <p className="text-sm text-cocoa-500">Grafik pendapatan, biaya, laba bersih, dan anggaran hadir di Fase 6.</p>
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
      {profile?.role === 'owner' ? (
        <OwnerOverview />
      ) : (
        <EmptyState title="Ringkasan operasional" description="Pesanan hari ini, pesanan menunggu konfirmasi, dan stok menipis akan tampil di sini mulai Fase 2." />
      )}
    </>
  );
}
