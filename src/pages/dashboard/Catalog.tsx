import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { PackagePlus, Pencil, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/errors';
import { formatRupiah } from '@/lib/format';
import { slugify } from '@/lib/slug';
import { productImageUrl, uploadFile } from '@/lib/storage';
import { SALE_MODE_LABEL } from '@/lib/orders';
import type { SaleMode, Tables } from '@/lib/database.types';
import { ProductImage } from '@/components/product/ProductImage';
import { Badge, Card, PageHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Checkbox, Input, Select, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { DataTable, SearchInput, type Column } from '@/components/ui/Table';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';

type Product = Tables<'products'>;
type Category = Tables<'categories'>;

const PRODUCT_COLS = 'id, category_id, nama, slug, deskripsi, harga, satuan, sale_mode, stok, gambar_path, aktif, urutan, created_at, updated_at';

function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data, error } = await supabase.from('categories').select('*').order('urutan').order('nama');
      if (error) throw error;
      return data;
    },
  });
}

export function Catalog() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'kategori' ? 'kategori' : 'produk';
  return (
    <>
      <PageHeader title="Katalog Produk" description="Produk, harga, foto, mode jual, dan kategori. Perubahan harga & stok tercatat di log aktivitas." />
      <div className="mb-5 inline-flex gap-1 rounded-xl bg-cream-200/70 p-1" role="tablist">
        {(['produk', 'kategori'] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setParams(t === 'produk' ? {} : { tab: t })}
            className={clsx('h-9 rounded-lg px-4 text-sm font-semibold capitalize', tab === t ? 'bg-white shadow-sm' : 'text-cocoa-600')}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === 'produk' ? <ProductList /> : <CategoryList />}
    </>
  );
}

function ProductList() {
  const cats = useCategories();
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('');
  const [mode, setMode] = useState('');
  const [editing, setEditing] = useState<Product | 'baru' | null>(null);
  const [adjusting, setAdjusting] = useState<Product | null>(null);

  const q = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase.from('products').select(PRODUCT_COLS).order('urutan').order('nama');
      if (error) throw error;
      return data as Product[];
    },
  });

  const catName = new Map((cats.data ?? []).map((c) => [c.id, c.nama]));
  const rows = (q.data ?? []).filter(
    (p) => (!search || p.nama.toLowerCase().includes(search.toLowerCase())) && (!cat || p.category_id === cat) && (!mode || p.sale_mode === mode),
  );

  const columns: Column<Product>[] = [
    {
      key: 'produk',
      header: 'Produk',
      cell: (p) => (
        <div className="flex items-center gap-3 text-left">
          <ProductImage path={p.gambar_path} nama={p.nama} className="hidden size-12 shrink-0 rounded-lg md:grid" />
          <div>
            <p className="font-semibold">{p.nama}</p>
            <p className="text-xs text-cocoa-500">{p.category_id ? catName.get(p.category_id) : 'Tanpa kategori'}</p>
          </div>
        </div>
      ),
    },
    { key: 'harga', header: 'Harga', cell: (p) => <span className="whitespace-nowrap tabular-nums">{formatRupiah(p.harga)} / {p.satuan}</span> },
    { key: 'mode', header: 'Mode', cell: (p) => <Badge tone={p.sale_mode === 'preorder' ? 'blue' : 'neutral'}>{SALE_MODE_LABEL[p.sale_mode]}</Badge> },
    {
      key: 'stok',
      header: 'Stok',
      cell: (p) =>
        p.sale_mode === 'ready_stock' ? (
          <span className={clsx('font-semibold tabular-nums', p.stok === 0 ? 'text-red-600' : p.stok <= 5 ? 'text-amber-700' : '')}>{p.stok}</span>
        ) : (
          <span className="text-cocoa-400">—</span>
        ),
    },
    { key: 'aktif', header: 'Tampil', cell: (p) => (p.aktif ? <Badge tone="green">Aktif</Badge> : <Badge>Disembunyikan</Badge>) },
    {
      key: 'aksi',
      header: '',
      className: 'text-right',
      cell: (p) => (
        <div className="flex justify-end gap-1.5">
          {p.sale_mode === 'ready_stock' && (
            <Button size="sm" variant="secondary" onClick={() => setAdjusting(p)}>
              Koreksi stok
            </Button>
          )}
          <Button size="sm" variant="ghost" icon={<Pencil className="size-4" />} onClick={() => setEditing(p)}>
            Ubah
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput value={search} onChange={setSearch} placeholder="Cari produk" delay={0} />
        <select className="h-11 rounded-xl border border-cream-300 bg-white px-3 text-sm" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Filter kategori">
          <option value="">Semua kategori</option>
          {cats.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nama}
            </option>
          ))}
        </select>
        <select className="h-11 rounded-xl border border-cream-300 bg-white px-3 text-sm" value={mode} onChange={(e) => setMode(e.target.value)} aria-label="Filter mode jual">
          <option value="">Semua mode</option>
          <option value="ready_stock">Ready stock</option>
          <option value="preorder">Pre-order</option>
        </select>
        <Button className="sm:ml-auto" icon={<Plus className="size-4" />} onClick={() => setEditing('baru')}>
          Tambah produk
        </Button>
      </div>
      {q.isLoading ? (
        <LoadingState />
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState icon={<PackagePlus className="size-8" />} title={q.data?.length ? 'Tidak ada yang cocok' : 'Belum ada produk'} />
      ) : (
        <DataTable rows={rows} columns={columns} rowKey={(p) => p.id} />
      )}
      {editing && <ProductModal product={editing === 'baru' ? null : editing} categories={cats.data ?? []} onClose={() => setEditing(null)} />}
      {adjusting && <StockModal product={adjusting} onClose={() => setAdjusting(null)} />}
    </div>
  );
}

