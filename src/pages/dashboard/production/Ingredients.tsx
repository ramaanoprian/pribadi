import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { History, Pencil, Plus, ShoppingCart, SlidersHorizontal } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/auth/AuthProvider';
import { errorMessage } from '@/lib/errors';
import { formatDateTime, formatRupiah } from '@/lib/format';
import { formatQty, ingredientStatus } from '@/lib/production';
import type { Tables } from '@/lib/database.types';
import { Badge, PageHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Checkbox, Input } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { DataTable, SearchInput, type Column } from '@/components/ui/Table';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';

type Ingredient = Tables<'ingredients'>;
const JENIS: Record<string, string> = { produksi: 'Produksi', batal_produksi: 'Batal produksi', belanja: 'Belanja', koreksi: 'Koreksi' };

export function Ingredients() {
  const { profile } = useAuth();
  const canEdit = profile?.role === 'owner' || profile?.role === 'admin';
  const isOwner = profile?.role === 'owner';
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');
  const [modal, setModal] = useState<{ type: 'form' | 'belanja' | 'koreksi' | 'riwayat'; item: Ingredient | null } | null>(null);

  const q = useQuery({
    queryKey: ['ingredients', isOwner],
    queryFn: async () => {
      const { data, error } = await supabase.from('ingredients').select('id, nama, satuan, stok, min_stock, aktif, created_at, updated_at').order('nama');
      if (error) throw error;
      const costs = isOwner ? await supabase.from('biaya_bahan').select('id, cost_per_unit') : { data: [] as { id: string; cost_per_unit: number }[] };
      return { rows: data as Ingredient[], costs: new Map((costs.data ?? []).map((c) => [c.id, Number(c.cost_per_unit)])) };
    },
  });

  const rows = (q.data?.rows ?? []).filter((i) => {
    if (search && !i.nama.toLowerCase().includes(search.toLowerCase())) return false;
    if (filter && ingredientStatus(Number(i.stok), Number(i.min_stock)).label !== filter) return false;
    return true;
  });
  const counts = (q.data?.rows ?? []).reduce<Record<string, number>>((acc, i) => {
    const l = ingredientStatus(Number(i.stok), Number(i.min_stock)).label;
    acc[l] = (acc[l] ?? 0) + 1;
    return acc;
  }, {});

  const columns: Column<Ingredient>[] = [
    { key: 'nama', header: 'Bahan', cell: (i) => <span className="font-semibold">{i.nama}{!i.aktif && <Badge className="ml-2">Nonaktif</Badge>}</span> },
    {
      key: 'stok',
      header: 'Sisa',
      cell: (i) => (
        <span className={clsx('font-semibold tabular-nums', Number(i.stok) < 0 && 'text-red-700')}>
          {formatQty(i.stok)} {i.satuan}
        </span>
      ),
    },
    { key: 'min', header: 'Minimum', cell: (i) => <span className="text-cocoa-600 tabular-nums">{formatQty(i.min_stock)} {i.satuan}</span> },
    {
      key: 'status',
      header: 'Status',
      cell: (i) => {
        const s = ingredientStatus(Number(i.stok), Number(i.min_stock));
        return <Badge tone={s.tone}>{s.label}</Badge>;
      },
    },
    ...(isOwner
      ? [{ key: 'harga', header: 'Harga rata-rata', cell: (i: Ingredient) => <span className="tabular-nums">{formatRupiah(q.data?.costs.get(i.id) ?? 0)}/{i.satuan}</span> }]
      : []),
    {
      key: 'aksi',
      header: '',
      className: 'text-right',
      cell: (i) => (
        <div className="flex justify-end gap-1">
          {canEdit && (
            <>
              <Button size="sm" variant="secondary" icon={<ShoppingCart className="size-4" />} onClick={() => setModal({ type: 'belanja', item: i })}>
                Belanja
              </Button>
              <button className="rounded-lg p-2 text-cocoa-500 hover:bg-cream-100" title="Koreksi stok" aria-label={`Koreksi stok ${i.nama}`} onClick={() => setModal({ type: 'koreksi', item: i })}>
                <SlidersHorizontal className="size-4" />
              </button>
              <button className="rounded-lg p-2 text-cocoa-500 hover:bg-cream-100" title="Ubah" aria-label={`Ubah ${i.nama}`} onClick={() => setModal({ type: 'form', item: i })}>
                <Pencil className="size-4" />
              </button>
            </>
          )}
          <button className="rounded-lg p-2 text-cocoa-500 hover:bg-cream-100" title="Riwayat" aria-label={`Riwayat ${i.nama}`} onClick={() => setModal({ type: 'riwayat', item: i })}>
            <History className="size-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Stok Bahan"
        description={canEdit ? 'Tambah stok lewat Belanja, koreksi selisih dengan alasan.' : 'Sisa bahan baku (hanya bisa dilihat).'}
        actions={
          canEdit ? (
            <Button icon={<Plus className="size-4" />} onClick={() => setModal({ type: 'form', item: null })}>
              Tambah bahan
            </Button>
          ) : undefined
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {(['', 'Habis', 'Menipis', 'Aman'] as const).map((f) => (
          <button
            key={f || 'semua'}
            onClick={() => setFilter(f)}
            className={clsx('h-10 rounded-xl px-4 text-sm font-semibold', filter === f ? 'bg-cocoa-800 text-white' : 'bg-white ring-1 ring-cream-300')}
          >
            {f || 'Semua'} {f && counts[f] ? `(${counts[f]})` : ''}
          </button>
        ))}
        <div className="w-full sm:ml-auto sm:w-auto">
          <SearchInput value={search} onChange={setSearch} placeholder="Cari bahan" delay={0} />
        </div>
      </div>
      {q.isLoading ? (
        <LoadingState />
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState title={q.data?.rows.length ? 'Tidak ada yang cocok' : 'Belum ada bahan'} />
      ) : (
        <DataTable rows={rows} columns={columns} rowKey={(i) => i.id} />
      )}
      {modal?.type === 'form' && <IngredientForm item={modal.item} onClose={() => setModal(null)} />}
      {modal?.type === 'belanja' && modal.item && <PurchaseModal item={modal.item} onClose={() => setModal(null)} />}
      {modal?.type === 'koreksi' && modal.item && <AdjustModal item={modal.item} onClose={() => setModal(null)} />}
      {modal?.type === 'riwayat' && modal.item && <MovementsModal item={modal.item} onClose={() => setModal(null)} />}
    </>
  );
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    for (const k of ['ingredients', 'production_preview', 'stock_movements']) void qc.invalidateQueries({ queryKey: [k] });
  };
}

function IngredientForm({ item, onClose }: { item: Ingredient | null; onClose: () => void }) {
  const toast = useToast();
  const invalidate = useInvalidate();
  const [f, setF] = useState({ nama: item?.nama ?? '', satuan: item?.satuan ?? 'gram', min_stock: String(item?.min_stock ?? 0), aktif: item?.aktif ?? true });
  const m = useMutation({
    mutationFn: async () => {
      const payload = { nama: f.nama.trim(), satuan: f.satuan.trim(), min_stock: Number(f.min_stock) || 0, aktif: f.aktif };
      const res = item ? await supabase.from('ingredients').update(payload).eq('id', item.id) : await supabase.from('ingredients').insert(payload);
      if (res.error) throw res.error.code === '23505' ? new Error('Nama bahan sudah ada.') : res.error;
    },
    onSuccess: () => {
      toast('success', 'Bahan tersimpan.');
      invalidate();
      onClose();
    },
    onError: (e) => toast('error', errorMessage(e)),
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={item ? `Ubah ${item.nama}` : 'Tambah bahan'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Batal
          </Button>
          <Button loading={m.isPending} disabled={!f.nama.trim() || !f.satuan.trim()} onClick={() => m.mutate()}>
            Simpan
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input label="Nama bahan" value={f.nama} onChange={(e) => setF({ ...f, nama: e.target.value })} maxLength={80} />
        <div className="grid grid-cols-2 gap-4">
          <Input label="Satuan" value={f.satuan} onChange={(e) => setF({ ...f, satuan: e.target.value })} maxLength={20} placeholder="gram, ml, butir" />
          <Input label="Stok minimum" type="number" min={0} value={f.min_stock} onChange={(e) => setF({ ...f, min_stock: e.target.value })} hint="Di bawah ini = Menipis" />
        </div>
        <Checkbox label="Aktif" checked={f.aktif} onChange={(e) => setF({ ...f, aktif: e.target.checked })} />
        {!item && <p className="text-xs text-cocoa-500">Stok awal 0 — isi lewat tombol Belanja.</p>}
      </div>
    </Modal>
  );
}

function PurchaseModal({ item, onClose }: { item: Ingredient; onClose: () => void }) {
  const toast = useToast();
  const invalidate = useInvalidate();
  const [qty, setQty] = useState('');
  const [harga, setHarga] = useState('');
  const [catatan, setCatatan] = useState('');
  const m = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('add_ingredient_stock', { p_ingredient_id: item.id, p_qty: Number(qty), p_total_harga: Number(harga), p_catatan: catatan || null });
      if (error) throw error;
      return data;
    },
    onSuccess: (stok) => {
      toast('success', `Stok ${item.nama} sekarang ${formatQty(stok)} ${item.satuan}.`);
      invalidate();
      onClose();
    },
    onError: (e) => toast('error', errorMessage(e)),
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={`Belanja ${item.nama}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Batal
          </Button>
          <Button loading={m.isPending} disabled={!(Number(qty) > 0) || harga === '' || Number(harga) < 0} onClick={() => m.mutate()}>
            Tambah stok
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input label={`Jumlah (${item.satuan})`} type="number" inputMode="decimal" min={0} value={qty} onChange={(e) => setQty(e.target.value)} />
        <Input label="Total harga belanja (Rp)" type="number" inputMode="numeric" min={0} value={harga} onChange={(e) => setHarga(e.target.value)} hint="Dipakai menghitung HPP rata-rata bahan." />
        <Input label="Catatan (opsional)" value={catatan} onChange={(e) => setCatatan(e.target.value)} maxLength={200} placeholder="Mis. nama toko/supplier" />
      </div>
    </Modal>
  );
}

function AdjustModal({ item, onClose }: { item: Ingredient; onClose: () => void }) {
  const toast = useToast();
  const invalidate = useInvalidate();
  const [nilai, setNilai] = useState(String(item.stok));
  const [alasan, setAlasan] = useState('');
  const delta = Number(nilai) - Number(item.stok);
  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('adjust_ingredient_stock', { p_ingredient_id: item.id, p_delta: delta, p_alasan: alasan });
      if (error) throw error;
    },
    onSuccess: () => {
      toast('success', 'Stok dikoreksi.');
      invalidate();
      onClose();
    },
    onError: (e) => toast('error', errorMessage(e)),
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={`Koreksi stok ${item.nama}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Batal
          </Button>
          <Button loading={m.isPending} disabled={!delta || Number.isNaN(delta) || alasan.trim().length < 3} onClick={() => m.mutate()}>
            Simpan koreksi
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm">
          Stok di sistem: <strong>{formatQty(item.stok)} {item.satuan}</strong>
          {delta !== 0 && !Number.isNaN(delta) && <> → selisih {delta > 0 ? '+' : ''}{formatQty(delta)}</>}
        </p>
        <Input label={`Stok sebenarnya (${item.satuan})`} type="number" inputMode="decimal" value={nilai} onChange={(e) => setNilai(e.target.value)} hint="Isi hasil hitung fisik (stok opname)." />
        <Input label="Alasan" value={alasan} onChange={(e) => setAlasan(e.target.value)} maxLength={200} required hint="Wajib. Mis. stok opname, rusak, kedaluwarsa." />
      </div>
    </Modal>
  );
}

function MovementsModal({ item, onClose }: { item: Ingredient; onClose: () => void }) {
  const q = useQuery({
    queryKey: ['stock_movements', 'ingredient', item.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('stock_movements').select('*').eq('ingredient_id', item.id).order('created_at', { ascending: false }).limit(50);
      if (error) throw error;
      return data;
    },
  });
  return (
    <Modal open onClose={onClose} title={`Riwayat ${item.nama}`}>
      {q.isLoading ? (
        <LoadingState />
      ) : !q.data?.length ? (
        <p className="text-sm text-cocoa-500">Belum ada pergerakan stok.</p>
      ) : (
        <ul className="divide-y divide-cream-200 text-sm">
          {q.data.map((m) => (
            <li key={m.id} className="flex justify-between gap-3 py-2">
              <span>
                {JENIS[m.jenis] ?? m.jenis}
                <span className="block text-xs text-cocoa-500">
                  {formatDateTime(m.created_at)}
                  {m.alasan ? ` · ${m.alasan}` : ''}
                </span>
              </span>
              <span className="text-right tabular-nums">
                <span className={Number(m.qty) < 0 ? 'text-red-700' : 'text-emerald-700'}>
                  {Number(m.qty) > 0 ? '+' : ''}
                  {formatQty(m.qty)}
                </span>
                <span className="block text-xs text-cocoa-500">sisa {formatQty(m.stok_sesudah)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
