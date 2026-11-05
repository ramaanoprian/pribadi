import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarClock, ShoppingBag } from 'lucide-react';
import { useCatalog } from '@/hooks/usePublic';
import { useSeo } from '@/hooks/useSeo';
import { useCart } from '@/lib/cart';
import { formatRupiah } from '@/lib/format';
import { errorMessage } from '@/lib/errors';
import { ProductImage } from '@/components/product/ProductImage';
import { QtyStepper } from '@/components/product/QtyStepper';
import { stockInfo } from '@/components/product/ProductCard';
import { Badge } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';

export function ProductDetail() {
  const { slug } = useParams();
  const q = useCatalog();
  const cart = useCart();
  const toast = useToast();
  const navigate = useNavigate();
  const [qty, setQty] = useState(1);
  const found = q.data?.products.find((x) => x.slug === slug);
  useSeo({ title: found?.nama ?? 'Produk', description: found ? `${found.deskripsi} — Rp${found.harga.toLocaleString('id-ID')}/${found.satuan}` : undefined });

  if (q.isLoading) return <div className="mx-auto max-w-5xl px-4 py-10"><LoadingState /></div>;
  if (q.isError) return <div className="mx-auto max-w-5xl px-4 py-10"><ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} /></div>;
  const p = q.data?.products.find((x) => x.slug === slug);
  if (!p)
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <EmptyState title="Produk tidak ditemukan" description="Mungkin sudah tidak dijual." action={<Link to="/menu" className="font-semibold text-brand-600">Kembali ke menu</Link>} />
      </div>
    );

  const info = stockInfo(p);
  const max = p.sale_mode === 'ready_stock' ? Math.max(0, p.stok ?? 0) : 999;
  const add = (go: boolean) => {
    cart.add({ product_id: p.id, slug: p.slug, nama: p.nama, harga: p.harga, satuan: p.satuan, sale_mode: p.sale_mode, gambar_path: p.gambar_path }, qty);
    if (go) navigate('/keranjang');
    else toast('success', `${qty} ${p.satuan} ${p.nama} masuk keranjang.`);
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:py-10">
      <Link to="/menu" className="inline-flex items-center gap-1 text-sm font-semibold text-cocoa-600 hover:text-brand-600">
        <ArrowLeft className="size-4" /> Menu
      </Link>
      <div className="mt-4 grid gap-8 md:grid-cols-2">
        <ProductImage path={p.gambar_path} nama={p.nama} className="aspect-square w-full rounded-3xl" />
        <div>
          {p.kategori_nama && <p className="text-sm font-semibold tracking-wide text-brand-600 uppercase">{p.kategori_nama}</p>}
          <h1 className="mt-1 text-3xl font-bold sm:text-4xl">{p.nama}</h1>
          <div className="mt-3 flex items-center gap-3">
            <p className="text-2xl font-bold">{formatRupiah(p.harga)}</p>
            <span className="text-cocoa-500">/ {p.satuan}</span>
            <Badge tone={info.tone}>{info.label}</Badge>
          </div>
          <p className="mt-5 whitespace-pre-line text-cocoa-700">{p.deskripsi}</p>
          {p.sale_mode === 'preorder' && (
            <p className="mt-4 flex items-start gap-2 rounded-xl bg-sky-50 p-3 text-sm text-sky-900 ring-1 ring-sky-200">
              <CalendarClock className="mt-0.5 size-4 shrink-0" /> Produk pre-order dibuat sesuai jadwal ambil/antar yang Anda pilih saat checkout.
            </p>
          )}
          {info.soldOut ? (
            <p className="mt-6 font-semibold text-red-700">Stok sedang habis.</p>
          ) : (
            <div className="mt-6 space-y-3">
              <QtyStepper value={qty} onChange={(v) => setQty(Math.max(1, Math.min(max, v)))} max={max} size="lg" />
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button size="lg" icon={<ShoppingBag className="size-5" />} onClick={() => add(false)}>
                  Tambah ke keranjang
                </Button>
                <Button size="lg" variant="secondary" onClick={() => add(true)}>
                  Beli sekarang
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
