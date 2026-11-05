import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/errors';
import { formatDateTime, formatRupiah } from '@/lib/format';
import { formatPhone } from '@/lib/phone';
import { ilikeValue } from '@/lib/postgrest';
import { FULFILLMENT_LABEL, STATUS_LABEL } from '@/lib/orders';
import type { OrderStatus, Tables } from '@/lib/database.types';
import { StatusBadge } from '@/components/order/OrderParts';
import { Badge, PageHeader } from '@/components/ui/Card';
import { DataTable, Pagination, SearchInput, type Column } from '@/components/ui/Table';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';

type Row = Pick<Tables<'orders'>, 'id' | 'kode' | 'nama_pemesan' | 'no_hp' | 'status' | 'payment_status' | 'fulfillment' | 'jadwal' | 'total' | 'ongkir_diset' | 'created_at' | 'user_id'>;
const PAGE_SIZE = 20;
const TABS: { key: '' | OrderStatus; label: string }[] = [
  { key: '', label: 'Semua' },
  { key: 'menunggu_konfirmasi', label: 'Menunggu' },
  { key: 'dikonfirmasi', label: 'Dikonfirmasi' },
  { key: 'siap', label: 'Siap' },
  { key: 'selesai', label: 'Selesai' },
  { key: 'dibatalkan', label: 'Batal' },
];

