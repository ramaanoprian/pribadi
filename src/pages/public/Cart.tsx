import { Link } from 'react-router-dom';
import { ShoppingBag, Trash2 } from 'lucide-react';
import { useCart } from '@/lib/cart';
import { formatRupiah } from '@/lib/format';
import { useCatalog } from '@/hooks/usePublic';
import { ProductImage } from '@/components/product/ProductImage';
import { QtyStepper } from '@/components/product/QtyStepper';
import { Card, Alert } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/States';

export function Cart() {
  const cart = useCart();
  const catalog = useCatalog();
  const live = new Map((catalog.data?.products ?? []).map((p) => [p.id, p]));

  if (cart.items.length === 0)
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <EmptyState
          icon={<ShoppingBag className="size-8" />}
          title="Keranjang masih kosong"
          description="Yuk pilih kue favorit Anda."
          action={
            <Link to="/menu" className="inline-flex h-11 items-center rounded-xl bg-brand-500 px-5 font-semibold text-white hover:bg-brand-600">
              Lihat menu
            </Link>
          }
        />
      </div>
    );

  const problems = catalog.data
    ? cart.items.flatMap((i) => {
        const p = live.get(i.product_id);
        if (!p) return [`${i.nama} sudah tidak tersedia.`];
        if (p.sale_mode === 'ready_stock' && (p.stok ?? 0) < i.qty) return [`Stok ${p.nama} tinggal ${p.stok ?? 0}.`];
        if (p.harga !== i.harga) return [`Harga ${p.nama} berubah menjadi ${formatRupiah(p.harga)}.`];
        return [];
      })
    : [];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
      <h1 className="text-3xl font-bold">Keranjang</h1>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-3">
          {problems.length > 0 && (
            <Alert tone="amber" title="Perlu dicek">
              <ul className="list-disc pl-4">
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </Alert>
          )}
          {cart.items.map((i) => {
            const p = live.get(i.product_id);
            const harga = p?.harga ?? i.harga;
            return (
              <Card key={i.product_id} className="flex gap-4 p-3 sm:p-4">
                <ProductImage path={i.gambar_path} nama={i.nama} className="size-20 shrink-0 rounded-xl sm:size-24" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex justify-between gap-2">
                    <Link to={`/menu/${i.slug}`} className="font-semibold hover:text-brand-600">
                      {i.nama}
                    </Link>
                    <button onClick={() => cart.remove(i.product_id)} className="rounded-lg p-1.5 text-cocoa-400 hover:bg-red-50 hover:text-red-600" aria-label={`Hapus ${i.nama}`}>
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                  <p className="text-sm text-cocoa-500">
                    {formatRupiah(harga)} / {i.satuan} · {i.sale_mode === 'preorder' ? 'Pre-order' : 'Ready stock'}
                  </p>
                  <div className="mt-auto flex items-center justify-between pt-2">
                    <QtyStepper value={i.qty} onChange={(v) => cart.setQty(i.product_id, v)} />
                    <p className="font-bold tabular-nums">{formatRupiah(harga * i.qty)}</p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
        <Card className="h-fit space-y-3 lg:sticky lg:top-24">
          <div className="flex justify-between">
            <span>Subtotal ({cart.count} item)</span>
            <span className="font-bold tabular-nums">{formatRupiah(cart.subtotal)}</span>
          </div>
          <p className="text-xs text-cocoa-500">Ongkir & promo dihitung di halaman checkout.</p>
          <Link to="/checkout" className="flex h-12 items-center justify-center rounded-xl bg-brand-500 font-semibold text-white hover:bg-brand-600">
            Lanjut ke checkout
          </Link>
          <Link to="/menu" className="block text-center text-sm font-semibold text-brand-600 hover:underline">
            Tambah produk lain
          </Link>
        </Card>
      </div>
    </div>
  );
}
