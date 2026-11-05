import { useSearchParams } from 'react-router-dom';
import { clsx } from 'clsx';
import { useCatalog } from '@/hooks/usePublic';
import { errorMessage } from '@/lib/errors';
import { ProductCard } from '@/components/product/ProductCard';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { useSeo } from '@/hooks/useSeo';

export function Menu() {
  const [params, setParams] = useSearchParams();
  const active = params.get('kategori') ?? '';
  const q = useCatalog();
  useSeo({ title: 'Menu', description: 'Daftar kue, roti, pastry & kue kering GutVibes — ready stock dan pre-order.' });

  const products = (q.data?.products ?? []).filter((p) => !active || p.kategori_slug === active);
  const chip = (on: boolean) =>
    clsx('h-10 shrink-0 rounded-full px-4 text-sm font-semibold transition', on ? 'bg-cocoa-800 text-white' : 'bg-white text-cocoa-700 ring-1 ring-cream-300 hover:bg-cream-50');

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:py-12">
      <h1 className="text-3xl font-bold sm:text-4xl">Menu</h1>
      <p className="mt-1 text-cocoa-600">Produk ready stock bisa diambil hari ini; pre-order dibuat khusus sesuai jadwal Anda.</p>

      <div className="-mx-4 mt-6 flex gap-2 overflow-x-auto px-4 pb-1" role="tablist" aria-label="Filter kategori">
        <button role="tab" aria-selected={!active} className={chip(!active)} onClick={() => setParams({})}>
          Semua
        </button>
        {q.data?.categories.map((c) => (
          <button key={c.id} role="tab" aria-selected={active === c.slug} className={chip(active === c.slug)} onClick={() => setParams({ kategori: c.slug })}>
            {c.nama}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {q.isLoading ? (
          <LoadingState label="Memuat menu…" />
        ) : q.isError ? (
          <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
        ) : products.length === 0 ? (
          <EmptyState title="Belum ada produk di kategori ini" />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
            {products.map((p) => (
              <ProductCard key={p.id} p={p} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
