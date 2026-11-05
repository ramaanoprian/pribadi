import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Crown, Pencil } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/auth/AuthProvider';
import { errorMessage } from '@/lib/errors';
import { formatDate, formatDateTime, formatRupiah } from '@/lib/format';
import { formatPhone, normalizePhone } from '@/lib/phone';
import { ilikeValue } from '@/lib/postgrest';
import type { Tables } from '@/lib/database.types';
import { StatusBadge } from '@/components/order/OrderParts';
import { Badge, Card, PageHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Checkbox, Input } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { DataTable, Pagination, SearchInput, type Column } from '@/components/ui/Table';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { useNavigate } from 'react-router-dom';
import { CustomerLoyalty } from './loyalty/CustomerLoyalty';

type Customer = Tables<'customers'>;
const PAGE_SIZE = 20;

export function Customers() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [jenis, setJenis] = useState<'' | 'member' | 'tamu'>('');
  const [page, setPage] = useState(1);

  const q = useQuery({
    queryKey: ['customers', search, jenis, page],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let query = supabase.from('customers').select('*', { count: 'exact' });
      if (jenis === 'member') query = query.not('user_id', 'is', null);
      if (jenis === 'tamu') query = query.is('user_id', null);
      if (search.trim()) {
        const digits = search.replace(/\D/g, '').replace(/^0/, '62');
        query = query.or(`nama.ilike.${ilikeValue(search)}${digits.length >= 4 ? `,phone_normalized.ilike.${ilikeValue(digits)}` : ''}`);
      }
      const from = (page - 1) * PAGE_SIZE;
      const { data, error, count } = await query.order('created_at', { ascending: false }).range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      return { rows: data, total: count ?? 0 };
    },
  });

  const columns: Column<Customer>[] = [
    {
      key: 'nama',
      header: 'Nama',
      cell: (c) => (
        <span className="font-semibold">
          {c.nama} {c.is_vip && <Crown className="inline size-4 text-amber-500" aria-label="VIP" />}
        </span>
      ),
    },
    { key: 'hp', header: 'Nomor HP', cell: (c) => <span className="whitespace-nowrap">{formatPhone(c.phone_normalized)}</span> },
    { key: 'jenis', header: 'Jenis', cell: (c) => (c.user_id ? <Badge tone="brand">Member</Badge> : <Badge>Tamu</Badge>) },
    { key: 'sejak', header: 'Pelanggan sejak', cell: (c) => formatDate(c.created_at) },
  ];

  return (
    <>
      <PageHeader title="Pelanggan" description="Kontak pelanggan (member & tamu), digabung per nomor HP." />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Cari nama atau nomor HP" />
        <select className="h-11 rounded-xl border border-cream-300 bg-white px-3 text-sm" value={jenis} onChange={(e) => { setJenis(e.target.value as typeof jenis); setPage(1); }} aria-label="Filter jenis">
          <option value="">Member & tamu</option>
          <option value="member">Member</option>
          <option value="tamu">Tamu</option>
        </select>
      </div>
      {q.isLoading ? (
        <LoadingState />
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
      ) : !q.data?.rows.length ? (
        <EmptyState title={search || jenis ? 'Tidak ada yang cocok' : 'Belum ada pelanggan'} />
      ) : (
        <>
          <DataTable rows={q.data.rows} columns={columns} rowKey={(c) => c.id} onRowClick={(c) => navigate(`/dashboard/pelanggan/${c.id}`)} />
          <Pagination page={page} pageSize={PAGE_SIZE} total={q.data.total} onPage={setPage} />
        </>
      )}
    </>
  );
}

export function CustomerDetail() {
  const { id } = useParams();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [editOpen, setEditOpen] = useState(false);
  const q = useQuery({
    queryKey: ['customers', 'detail', id],
    queryFn: async () => {
      const [c, o] = await Promise.all([
        supabase.from('customers').select('*').eq('id', id!).maybeSingle(),
        supabase.from('orders').select('id, kode, status, total, created_at, fulfillment').eq('customer_id', id!).order('created_at', { ascending: false }).limit(50),
      ]);
      if (c.error) throw c.error;
      if (o.error) throw o.error;
      return { customer: c.data, orders: o.data };
    },
  });
  if (q.isLoading) return <LoadingState />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />;
  const c = q.data?.customer;
  if (!c) return <ErrorState message="Pelanggan tidak ditemukan." />;

  return (
    <>
      <Link to="/dashboard/pelanggan" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-cocoa-600 hover:text-brand-600">
        <ArrowLeft className="size-4" /> Pelanggan
      </Link>
      <PageHeader
        title={c.nama}
        description={`${formatPhone(c.phone_normalized)} · ${c.user_id ? 'Member' : 'Tamu'}${c.is_vip ? ' · VIP' : ''}`}
        actions={
          <Button variant="secondary" icon={<Pencil className="size-4" />} onClick={() => setEditOpen(true)}>
            Ubah kontak
          </Button>
        }
      />
      {c.user_id && <CustomerLoyalty customerId={c.id} />}
      <Card>
        <h2 className="font-sans font-bold">Pesanan ({q.data!.orders.length})</h2>
        {q.data!.orders.length === 0 ? (
          <p className="mt-2 text-sm text-cocoa-500">Belum ada pesanan.</p>
        ) : (
          <ul className="mt-3 divide-y divide-cream-200">
            {q.data!.orders.map((o) => (
              <li key={o.id}>
                <button className="flex w-full items-center justify-between gap-3 py-3 text-left hover:bg-cream-50" onClick={() => navigate(`/dashboard/pesanan/${o.id}`)}>
                  <span>
                    <span className="font-semibold">{o.kode}</span>
                    <span className="block text-xs text-cocoa-500">{formatDateTime(o.created_at)}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="tabular-nums">{formatRupiah(o.total)}</span>
                    <StatusBadge status={o.status} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {editOpen && <EditCustomerModal customer={c} canVip={profile?.role === 'owner'} onClose={() => setEditOpen(false)} />}
    </>
  );
}

function EditCustomerModal({ customer, canVip, onClose }: { customer: Customer; canVip: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [nama, setNama] = useState(customer.nama);
  const [hp, setHp] = useState(formatPhone(customer.phone_normalized));
  const [vip, setVip] = useState(customer.is_vip);
  const [error, setError] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: async () => {
      const phone = normalizePhone(hp);
      if (!phone) throw new Error('Nomor HP tidak valid.');
      const payload: { nama: string; phone_normalized: string; is_vip?: boolean } = { nama: nama.trim(), phone_normalized: phone };
      if (canVip) payload.is_vip = vip;
      const { error } = await supabase.from('customers').update(payload).eq('id', customer.id);
      if (error) throw error.code === '23505' ? new Error('Nomor HP sudah dipakai pelanggan lain.') : error;
    },
    onSuccess: () => {
      toast('success', 'Kontak tersimpan.');
      void qc.invalidateQueries({ queryKey: ['customers'] });
      onClose();
    },
    onError: (e) => setError(errorMessage(e)),
  });
  return (
    <Modal
      open
      onClose={onClose}
      title="Ubah kontak pelanggan"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Batal
          </Button>
          <Button loading={m.isPending} onClick={() => m.mutate()}>
            Simpan
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <Input label="Nama" value={nama} onChange={(e) => setNama(e.target.value)} maxLength={120} />
        <Input label="Nomor HP" type="tel" value={hp} onChange={(e) => setHp(e.target.value)} />
        {canVip && <Checkbox label="Tandai VIP (manual)" checked={vip} onChange={(e) => setVip(e.target.checked)} />}
      </div>
    </Modal>
  );
}