export function Orders() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') ?? '') as '' | OrderStatus;
  const [search, setSearch] = useState('');
  const [fulfillment, setFulfillment] = useState('');
  const [tanggal, setTanggal] = useState('');
  const [page, setPage] = useState(1);

  const counts = useQuery({
    queryKey: ['orders', 'counts'],
    refetchInterval: 30_000,
    queryFn: async () => {
      const res = await Promise.all(
        (['menunggu_konfirmasi', 'dikonfirmasi', 'siap'] as OrderStatus[]).map((s) =>
          supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', s),
        ),
      );
      return { menunggu_konfirmasi: res[0].count ?? 0, dikonfirmasi: res[1].count ?? 0, siap: res[2].count ?? 0 } as Partial<Record<OrderStatus, number>>;
    },
  });

  const q = useQuery({
    queryKey: ['orders', 'list', status, search, fulfillment, tanggal, page],
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
    queryFn: async () => {
      let query = supabase
        .from('orders')
        .select('id, kode, nama_pemesan, no_hp, status, payment_status, fulfillment, jadwal, total, ongkir_diset, created_at, user_id', { count: 'exact' });
      if (status) query = query.eq('status', status);
      if (fulfillment) query = query.eq('fulfillment', fulfillment as 'ambil' | 'antar');
      if (tanggal) {
        const start = new Date(`${tanggal}T00:00:00`);
        const end = new Date(start.getTime() + 86_400_000);
        query = query.gte('jadwal', start.toISOString()).lt('jadwal', end.toISOString());
      }
      if (search.trim()) {
        const s = ilikeValue(search);
        const digits = search.replace(/\D/g, '').replace(/^0/, '62');
        query = query.or(`kode.ilike.${s},nama_pemesan.ilike.${s}${digits.length >= 4 ? `,no_hp.ilike.${ilikeValue(digits)}` : ''}`);
      }
      const from = (page - 1) * PAGE_SIZE;
      // Antrean aktif diurutkan berdasarkan jadwal terdekat; riwayat dari yang terbaru.
      const active = status === 'menunggu_konfirmasi' || status === 'dikonfirmasi' || status === 'siap';
      const { data, error, count } = await query.order(active ? 'jadwal' : 'created_at', { ascending: active }).range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      return { rows: data as Row[], total: count ?? 0 };
    },
  });

  const columns: Column<Row>[] = [
    {
      key: 'kode',
      header: 'Pesanan',
      cell: (o) => (
        <div className="text-left">
          <p className="font-semibold">{o.kode}</p>
          <p className="text-xs text-cocoa-500">{formatDateTime(o.created_at)}</p>
        </div>
      ),
    },
    {
      key: 'pelanggan',
      header: 'Pelanggan',
      cell: (o) => (
        <div className="text-left">
          <p>
            {o.nama_pemesan} {o.user_id ? <Badge tone="brand">Member</Badge> : null}
          </p>
          <p className="text-xs text-cocoa-500">{formatPhone(o.no_hp)}</p>
        </div>
      ),
    },
    {
      key: 'jadwal',
      header: 'Jadwal',
      cell: (o) => (
        <div className="text-left">
          <p className="whitespace-nowrap">{formatDateTime(o.jadwal)}</p>
          <p className="text-xs text-cocoa-500">{FULFILLMENT_LABEL[o.fulfillment]}</p>
        </div>
      ),
    },
    {
      key: 'total',
      header: 'Total',
      cell: (o) => (
        <div className="text-right">
          <p className="font-semibold tabular-nums">{formatRupiah(o.total)}</p>
          {o.fulfillment === 'antar' && !o.ongkir_diset && <p className="text-xs text-amber-700">Ongkir belum diisi</p>}
        </div>
      ),
      className: 'text-right',
    },
    {
      key: 'status',
      header: 'Status',
      cell: (o) => (
        <div className="flex flex-col items-end gap-1 md:items-start">
          <StatusBadge status={o.status} />
          <span className="text-xs text-cocoa-500">{o.payment_status === 'lunas' ? 'Lunas' : 'Belum bayar'}</span>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="Pesanan" description="Konfirmasi pembayaran, isi ongkir, dan perbarui status pesanan." />
      <div className="-mx-4 mb-4 flex gap-1 overflow-x-auto px-4 pb-1" role="tablist">
        {TABS.map((t) => {
          const n = t.key ? counts.data?.[t.key] : undefined;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={status === t.key}
              onClick={() => {
                setParams(t.key ? { status: t.key } : {});
                setPage(1);
              }}
              className={clsx(
                'flex h-10 shrink-0 items-center gap-2 rounded-xl px-4 text-sm font-semibold transition',
                status === t.key ? 'bg-cocoa-800 text-white' : 'bg-white text-cocoa-700 ring-1 ring-cream-300 hover:bg-cream-50',
              )}
            >
              {t.label}
              {n ? <span className={clsx('rounded-full px-1.5 text-xs', status === t.key ? 'bg-white/20' : 'bg-brand-100 text-brand-700')}>{n}</span> : null}
            </button>
          );
        })}
      </div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <SearchInput
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder="Cari kode, nama, atau nomor HP"
        />
        <select className="h-11 rounded-xl border border-cream-300 bg-white px-3 text-sm" value={fulfillment} onChange={(e) => { setFulfillment(e.target.value); setPage(1); }} aria-label="Filter pengambilan">
          <option value="">Ambil & antar</option>
          <option value="ambil">Ambil di toko</option>
          <option value="antar">Diantar</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-cocoa-600">
          Jadwal
          <input type="date" className="h-11 rounded-xl border border-cream-300 bg-white px-3" value={tanggal} onChange={(e) => { setTanggal(e.target.value); setPage(1); }} />
        </label>
      </div>
      {q.isLoading ? (
        <LoadingState />
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
      ) : !q.data?.rows.length ? (
        <EmptyState title={status ? `Tidak ada pesanan ${STATUS_LABEL[status].toLowerCase()}` : 'Belum ada pesanan'} description={search || tanggal || fulfillment ? 'Coba ubah filter.' : undefined} />
      ) : (
        <>
          <DataTable rows={q.data.rows} columns={columns} rowKey={(o) => o.id} onRowClick={(o) => navigate(`/dashboard/pesanan/${o.id}`)} />
          <Pagination page={page} pageSize={PAGE_SIZE} total={q.data.total} onPage={setPage} />
        </>
      )}
    </>
  );
}
