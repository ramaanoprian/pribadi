import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/auth/AuthProvider';
import { errorMessage } from '@/lib/errors';
import { formatDateTime, formatRupiah } from '@/lib/format';
import { formatQty } from '@/lib/production';
import type { Tables } from '@/lib/database.types';
import { Badge, PageHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { DataTable, Pagination, type Column } from '@/components/ui/Table';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';

type Log = Tables<'production_logs'>;
const PAGE_SIZE = 20;

export function ProductionHistory() {
  const { profile } = useAuth();
  const canCancel = profile?.role === 'owner' || profile?.role === 'admin';
  const isOwner = profile?.role === 'owner';
  const [tanggal, setTanggal] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [cancelling, setCancelling] = useState<Log | null>(null);

  const q = useQuery({
    queryKey: ['production_logs', tanggal, status, page],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let query = supabase
        .from('production_logs')
        .select('id, product_id, nama_produk, batches, total_output, bahan_kurang, status, created_by, created_at, cancelled_by, cancelled_at, alasan', { count: 'exact' });
      if (status) query = query.eq('status', status as 'aktif' | 'dibatalkan');
      if (tanggal) {
        const start = new Date(`${tanggal}T00:00:00`);
        query = query.gte('created_at', start.toISOString()).lt('created_at', new Date(start.getTime() + 86_400_000).toISOString());
      }
      const from = (page - 1) * PAGE_SIZE;
      const { data, error, count } = await query.order('created_at', { ascending: false }).range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      const ids = [...new Set(data.flatMap((l) => [l.created_by, l.cancelled_by]).filter(Boolean) as string[])];
      const [names, costs] = await Promise.all([
        ids.length ? supabase.from('nama_staf').select('id, nama').in('id', ids) : Promise.resolve({ data: [] as { id: string; nama: string }[] }),
        isOwner && data.length ? supabase.from('biaya_produksi').select('id, hpp_snapshot, hpp_per_unit').in('id', data.map((l) => l.id)) : Promise.resolve({ data: [] as { id: string; hpp_snapshot: number; hpp_per_unit: number }[] }),
      ]);
      return {
        rows: data as Log[],
        total: count ?? 0,
        names: new Map((names.data ?? []).map((n) => [n.id, n.nama])),
        costs: new Map((costs.data ?? []).map((c) => [c.id, c])),
      };
    },
  });

  const columns: Column<Log>[] = [
    { key: 'waktu', header: 'Waktu', cell: (l) => <span className="whitespace-nowrap">{formatDateTime(l.created_at)}</span> },
    {
      key: 'produk',
      header: 'Produk',
      cell: (l) => (
        <div className="text-left">
          <p className="font-semibold">{l.nama_produk}</p>
          <p className="text-xs text-cocoa-500">
            {l.batches} batch = {formatQty(l.total_output)}
          </p>
        </div>
      ),
    },
    { key: 'oleh', header: 'Diinput oleh', cell: (l) => q.data?.names.get(l.created_by) ?? '-' },
    ...(isOwner
      ? [{ key: 'hpp', header: 'HPP / unit', cell: (l: Log) => <span className="tabular-nums">{q.data?.costs.get(l.id) ? formatRupiah(Number(q.data.costs.get(l.id)!.hpp_per_unit)) : '-'}</span> }]
      : []),
    {
      key: 'status',
      header: 'Status',
      cell: (l) => (
        <div className="flex flex-col items-end gap-1 md:items-start">
          {l.status === 'aktif' ? <Badge tone="green">Aktif</Badge> : <Badge tone="red">Dibatalkan</Badge>}
          {l.bahan_kurang && <Badge tone="amber">Bahan kurang</Badge>}
          {l.alasan && <span className="text-xs text-cocoa-500">Alasan: {l.alasan}</span>}
        </div>
      ),
    },
    ...(canCancel
      ? [
          {
            key: 'aksi',
            header: '',
            className: 'text-right',
            cell: (l: Log) =>
              l.status === 'aktif' ? (
                <Button size="sm" variant="ghost" icon={<Ban className="size-4" />} onClick={() => setCancelling(l)}>
                  Batalkan
                </Button>
              ) : null,
          },
        ]
      : []),
  ];

  return (
    <>
      <PageHeader
        title="Riwayat Produksi"
        description={canCancel ? 'Semua input produksi. Pembatalan mengembalikan stok bahan dan mengurangi stok produk jadi.' : 'Input produksi Anda (hanya bisa dilihat).'}
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <label className="flex items-center gap-2 text-sm text-cocoa-600">
          Tanggal
          <input type="date" className="h-11 rounded-xl border border-cream-300 bg-white px-3" value={tanggal} onChange={(e) => { setTanggal(e.target.value); setPage(1); }} />
        </label>
        <select className="h-11 rounded-xl border border-cream-300 bg-white px-3 text-sm" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Filter status">
          <option value="">Semua status</option>
          <option value="aktif">Aktif</option>
          <option value="dibatalkan">Dibatalkan</option>
        </select>
      </div>
      {q.isLoading ? (
        <LoadingState />
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
      ) : !q.data?.rows.length ? (
        <EmptyState title="Belum ada data produksi" />
      ) : (
        <>
          <DataTable rows={q.data.rows} columns={columns} rowKey={(l) => l.id} />
          <Pagination page={page} pageSize={PAGE_SIZE} total={q.data.total} onPage={setPage} />
        </>
      )}
      {cancelling && <CancelProductionModal log={cancelling} onClose={() => setCancelling(null)} />}
    </>
  );
}

function CancelProductionModal({ log, onClose }: { log: Log; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [alasan, setAlasan] = useState('');
  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('cancel_production', { p_id: log.id, p_alasan: alasan });
      if (error) throw error;
    },
    onSuccess: () => {
      toast('success', 'Produksi dibatalkan, stok dikembalikan.');
      for (const k of ['production_logs', 'production_today', 'ingredients', 'products']) void qc.invalidateQueries({ queryKey: [k] });
      onClose();
    },
    onError: (e) => toast('error', errorMessage(e)),
  });
  return (
    <Modal
      open
      onClose={onClose}
      title="Batalkan produksi?"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Kembali
          </Button>
          <Button variant="danger" loading={m.isPending} disabled={alasan.trim().length < 3} onClick={() => m.mutate()}>
            Batalkan produksi
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <p>
          {log.batches} batch {log.nama_produk} ({formatQty(log.total_output)}) — {formatDateTime(log.created_at)}
        </p>
        <Textarea label="Alasan" value={alasan} onChange={(e) => setAlasan(e.target.value)} maxLength={300} required hint="Wajib. Tercatat di log aktivitas." />
      </div>
    </Modal>
  );
}