function ProductModal({ product, categories, onClose }: { product: Product | null; categories: Category[]; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [f, setF] = useState({
    nama: product?.nama ?? '',
    slug: product?.slug ?? '',
    category_id: product?.category_id ?? categories[0]?.id ?? '',
    deskripsi: product?.deskripsi ?? '',
    harga: product ? String(product.harga) : '',
    satuan: product?.satuan ?? 'pcs',
    sale_mode: (product?.sale_mode ?? 'ready_stock') as SaleMode,
    urutan: String(product?.urutan ?? 0),
    aktif: product?.aktif ?? true,
  });
  const [slugTouched, setSlugTouched] = useState(Boolean(product));
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(productImageUrl(product?.gambar_path));
  const [errors, setErrors] = useState<Record<string, string>>({});

  const m = useMutation({
    mutationFn: async () => {
      const gambar_path = file ? await uploadFile('produk', 'foto', file, 2 * 1024 * 1024) : product?.gambar_path ?? null;
      const payload = {
        nama: f.nama.trim(),
        slug: f.slug,
        category_id: f.category_id || null,
        deskripsi: f.deskripsi.trim(),
        harga: Number(f.harga),
        satuan: f.satuan.trim() || 'pcs',
        sale_mode: f.sale_mode,
        urutan: Number(f.urutan) || 0,
        aktif: f.aktif,
        gambar_path,
      };
      const res = product ? await supabase.from('products').update(payload).eq('id', product.id) : await supabase.from('products').insert(payload);
      if (res.error) {
        if (res.error.code === '23505') throw new Error('Slug sudah dipakai produk lain.');
        throw res.error;
      }
    },
    onSuccess: () => {
      toast('success', 'Produk tersimpan.');
      void qc.invalidateQueries({ queryKey: ['products'] });
      void qc.invalidateQueries({ queryKey: ['katalog'] });
      onClose();
    },
    onError: (e) => toast('error', errorMessage(e)),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const v: Record<string, string> = {};
    if (!f.nama.trim()) v.nama = 'Nama wajib diisi.';
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(f.slug)) v.slug = 'Slug hanya huruf kecil, angka, dan tanda hubung.';
    const h = Number(f.harga);
    if (!f.harga || Number.isNaN(h) || h < 0 || !Number.isInteger(h)) v.harga = 'Harga harus bilangan bulat ≥ 0.';
    setErrors(v);
    if (!Object.keys(v).length) m.mutate();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={product ? 'Ubah produk' : 'Tambah produk'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Batal
          </Button>
          <Button form="product-form" type="submit" loading={m.isPending}>
            Simpan
          </Button>
        </>
      }
    >
      <form id="product-form" onSubmit={onSubmit} className="space-y-4">
        <div className="flex items-center gap-4">
          {preview ? <img src={preview} alt="" className="size-20 rounded-xl object-cover" /> : <ProductImage path={null} nama={f.nama || '?'} className="size-20 rounded-xl" />}
          <label className="text-sm">
            <span className="font-semibold">Foto produk</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="mt-1 block w-full text-sm"
              onChange={(e) => {
                const fl = e.target.files?.[0] ?? null;
                setFile(fl);
                setPreview(fl ? URL.createObjectURL(fl) : productImageUrl(product?.gambar_path));
              }}
            />
            <span className="text-xs text-cocoa-500">JPG/PNG/WEBP, maks. 2 MB, rasio 4:3 disarankan.</span>
          </label>
        </div>
        <Input
          label="Nama produk"
          value={f.nama}
          onChange={(e) => setF({ ...f, nama: e.target.value, slug: slugTouched ? f.slug : slugify(e.target.value) })}
          error={errors.nama}
          maxLength={100}
          required
        />
        <Input
          label="Slug (alamat halaman)"
          value={f.slug}
          onChange={(e) => {
            setSlugTouched(true);
            setF({ ...f, slug: e.target.value });
          }}
          error={errors.slug}
          hint={`/menu/${f.slug || '...'}`}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Harga (Rp)" type="number" inputMode="numeric" min={0} value={f.harga} onChange={(e) => setF({ ...f, harga: e.target.value })} error={errors.harga} required />
          <Input label="Satuan" value={f.satuan} onChange={(e) => setF({ ...f, satuan: e.target.value })} maxLength={20} placeholder="pcs, loyang, toples" />
          <Select label="Kategori" value={f.category_id} onChange={(e) => setF({ ...f, category_id: e.target.value })}>
            <option value="">Tanpa kategori</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nama}
              </option>
            ))}
          </Select>
          <Select label="Mode jual" value={f.sale_mode} onChange={(e) => setF({ ...f, sale_mode: e.target.value as SaleMode })}>
            <option value="ready_stock">Ready stock (pakai stok)</option>
            <option value="preorder">Pre-order (tanpa stok)</option>
          </Select>
        </div>
        <Textarea label="Deskripsi" value={f.deskripsi} onChange={(e) => setF({ ...f, deskripsi: e.target.value })} maxLength={2000} />
        <div className="grid gap-4 sm:grid-cols-2 sm:items-end">
          <Input label="Urutan tampil" type="number" value={f.urutan} onChange={(e) => setF({ ...f, urutan: e.target.value })} hint="Angka kecil tampil lebih dulu." />
          <Checkbox label="Tampilkan di website" checked={f.aktif} onChange={(e) => setF({ ...f, aktif: e.target.checked })} />
        </div>
        {!product && f.sale_mode === 'ready_stock' && <p className="text-xs text-cocoa-500">Stok awal 0. Tambah stok lewat “Koreksi stok” (atau input produksi di Fase 4).</p>}
      </form>
    </Modal>
  );
}

