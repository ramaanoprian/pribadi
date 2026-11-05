import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/errors';
import { formatDate, formatRupiah } from '@/lib/format';
import { isoDate, monthLabel, type OwnerDashboard } from '@/lib/finance';
import { BudgetBars, GroupedBarChart, HBarList } from '@/components/charts/charts';
import { Card } from '@/components/ui/Card';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';

function Kpi({ label, value, tone }: { label: string; value: number; tone?: 'pos' | 'neg' }) {
  return (
    <Card>
      <p className="text-sm text-cocoa-600">{label}</p>
      <p className={clsx('mt-1 font-display text-2xl font-bold tabular-nums sm:text-3xl', tone === 'neg' && 'text-red-700', tone === 'pos' && 'text-emerald-700')}>
        {formatRupiah(value)}
      </p>
    </Card>
  );
}

/** Ringkasan keuangan Owner: KPI, tren 6 bulan, komposisi biaya, anggaran, biaya terbesar. */
export function OwnerFinance() {
  const [bulan, setBulan] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const q = useQuery({
    queryKey: ['owner_dashboard', isoDate(bulan)],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('owner_dashboard', { p_bulan: isoDate(bulan) });
      if (error) throw error;
      return data as unknown as OwnerDashboard;
    },
  });
  const shift = (n: number) => setBulan((b) => new Date(b.getFullYear(), b.getMonth() + n, 1));
  const now = new Date();
  const isCurrent = isoDate(bulan) === isoDate(new Date(now.getFullYear(), now.getMonth(), 1));

  return (
    <section className="space-y-5" aria-labelledby="keuangan-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="keuangan-title" className="text-xl font-bold">
          Keuangan
        </h2>
        <div className="flex items-center gap-1 rounded-xl bg-white p-1 ring-1 ring-cream-300">
          <button className="rounded-lg p-2 hover:bg-cream-100" onClick={() => shift(-1)} aria-label="Bulan sebelumnya">
            <ChevronLeft className="size-4" />
          </button>
          <span className="min-w-36 text-center text-sm font-semibold capitalize">{monthLabel(isoDate(bulan))}</span>
          <button className="rounded-lg p-2 hover:bg-cream-100 disabled:opacity-40" onClick={() => shift(1)} disabled={isCurrent} aria-label="Bulan berikutnya">
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>
      {q.isLoading ? (
        <LoadingState />
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
      ) : (
        <FinanceBody d={q.data!} />
      )}
    </section>
  );
}

function FinanceBody({ d }: { d: OwnerDashboard }) {
  const r = d.ringkasan;
  const totalBiaya = r.hpp + r.biaya_operasional;
  const komposisi = [{ label: 'HPP bahan', value: r.hpp }, ...r.biaya_per_kategori.map((b) => ({ label: b.kategori, value: b.total }))]
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value);
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi label={`Pendapatan (${r.jumlah_pesanan} pesanan selesai)`} value={r.pendapatan} />
        <Kpi label="Total biaya (HPP + operasional)" value={totalBiaya} />
        <Kpi label="Laba bersih" value={r.laba_bersih} tone={r.laba_bersih < 0 ? 'neg' : 'pos'} />
      </div>
      <Card>
        <h3 className="mb-3 font-sans font-bold">Tren 6 bulan</h3>
        <GroupedBarChart
          labels={{ a: 'Pendapatan', b: 'Total biaya' }}
          data={d.tren.map((t) => ({ label: monthLabel(t.bulan, 'short'), a: t.pendapatan, b: t.total_biaya, extra: `Laba bersih: ${formatRupiah(t.laba_bersih)}` }))}
        />
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer font-semibold text-cocoa-700">Lihat sebagai tabel</summary>
          <table className="mt-2 w-full text-left text-xs">
            <thead>
              <tr className="text-cocoa-500">
                <th className="py-1">Bulan</th>
                <th className="py-1 text-right">Pendapatan</th>
                <th className="py-1 text-right">Total biaya</th>
                <th className="py-1 text-right">Laba bersih</th>
              </tr>
            </thead>
            <tbody>
              {d.tren.map((t) => (
                <tr key={t.bulan} className="border-t border-cream-200">
                  <td className="py-1 capitalize">{monthLabel(t.bulan)}</td>
                  <td className="py-1 text-right tabular-nums">{formatRupiah(t.pendapatan)}</td>
                  <td className="py-1 text-right tabular-nums">{formatRupiah(t.total_biaya)}</td>
                  <td className={clsx('py-1 text-right tabular-nums', t.laba_bersih < 0 && 'text-red-700')}>{formatRupiah(t.laba_bersih)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </Card>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <h3 className="mb-3 font-sans font-bold">Komposisi biaya</h3>
          {komposisi.length ? <HBarList data={komposisi} /> : <EmptyState title="Belum ada biaya bulan ini" />}
        </Card>
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-sans font-bold">Status anggaran</h3>
            <Link to="/dashboard/biaya?tab=anggaran" className="text-sm font-semibold text-brand-600 hover:underline">
              Atur
            </Link>
          </div>
          {d.anggaran.length ? <BudgetBars data={d.anggaran} /> : <EmptyState title="Belum ada anggaran bulan ini" />}
        </Card>
      </div>
      <Card>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-sans font-bold">5 biaya terbesar</h3>
          <Link to="/dashboard/laporan" className="text-sm font-semibold text-brand-600 hover:underline">
            Laporan laba rugi
          </Link>
        </div>
        {d.biaya_terbesar.length === 0 ? (
          <p className="text-sm text-cocoa-500">Belum ada biaya.</p>
        ) : (
          <ol className="divide-y divide-cream-200 text-sm">
            {d.biaya_terbesar.map((b, i) => (
              <li key={i} className="flex justify-between gap-3 py-2">
                <span>
                  {b.keterangan || b.kategori}
                  <span className="block text-xs text-cocoa-500">
                    {b.kategori} · {formatDate(b.tanggal)}
                  </span>
                </span>
                <span className="font-semibold tabular-nums">{formatRupiah(b.nominal)}</span>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </>
  );
}
