import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { FileDown, FileSpreadsheet } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/errors';
import { formatDate, formatRupiah } from '@/lib/format';
import { presetRange, type PL } from '@/lib/finance';
import { exportExcel, exportPdf, type ExportSpec } from '@/lib/export';
import { Card, PageHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';

const PRESETS = [
  { key: 'bulan_ini', label: 'Bulan ini' },
  { key: 'bulan_lalu', label: 'Bulan lalu' },
  { key: '3_bulan', label: '3 bulan' },
  { key: 'tahun_ini', label: 'Tahun ini' },
];

type Line = { label: string; value: number; level?: 'sub' | 'total' | 'grand'; negative?: boolean };
type Produk = NonNullable<PL['per_produk']>[number];
/** Negatif tanpa menghasilkan -0 (yang tampil sebagai "-Rp 0"). */
const neg = (n: number) => (n ? -n : 0);

export function Report() {
  const toast = useToast();
  const [preset, setPreset] = useState('bulan_ini');
  const [[from, to], setRange] = useState(() => presetRange('bulan_ini'));
  const q = useQuery({
    queryKey: ['report_profit_loss', from, to],
    enabled: Boolean(from && to && to >= from),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('report_profit_loss', { p_from: from, p_to: to });
      if (error) throw error;
      return data as unknown as PL;
    },
  });
  const r = q.data;
  const lines: Line[] = r
    ? [
        { label: 'Penjualan produk', value: r.penjualan_kotor },
        { label: 'Diskon (promo & hadiah)', value: neg(r.diskon), negative: true },
        { label: 'Pendapatan ongkir', value: r.pendapatan_ongkir },
        { label: 'Pendapatan', value: r.pendapatan, level: 'total' },
        { label: 'HPP bahan', value: neg(r.hpp), negative: true },
        { label: 'Laba kotor', value: r.laba_kotor, level: 'total' },
        ...r.biaya_per_kategori.map((b) => ({ label: `Biaya ${b.kategori.toLowerCase()}`, value: neg(b.total), negative: true, level: 'sub' as const })),
        { label: 'Total biaya operasional', value: neg(r.biaya_operasional), negative: true },
        { label: 'Laba bersih', value: r.laba_bersih, level: 'grand' },
      ]
    : [];
  const periodeText = `${formatDate(from)} – ${formatDate(to)}`;
  const plSpec: ExportSpec<Line> = {
    judul: 'Laporan Laba Rugi — GutVibes',
    subjudul: `Periode ${periodeText} · ${r?.jumlah_pesanan ?? 0} pesanan selesai`,
    namaFile: `laba-rugi-${from}-${to}`,
    entitas: 'laporan_laba_rugi',
    baris: lines,
    kolom: [
      { header: 'Keterangan', value: (l) => l.label, width: 34 },
      { header: 'Jumlah (Rp)', value: (l) => l.value, type: 'rupiah', width: 18 },
    ],
  };
  const produkSpec: ExportSpec<Produk> = {
    judul: 'HPP & Margin per Produk — GutVibes',
    subjudul: `Periode ${periodeText}`,
    namaFile: `margin-produk-${from}-${to}`,
    entitas: 'laporan_margin_produk',
    baris: r?.per_produk ?? [],
    kolom: [
      { header: 'Produk', value: (p) => p.nama, width: 28 },
      { header: 'Terjual', value: (p) => p.qty, type: 'angka', width: 10 },
      { header: 'Penjualan', value: (p) => p.pendapatan, type: 'rupiah', width: 16 },
      { header: 'HPP', value: (p) => p.hpp, type: 'rupiah', width: 16 },
      { header: 'Margin', value: (p) => p.margin, type: 'rupiah', width: 16 },
      { header: 'Margin %', value: (p) => p.margin_persen, type: 'persen', width: 10 },
    ],
  };
  const run = (fn: () => Promise<void>) => void fn().then(() => toast('success', 'File diunduh. Ekspor tercatat di log aktivitas.')).catch((e) => toast('error', errorMessage(e)));

  return (
    <>
      <PageHeader title="Laporan Laba Rugi" description="Pendapatan − HPP bahan = Laba kotor; − Biaya operasional = Laba bersih. Berdasarkan tanggal pesanan selesai." />
      <Card className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end">
        <div className="flex flex-wrap gap-1">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => {
                setPreset(p.key);
                setRange(presetRange(p.key));
              }}
              className={clsx('h-10 rounded-xl px-3 text-sm font-semibold', preset === p.key ? 'bg-cocoa-800 text-white' : 'bg-white ring-1 ring-cream-300')}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label className="flex items-center gap-2">
            Dari
            <input type="date" className="h-10 rounded-xl border border-cream-300 bg-white px-2" value={from} onChange={(e) => { setPreset(''); setRange([e.target.value, to]); }} />
          </label>
          <label className="flex items-center gap-2">
            sampai
            <input type="date" className="h-10 rounded-xl border border-cream-300 bg-white px-2" value={to} onChange={(e) => { setPreset(''); setRange([from, e.target.value]); }} />
          </label>
        </div>
        <div className="flex gap-2 lg:ml-auto">
          <Button variant="secondary" size="sm" icon={<FileSpreadsheet className="size-4" />} disabled={!r} onClick={() => run(() => exportExcel(plSpec))}>
            Excel
          </Button>
          <Button variant="secondary" size="sm" icon={<FileDown className="size-4" />} disabled={!r} onClick={() => run(() => exportPdf(plSpec))}>
            PDF
          </Button>
        </div>
      </Card>
      {to < from ? (
        <EmptyState title="Tanggal akhir harus setelah tanggal awal" />
      ) : q.isLoading ? (
        <LoadingState />
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
      ) : r ? (
        <div className="grid gap-5 lg:grid-cols-[1fr_1.3fr]">
          <Card className="min-w-0">
            <h2 className="font-sans text-lg font-bold">Laba rugi</h2>
            <p className="text-sm text-cocoa-500">
              {periodeText} · {r.jumlah_pesanan} pesanan selesai
            </p>
            <dl className="mt-4 text-sm">
              {lines.map((l) => (
                <div
                  key={l.label}
                  className={clsx(
                    'flex justify-between gap-3 py-1.5',
                    l.level === 'sub' && 'pl-4 text-cocoa-600',
                    l.level === 'total' && 'border-t border-cream-300 font-bold',
                    l.level === 'grand' && 'mt-1 border-t-2 border-cocoa-800 pt-2 text-base font-bold',
                  )}
                >
                  <dt>{l.label}</dt>
                  <dd className={clsx('tabular-nums', l.level === 'grand' && (l.value < 0 ? 'text-red-700' : 'text-emerald-700'))}>
                    {l.negative && l.value !== 0 ? `(${formatRupiah(-l.value)})` : formatRupiah(l.value)}
                  </dd>
                </div>
              ))}
            </dl>
            {r.pendapatan > 0 && (
              <p className="mt-3 text-xs text-cocoa-500">
                Margin kotor {Math.round((r.laba_kotor / r.pendapatan) * 100)}% · margin bersih {Math.round((r.laba_bersih / r.pendapatan) * 100)}%
              </p>
            )}
          </Card>
          <Card className="min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-sans text-lg font-bold">HPP & margin per produk</h2>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" disabled={!r.per_produk?.length} onClick={() => run(() => exportExcel(produkSpec))}>
                  Excel
                </Button>
                <Button variant="ghost" size="sm" disabled={!r.per_produk?.length} onClick={() => run(() => exportPdf(produkSpec))}>
                  PDF
                </Button>
              </div>
            </div>
            {!r.per_produk?.length ? (
              <EmptyState title="Belum ada penjualan di periode ini" />
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs text-cocoa-500 uppercase">
                    <tr>
                      <th className="py-2">Produk</th>
                      <th className="py-2 text-right">Terjual</th>
                      <th className="py-2 text-right">Penjualan</th>
                      <th className="py-2 text-right">HPP</th>
                      <th className="py-2 text-right">Margin</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-cream-200">
                    {r.per_produk.map((p) => (
                      <tr key={p.nama}>
                        <td className="py-2 font-semibold">{p.nama}</td>
                        <td className="py-2 text-right tabular-nums">{p.qty}</td>
                        <td className="py-2 text-right tabular-nums">{formatRupiah(p.pendapatan)}</td>
                        <td className="py-2 text-right tabular-nums">{formatRupiah(p.hpp)}</td>
                        <td className="py-2 text-right tabular-nums">
                          {formatRupiah(p.margin)}
                          <span className="block text-xs text-cocoa-500">{p.margin_persen ?? 0}%</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-3 text-xs text-cocoa-500">Penjualan per produk sebelum diskon; HPP dari snapshot saat pesanan selesai.</p>
          </Card>
        </div>
      ) : null}
    </>
  );
}
