import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import type { Views } from '@/lib/database.types';
import { formatRupiah } from '@/lib/format';
import { useCart } from '@/lib/cart';
import { useToast } from '@/components/ui/Toast';
import { Badge } from '@/components/ui/Card';
import { ProductImage } from './ProductImage';

type P = Views<'katalog_produk'>;

export function stockInfo(p: Pick<P, 'sale_mode' | 'stok'>): { label: string; tone: 'green' | 'amber' | 'red' | 'blue'; soldOut: boolean } {
  if (p.sale_mode === 'preorder') return { label: 'Pre-order', tone: 'blue', soldOut: false };
  const s = p.stok ?? 0;
  if (s <= 0) return { label: 'Habis', tone: 'red', soldOut: true };
  if (s <= 5) return { label: `Sisa ${s}`, tone: 'amber', soldOut: false };
  return { label: 'Ready', tone: 'green', soldOut: false };
}

export function ProductCard({ p }: { p: P }) {
  const cart = useCart();
  const toast = useToast();
  const info = stockInfo(p);
  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl bg-white ring-1 ring-cream-200 transition hover:shadow-lg hover:shadow-brand-500/5">
      <Link to={`/menu/${p.slug}`} className="relative block">
        <ProductImage path={p.gambar_path} nama={p.nama} className="aspect-[4/3] w-full transition group-hover:scale-[1.02]" />
        <Badge tone={info.tone} className="absolute top-3 left-3 shadow-sm">
          {info.label}
        </Badge>
      </Link>
      <div className="flex flex-1 flex-col p-4">
        {p.kategori_nama && <p className="text-xs font-semibold tracking-wide text-brand-600 uppercase">{p.kategori_nama}</p>}
        <Link to={`/menu/${p.slug}`} className="mt-0.5 font-bold text-cocoa-900 hover:text-brand-600">
          {p.nama}
        </Link>
        <p className="mt-1 line-clamp-2 text-sm text-cocoa-600">{p.deskripsi}</p>
        <div className="mt-auto flex items-center justify-between pt-3">
          <p className="font-bold">
            {formatRupiah(p.harga)}
            <span className="text-xs font-normal text-cocoa-500"> /{p.satuan}</span>
          </p>
          <button
            type="button"
            disabled={info.soldOut}
            onClick={() => {
              cart.add({ product_id: p.id, slug: p.slug, nama: p.nama, harga: p.harga, satuan: p.satuan, sale_mode: p.sale_mode, gambar_path: p.gambar_path });
              toast('success', `${p.nama} masuk keranjang.`);
            }}
            className="grid size-10 place-items-center rounded-xl bg-brand-500 text-white hover:bg-brand-600 disabled:bg-cream-300"
            aria-label={`Tambah ${p.nama} ke keranjang`}
          >
            <Plus className="size-5" />
          </button>
        </div>
      </div>
    </article>
  );
}
