import { clsx } from 'clsx';
import { productImageUrl } from '@/lib/storage';

/** Foto produk; bila belum ada foto, tampilkan ilustrasi bergaya merek. */
export function ProductImage({ path, nama, className }: { path: string | null | undefined; nama: string; className?: string }) {
  const url = productImageUrl(path);
  if (url) return <img src={url} alt={nama} loading="lazy" className={clsx('object-cover', className)} />;
  return (
    <div className={clsx('relative grid place-items-center overflow-hidden bg-gradient-to-br from-cream-200 to-brand-100', className)} role="img" aria-label={nama}>
      <img src="/brand/symbol.png" alt="" className="absolute -right-6 -bottom-6 w-2/3 opacity-15" />
      <span className="font-display text-5xl font-extrabold text-brand-500/80">{nama.charAt(0)}</span>
    </div>
  );
}
