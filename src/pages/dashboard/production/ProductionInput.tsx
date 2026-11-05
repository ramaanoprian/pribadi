import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { AlertTriangle, CheckCircle2, ChefHat, Minus, Plus, XCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/errors';
import { formatQty, type ProductionPreview } from '@/lib/production';
import { ProductImage } from '@/components/product/ProductImage';
import { Alert, Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, ErrorState, LoadingState, Spinner } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';

/** Input produksi — dirancang untuk HP di dapur: tombol besar, sedikit teks. */
export function ProductionInput() {
  const qc = useQueryClient();
  const toast = useToast();
  const [productId, setProductId] = useState<string | null>(null);
  const [batches, setBatches] = useState(1);
  const [confirm, setConfirm] = useState(false);

  const products = useQuery({
    queryKey: ['production_products'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('production_products');
      if (error) throw error;
      return data;
    },
  });
  const today = useQuery({
    queryKey: ['production_today'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('production_today');
      if (error) throw error;
      return data;
    },
  });
  const preview = useQuery({
    queryKey: ['production_preview', productId, batches],
    enabled: Boolean(productId) && batches >= 1,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('production_preview', { p_product_id: productId!, p_batches: batches });
      if (error) throw error;
      return data as unknown as ProductionPreview;
    },
  });

  const selected = products.data?.find((p) => p.product_id === productId);
  const blocked = preview.data?.ada_kurang && preview.data.mode_bahan_kurang === 'blokir';

  const save = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('record_production', { p_product_id: productId!, p_batches: batches });
      if (error) throw error;
      return data as { hasil: number; bahan_kurang: boolean };
    },
    onSuccess: (r) => {
      toast('success', `Tersimpan: ${formatQty(r.hasil)} ${selected?.satuan ?? ''} ${selected?.nama ?? ''}.`);
      setConfirm(false);
      setProductId(null);
      setBatches(1);
      for (const k of ['production_today', 'production_products', 'production_preview', 'production_logs', 'ingredients', 'products']) {
        void qc.invalidateQueries({ queryKey: [k] });
      }
    },
    onError: (e) => {
      setConfirm(false);
      toast('error', errorMessage(e));
    },
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Input Produksi</h1>
        <p className="mt-1 text-cocoa-600">Pilih produk, isi jumlah batch, lalu simpan.</p>
      </div>

      <section className="rounded-2xl bg-cocoa-800 p-5 text-cream-100 shadow-sm" aria-label="Produksi hari ini">
        <p className="text-sm font-semibold tracking-wide text-cream-300 uppercase">Produksi hari ini</p>
        {today.isLoading ? (
          <Spinner />
        ) : !today.data?.length ? (
          <p className="mt-1 text-lg">Belum ada produksi.</p>
        ) : (
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {today.data.map((t) => (
              <li key={t.product_id} className="flex items-baseline justify-between gap-3 rounded-xl bg-white/10 px-3 py-2">
                <span className="font-semibold">{t.nama_produk}</span>
                <span className="text-lg font-bold tabular-nums">
                  {formatQty(t.hasil)} <span className="text-sm font-normal">{t.satuan}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-sans text-lg font-bold">1. Pilih produk</h2>
        {products.isLoading ? (
          <LoadingState />
        ) : products.isError ? (
          <ErrorState message={errorMessage(products.error)} onRetry={() => void products.refetch()} />
        ) : !products.data?.length ? (
          <EmptyState icon={<ChefHat className="size-8" />} title="Belum ada produk dengan resep" description="Owner perlu membuat resep terlebih dahulu." />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {products.data.map((p) => (
              <button
                key={p.product_id}
                type="button"
                onClick={() => {
                  setProductId(p.product_id);
                  setBatches(1);
                }}
                aria-pressed={productId === p.product_id}
                className={clsx(
                  'flex min-h-28 flex-col items-start overflow-hidden rounded-2xl bg-white text-left ring-1 transition',
                  productId === p.product_id ? 'ring-4 ring-brand-500' : 'ring-cream-300 hover:ring-brand-300',
                )}
              >
                <ProductImage path={p.gambar_path} nama={p.nama} className="h-20 w-full" />
                <span className="px-3 pt-2 text-base leading-tight font-bold">{p.nama}</span>
                <span className="px-3 pb-3 text-sm text-cocoa-600">
                  1 batch = {formatQty(p.yield_per_batch)} {p.satuan}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      {selected && (
        <section className="space-y-4">
          <h2 className="font-sans text-lg font-bold">2. Jumlah batch</h2>
          <div className="flex items-center gap-4">
            <button type="button" className="grid size-16 place-items-center rounded-2xl bg-white text-cocoa-800 ring-1 ring-cream-300 active:bg-cream-200 disabled:opacity-40" onClick={() => setBatches((b) => Math.max(1, b - 1))} disabled={batches <= 1} aria-label="Kurangi batch">
              <Minus className="size-7" />
            </button>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={1000}
              value={batches}
              onChange={(e) => setBatches(Math.max(1, Math.min(1000, Number(e.target.value) || 1)))}
              className="h-16 w-24 rounded-2xl border border-cream-300 bg-white text-center text-3xl font-bold tabular-nums"
              aria-label="Jumlah batch"
            />
            <button type="button" className="grid size-16 place-items-center rounded-2xl bg-white text-cocoa-800 ring-1 ring-cream-300 active:bg-cream-200" onClick={() => setBatches((b) => Math.min(1000, b + 1))} aria-label="Tambah batch">
              <Plus className="size-7" />
            </button>
            <p className="text-lg">
              = <strong className="text-2xl">{formatQty(selected.yield_per_batch * batches)}</strong> {selected.satuan}
            </p>
          </div>

          <Card>
            <h3 className="font-sans font-bold">Bahan yang akan terpakai</h3>
            {preview.isLoading ? (
              <div className="mt-3">
                <Spinner />
              </div>
            ) : preview.isError ? (
              <p className="mt-2 text-sm text-red-700">{errorMessage(preview.error)}</p>
            ) : (
              <ul className="mt-3 divide-y divide-cream-200">
                {preview.data?.bahan.map((b) => (
                  <li key={b.nama} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="flex items-center gap-2">
                      {b.kurang > 0 ? <XCircle className="size-5 text-red-500" /> : <CheckCircle2 className="size-5 text-emerald-500" />}
                      {b.nama}
                    </span>
                    <span className="text-right tabular-nums">
                      <span className="font-semibold">
                        {formatQty(b.dibutuhkan)} {b.satuan}
                      </span>
                      <span className={clsx('block text-xs', b.kurang > 0 ? 'font-semibold text-red-700' : 'text-cocoa-500')}>
                        {b.kurang > 0 ? `kurang ${formatQty(b.kurang)} (ada ${formatQty(b.tersedia)})` : `stok ${formatQty(b.tersedia)}`}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {preview.data?.ada_kurang &&
            (blocked ? (
              <Alert tone="red" title="Bahan tidak cukup — produksi diblokir">
                Minta Admin menambah stok bahan terlebih dahulu.
              </Alert>
            ) : (
              <Alert tone="amber" title="Bahan kurang">
                <span className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" /> Stok bahan di sistem tidak cukup. Anda tetap bisa menyimpan; Admin akan diberi tanda untuk mengoreksi stok.
                </span>
              </Alert>
            ))}

          <Button size="xl" block disabled={!preview.data || blocked} onClick={() => setConfirm(true)}>
            Simpan produksi
          </Button>
        </section>
      )}

      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Simpan produksi?"
        footer={
          <>
            <Button variant="ghost" size="lg" onClick={() => setConfirm(false)}>
              Batal
            </Button>
            <Button size="lg" loading={save.isPending} onClick={() => save.mutate()}>
              Ya, simpan
            </Button>
          </>
        }
      >
        {selected && (
          <p className="text-lg">
            <strong>{batches} batch</strong> {selected.nama} ={' '}
            <strong>
              {formatQty(selected.yield_per_batch * batches)} {selected.satuan}
            </strong>
            .
            <span className="mt-2 block text-sm text-cocoa-600">Setelah disimpan, data tidak bisa diubah sendiri. Bila salah, minta Admin membatalkan.</span>
          </p>
        )}
      </Modal>
    </div>
  );
}