function StockModal({ product, onClose }: { product: Product; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [arah, setArah] = useState<'tambah' | 'kurang'>('tambah');
  const [jumlah, setJumlah] = useState('');
  const [alasan, setAlasan] = useState('');
  const delta = (arah === 'tambah' ? 1 : -1) * (Number(jumlah) || 0);
  const m = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('adjust_product_stock', { p_product_id: product.id, p_delta: delta, p_alasan: alasan });
      if (error) throw error;
      return data;
    },
    onSuccess: (stok) => {
      toast('success', `Stok ${product.nama} sekarang ${stok}.`);
      void qc.invalidateQueries({ queryKey: ['products'] });
      void qc.invalidateQueries({ queryKey: ['katalog'] });
      onClose();
    },
    onError: (e) => toast('error', errorMessage(e)),
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={`Koreksi stok — ${product.nama}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Batal
          </Button>
          <Button loading={m.isPending} disabled={!delta || alasan.trim().length < 3} onClick={() => m.mutate()}>
            Simpan koreksi
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm">
          Stok saat ini: <strong>{product.stok}</strong> {product.satuan}
          {delta !== 0 && (
            <>
              {' '}
              → <strong>{product.stok + delta}</strong>
            </>
          )}
        </p>
        <div className="grid grid-cols-2 gap-2">
          {(['tambah', 'kurang'] as const).map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setArah(a)}
              className={clsx('h-11 rounded-xl text-sm font-semibold ring-1', arah === a ? 'bg-cocoa-800 text-white ring-cocoa-800' : 'bg-white ring-cream-300')}
            >
              {a === 'tambah' ? '+ Tambah' : '− Kurangi'}
            </button>
          ))}
        </div>
        <Input label="Jumlah" type="number" inputMode="numeric" min={1} value={jumlah} onChange={(e) => setJumlah(e.target.value)} />
        <Input label="Alasan" value={alasan} onChange={(e) => setAlasan(e.target.value)} maxLength={200} required hint="Wajib. Mis. stok opname, rusak, sampel." />
      </div>
    </Modal>
  );
}

function CategoryList() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useCategories();
  const [editing, setEditing] = useState<Category | 'baru' | null>(null);
  const [toDelete, setToDelete] = useState<Category | null>(null);
  const [f, setF] = useState({ nama: '', slug: '', urutan: '0', aktif: true });

  const save = useMutation({
    mutationFn: async () => {
      const payload = { nama: f.nama.trim(), slug: f.slug || slugify(f.nama), urutan: Number(f.urutan) || 0, aktif: f.aktif };
      const res = editing && editing !== 'baru' ? await supabase.from('categories').update(payload).eq('id', editing.id) : await supabase.from('categories').insert(payload);
      if (res.error) throw res.error.code === '23505' ? new Error('Slug kategori sudah dipakai.') : res.error;
    },
    onSuccess: () => {
      toast('success', 'Kategori tersimpan.');
      void qc.invalidateQueries({ queryKey: ['categories'] });
      void qc.invalidateQueries({ queryKey: ['katalog'] });
      setEditing(null);
    },
    onError: (e) => toast('error', errorMessage(e)),
  });
  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('categories').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast('success', 'Kategori dihapus. Produknya kini tanpa kategori.');
      void qc.invalidateQueries({ queryKey: ['categories'] });
      void qc.invalidateQueries({ queryKey: ['products'] });
      setToDelete(null);
    },
    onError: (e) => toast('error', errorMessage(e)),
  });

  function open(c: Category | 'baru') {
    setEditing(c);
    setF(c === 'baru' ? { nama: '', slug: '', urutan: '0', aktif: true } : { nama: c.nama, slug: c.slug, urutan: String(c.urutan), aktif: c.aktif });
  }

  return (
    <Card>
      <div className="flex justify-between">
        <h2 className="font-sans text-lg font-bold">Kategori</h2>
        <Button size="sm" variant="secondary" icon={<Plus className="size-4" />} onClick={() => open('baru')}>
          Tambah
        </Button>
      </div>
      <div className="mt-4">
        {q.isLoading ? (
          <LoadingState />
        ) : q.isError ? (
          <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
        ) : !q.data?.length ? (
          <EmptyState title="Belum ada kategori" />
        ) : (
          <ul className="divide-y divide-cream-200">
            {q.data.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-semibold">
                    {c.nama} {!c.aktif && <Badge>Disembunyikan</Badge>}
                  </p>
                  <p className="text-xs text-cocoa-500">
                    /{c.slug} · urutan {c.urutan}
                  </p>
                </div>
                <div className="flex gap-1">
                  <button className="rounded-lg p-2 text-cocoa-500 hover:bg-cream-100" onClick={() => open(c)} aria-label={`Ubah ${c.nama}`}>
                    <Pencil className="size-4" />
                  </button>
                  <button className="rounded-lg p-2 text-red-600 hover:bg-red-50" onClick={() => setToDelete(c)} aria-label={`Hapus ${c.nama}`}>
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'baru' ? 'Tambah kategori' : 'Ubah kategori'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Batal
            </Button>
            <Button loading={save.isPending} disabled={!f.nama.trim()} onClick={() => save.mutate()}>
              Simpan
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input label="Nama" value={f.nama} onChange={(e) => setF({ ...f, nama: e.target.value, slug: editing === 'baru' ? slugify(e.target.value) : f.slug })} maxLength={60} />
          <Input label="Slug" value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value })} />
          <Input label="Urutan" type="number" value={f.urutan} onChange={(e) => setF({ ...f, urutan: e.target.value })} />
          <Checkbox label="Tampilkan di website" checked={f.aktif} onChange={(e) => setF({ ...f, aktif: e.target.checked })} />
        </div>
      </Modal>
      <Modal
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        title="Hapus kategori?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setToDelete(null)}>
              Batal
            </Button>
            <Button variant="danger" loading={del.isPending} onClick={() => toDelete && del.mutate(toDelete.id)}>
              Hapus
            </Button>
          </>
        }
      >
        <p className="text-sm">Produk di kategori “{toDelete?.nama}” tetap ada, tetapi menjadi tanpa kategori.</p>
      </Modal>
    </Card>
  );
}
