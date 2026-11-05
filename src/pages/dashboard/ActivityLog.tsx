import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';
import { ilikeValue } from '@/lib/postgrest';
import { ROLE_LABEL } from '@/lib/permissions';
import type { AppRole, Tables } from '@/lib/database.types';
import { Badge, PageHeader } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { DataTable, Pagination, SearchInput, type Column } from '@/components/ui/Table';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { describeAudit, ENTITAS_LABEL } from './auditText';

type Log = Tables<'audit_logs'>;
const PAGE_SIZE = 25;

export function ActivityLog() {
  const [search, setSearch] = useState('');
  const [entitas, setEntitas] = useState('');
  const [dari, setDari] = useState('');
  const [sampai, setSampai] = useState('');
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<Log | null>(null);

  const q = useQuery({
    queryKey: ['audit_logs', search, entitas, dari, sampai, page],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let query = supabase.from('audit_logs').select('*', { count: 'exact' });
      if (entitas) query = query.eq('entitas', entitas);
      if (dari) query = query.gte('created_at', new Date(`${dari}T00:00:00`).toISOString());
      if (sampai) query = query.lte('created_at', new Date(`${sampai}T23:59:59.999`).toISOString());
      if (search.trim()) {
        const s = ilikeValue(search);
        query = query.or(`aksi.ilike.${s},actor_nama.ilike.${s},entitas_id.ilike.${s},alasan.ilike.${s}`);
      }
      const from = (page - 1) * PAGE_SIZE;
      const { data, error, count } = await query.order('created_at', { ascending: false }).range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      return { rows: data, total: count ?? 0 };
    },
  });

  const resetPage = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setPage(1);
  };

  const columns: Column<Log>[] = [
    { key: 'waktu', header: 'Waktu', cell: (l) => <span className="whitespace-nowrap text-cocoa-600">{formatDateTime(l.created_at)}</span> },
    {
      key: 'pelaku',
      header: 'Pelaku',
      cell: (l) => (
        <div className="text-left">
          <p className="font-semibold">{l.actor_nama ?? 'Sistem'}</p>
          {l.actor_role && l.actor_role !== 'sistem' && <p className="text-xs text-cocoa-500">{ROLE_LABEL[l.actor_role as AppRole] ?? l.actor_role}</p>}
        </div>
      ),
    },
    { key: 'entitas', header: 'Modul', cell: (l) => <Badge>{ENTITAS_LABEL[l.entitas] ?? l.entitas}</Badge> },
    {
      key: 'aksi',
      header: 'Aktivitas',
      cell: (l) => (
        <div className="text-left">
          <p>{describeAudit(l)}</p>
          {l.alasan && <p className="text-xs text-cocoa-500">Alasan: {l.alasan}</p>}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="Log Aktivitas" description="Jejak perubahan penting: peran & akun, pengaturan, harga/stok/status (fase berikutnya), ekspor data. Log tidak bisa diubah atau dihapus." />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SearchInput value={search} onChange={resetPage(setSearch)} placeholder="Cari pelaku, aksi, alasan…" />
        <select className="h-11 rounded-xl border border-cream-300 bg-white px-3 text-sm" value={entitas} onChange={(e) => resetPage(setEntitas)(e.target.value)} aria-label="Filter modul">
          <option value="">Semua modul</option>
          {Object.entries(ENTITAS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-cocoa-600">
          Dari
          <input type="date" className="h-11 flex-1 rounded-xl border border-cream-300 bg-white px-3" value={dari} onChange={(e) => resetPage(setDari)(e.target.value)} />
        </label>
        <label className="flex items-center gap-2 text-sm text-cocoa-600">
          Sampai
          <input type="date" className="h-11 flex-1 rounded-xl border border-cream-300 bg-white px-3" value={sampai} onChange={(e) => resetPage(setSampai)(e.target.value)} />
        </label>
      </div>
      {q.isLoading ? (
        <LoadingState />
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
      ) : !q.data?.rows.length ? (
        <EmptyState title="Tidak ada aktivitas" description={search || entitas || dari || sampai ? 'Coba ubah filter.' : undefined} />
      ) : (
        <>
          <DataTable rows={q.data.rows} columns={columns} rowKey={(l) => String(l.id)} onRowClick={setDetail} />
          <Pagination page={page} pageSize={PAGE_SIZE} total={q.data.total} onPage={setPage} />
        </>
      )}
      <Modal open={detail !== null} onClose={() => setDetail(null)} title="Detail aktivitas">
        {detail && (
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-cocoa-500">Waktu</dt>
              <dd>{formatDateTime(detail.created_at)}</dd>
            </div>
            <div>
              <dt className="text-cocoa-500">Aksi</dt>
              <dd className="font-mono text-xs">
                {detail.aksi} · {detail.entitas} {detail.entitas_id}
              </dd>
            </div>
            {detail.alasan && (
              <div>
                <dt className="text-cocoa-500">Alasan</dt>
                <dd>{detail.alasan}</dd>
              </div>
            )}
            {(['data_lama', 'data_baru', 'meta'] as const).map((k) =>
              detail[k] ? (
                <div key={k}>
                  <dt className="text-cocoa-500">{k === 'data_lama' ? 'Sebelum' : k === 'data_baru' ? 'Sesudah' : 'Info'}</dt>
                  <dd>
                    <pre className="overflow-x-auto rounded-lg bg-cream-100 p-2 text-xs">{JSON.stringify(detail[k], null, 2)}</pre>
                  </dd>
                </div>
              ) : null,
            )}
          </dl>
        )}
      </Modal>
    </>
  );
}
