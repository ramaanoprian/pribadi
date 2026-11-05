import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { Crown, MessageCircle, Moon, Repeat, UserPlus, Users } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/errors';
import { formatDate, formatRupiah } from '@/lib/format';
import { formatPhone } from '@/lib/phone';
import { presetRange } from '@/lib/finance';
import { comeBackLink, type AnalyticsSummary, type RankingRow } from '@/lib/analytics';
import { exportExcel, exportPdf, type ExportSpec } from '@/lib/export';
import { settingValue, useSettings } from '@/hooks/useSettings';
import { Badge, Card, PageHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { DataTable, Pagination, SearchInput, type Column } from '@/components/ui/Table';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';

const PERIODS = [
  { key: 'semua', label: 'Semua waktu' },
  { key: 'bulan_ini', label: 'Bulan ini' },
  { key: 'bulan_lalu', label: 'Bulan lalu' },
  { key: '3_bulan', label: '3 bulan' },
  { key: 'tahun_ini', label: 'Tahun ini' },
];
const STATUS = [
  { key: 'semua', label: 'Semua' },
  { key: 'repeat', label: 'Repeat order' },
  { key: 'vip', label: 'VIP' },
  { key: 'baru', label: 'Baru' },
  { key: 'tidur', label: 'Tidur' },
];
const PAGE = 20;

function Stat({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: React.ReactNode; hint?: string }) {
  return (
    <Card className="flex items-start gap-3">
      <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">{icon}</div>
      <div>
        <p className="text-sm text-cocoa-600">{label}</p>
        <p className="text-2xl font-bold tabular-nums">{value}</p>
        {hint && <p className="text-xs text-cocoa-500">{hint}</p>}
      </div>
    </Card>
  );
}

export function CustomerAnalytics() {
  const navigate = useNavigate();
  const toast = useToast();
  const settings = useSettings();
  const storeName = settingValue<string>(settings.data, 'toko.nama', 'GutVibes');
  const siteUrl = settingValue<string>(settings.data, 'toko.url_situs', window.location.origin);
  const [period, setPeriod] = useState('semua');
  const [jenis, setJenis] = useState('');
  const [status, setStatus] = useState('semua');
  const [sort, setSort] = useState<'jumlah' | 'total'>('jumlah');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [from, to] = period === 'semua' ? [null, null] : presetRange(period);

  const summary = useQuery({
    queryKey: ['customer_summary', from, to],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('customer_analytics_summary', { p_from: from, p_to: to });
      if (error) throw error;
      return data as unknown as AnalyticsSummary;
    },
  });
  const args = { p_from: from, p_to: to, p_jenis: jenis || null, p_status: status, p_search: search || null, p_sort: sort };
  const q = useQuery({
    queryKey: ['customer_ranking', args, page],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('customer_ranking', { ...args, p_limit: PAGE, p_offset: (page - 1) * PAGE });
      if (error) throw error;
      return data as unknown as { total: number; rows: RankingRow[] };
    },
  });
  const reset = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setPage(1);
  };

  const doExport = async (kind: 'xlsx' | 'pdf') => {
    const { data, error } = await supabase.rpc('customer_ranking', { ...args, p_limit: 1000, p_offset: 0 });
    if (error) throw error;
    const rows = (data as unknown as { rows: RankingRow[] }).rows;
    const spec: ExportSpec<RankingRow> = {
      judul: 'Peringkat Pelanggan — GutVibes',
      subjudul: `${PERIODS.find((p) => p.key === period)?.label}${from ? ` (${formatDate(from)} – ${formatDate(to)})` : ''} · urut ${sort === 'total' ? 'total belanja' : 'jumlah pesanan'}`,
      namaFile: `peringkat-pelanggan-${new Date().toISOString().slice(0, 10)}`,
      entitas: 'analisis_pelanggan',
      baris: rows,
      kolom: [
        { header: 'Nama', value: (r) => r.nama, width: 22 },
        { header: 'Jenis', value: (r) => (r.jenis === 'member' ? 'Member' : 'Tamu'), width: 10 },
        { header: 'Pesanan', value: (r) => r.jumlah_periode, type: 'angka', width: 10 },
        { header: 'Total belanja', value: (r) => r.total_periode, type: 'rupiah', width: 16 },
        { header: 'Pesanan terakhir', value: (r) => formatDate(r.pesanan_terakhir), width: 18 },
        { header: 'Produk favorit', value: (r) => r.produk_favorit ?? '-', width: 20 },
      ],
    };
    await (kind === 'xlsx' ? exportExcel(spec) : exportPdf(spec));
  };

  const columns: Column<RankingRow>[] = [
    {
      key: 'nama',
      header: 'Pelanggan',
      cell: (r) => (
        <div className="text-left">
          <p className="flex flex-wrap items-center gap-1.5 font-semibold">
            {r.nama}
            {r.is_vip && (
              <Badge tone="amber" className="gap-1">
                <Crown className="size-3" /> VIP
              </Badge>
            )}
            {r.is_tidur && (
              <Badge className="gap-1">
                <Moon className="size-3" /> Tidur
              </Badge>
            )}
          </p>
          <p className="text-xs text-cocoa-500">{formatPhone(r.no_hp)}</p>
        </div>
      ),
    },
    { key: 'jenis', header: 'Jenis', cell: (r) => (r.jenis === 'member' ? <Badge tone="brand">Member</Badge> : <Badge>Tamu</Badge>) },
    { key: 'jumlah', header: 'Pesanan', className: 'text-right', cell: (r) => <span className="font-semibold tabular-nums">{r.jumlah_periode}</span> },
    { key: 'total', header: 'Total belanja', className: 'text-right', cell: (r) => <span className="tabular-nums">{formatRupiah(r.total_periode)}</span> },
    { key: 'terakhir', header: 'Pesanan terakhir', cell: (r) => <span className="whitespace-nowrap">{formatDate(r.pesanan_terakhir)}</span> },
    { key: 'fav', header: 'Produk favorit', cell: (r) => r.produk_favorit ?? '-' },
    {
      key: 'aksi',
      header: '',
      className: 'text-right',
      cell: (r) => {
        const link = comeBackLink(r, storeName, siteUrl);
        return link ? (
          <a
            href={link}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-emerald-600 px-3 text-sm font-semibold whitespace-nowrap text-white hover:bg-emerald-700"
          >
            <MessageCircle className="size-4" /> Ajak kembali
          </a>
        ) : null;
      },
    },
  ];

  const s = summary.data;
  const chip = (on: boolean) => clsx('h-9 shrink-0 rounded-xl px-3 text-sm font-semibold', on ? 'bg-cocoa-800 text-white' : 'bg-white ring-1 ring-cream-300');

  return (
    <>
      <PageHeader title="Analisis Pelanggan" description="Dihitung dari pesanan selesai saja. Klik baris untuk melihat profil pelanggan." />
      <div className="-mx-4 mb-4 flex gap-1 overflow-x-auto px-4 pb-1">
        {PERIODS.map((p) => (
          <button key={p.key} className={chip(period === p.key)} onClick={() => reset(setPeriod)(p.key)}>
            {p.label}
          </button>
        ))}
      </div>
      {summary.isError ? (
        <ErrorState message={errorMessage(summary.error)} onRetry={() => void summary.refetch()} />
      ) : (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat icon={<Users className="size-5" />} label="Pelanggan aktif" value={s?.aktif ?? '…'} hint={s ? `${s.member} member · ${s.tamu} tamu` : undefined} />
          <Stat icon={<UserPlus className="size-5" />} label="Baru vs kembali" value={s ? `${s.baru} / ${s.kembali}` : '…'} hint="pertama kali di periode ini / pelanggan lama" />
          <Stat
            icon={<Repeat className="size-5" />}
            label="Repeat order"
            value={s ? `${s.repeat_rate}%` : '…'}
            hint={s ? `${s.repeat} pelanggan ≥ 2 pesanan · rata-rata ${s.rata_rata_pesanan} pesanan` : undefined}
          />
          <Stat icon={<Moon className="size-5" />} label="Tidur / VIP" value={s ? `${s.tidur} / ${s.vip}` : '…'} hint={s ? `tidur > ${s.hari_tidur} hari · VIP ≥ ${s.ambang_vip} pesanan` : undefined} />
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-1" role="group" aria-label="Filter status pelanggan">
          {STATUS.map((st) => (
            <button key={st.key} className={chip(status === st.key)} onClick={() => reset(setStatus)(st.key)}>
              {st.label}
            </button>
          ))}
        </div>
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <SearchInput value={search} onChange={reset(setSearch)} placeholder="Cari nama atau nomor HP" />
        <select className="h-11 rounded-xl border border-cream-300 bg-white px-3 text-sm" value={jenis} onChange={(e) => reset(setJenis)(e.target.value)} aria-label="Jenis pelanggan">
          <option value="">Member & tamu</option>
          <option value="member">Member</option>
          <option value="tamu">Tamu</option>
        </select>
        <select className="h-11 rounded-xl border border-cream-300 bg-white px-3 text-sm" value={sort} onChange={(e) => reset(setSort)(e.target.value as 'jumlah' | 'total')} aria-label="Urutkan">
          <option value="jumlah">Urut: jumlah pesanan</option>
          <option value="total">Urut: total belanja</option>
        </select>
        <div className="flex gap-2 lg:ml-auto">
          <Button size="sm" variant="secondary" disabled={!q.data?.rows.length} onClick={() => void doExport('xlsx').then(() => toast('success', 'File diunduh.')).catch((e) => toast('error', errorMessage(e)))}>
            Excel
          </Button>
          <Button size="sm" variant="secondary" disabled={!q.data?.rows.length} onClick={() => void doExport('pdf').then(() => toast('success', 'File diunduh.')).catch((e) => toast('error', errorMessage(e)))}>
            PDF
          </Button>
        </div>
      </div>

      {q.isLoading ? (
        <LoadingState />
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
      ) : !q.data?.rows.length ? (
        <EmptyState title="Tidak ada pelanggan yang cocok" description="Coba ubah periode atau filter." />
      ) : (
        <>
          <DataTable rows={q.data.rows} columns={columns} rowKey={(r) => r.id} onRowClick={(r) => navigate(`/dashboard/pelanggan/${r.id}`)} />
          <Pagination page={page} pageSize={PAGE} total={q.data.total} onPage={setPage} />
        </>
      )}
      <p className="mt-3 text-xs text-cocoa-500">“Ajak kembali” membuka WhatsApp dengan pesan personal untuk dikirim manual — bukan pesan massal otomatis.</p>
    </>
  );
}
