import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { clsx } from 'clsx';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';
import { Card, PageHeader } from '@/components/ui/Card';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';

const JENIS: Record<string, string> = {
  pesanan: 'Pesanan dikonfirmasi',
  batal_pesanan: 'Pesanan batal',
  produksi: 'Produksi',
  batal_produksi: 'Batal produksi',
  koreksi: 'Koreksi',
};

export function FinishedStock() {
  const q = useQuery({
    queryKey: ['products', 'stok_jadi'],
    queryFn: async () => {
      const [p, m] = await Promise.all([
        supabase.from('products').select('id, nama, satuan, stok, aktif').eq('sale_mode', 'ready_stock').order('nama'),
        supabase.from('stock_movements').select('id, product_id, qty, stok_sesudah, jenis, ref_id, alasan, created_at').not('product_id', 'is', null).order('created_at', { ascending: false }).limit(30),
      ]);
      if (p.error) throw p.error;
      if (m.error) throw m.error;
      return { products: p.data, moves: m.data };
    },
  });
  if (q.isLoading) return <LoadingState />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />;
  const names = new Map(q.data!.products.map((p) => [p.id, p.nama]));
  return (
    <>
      <PageHeader title="Stok Produk Jadi" description="Bertambah dari produksi, berkurang saat pembayaran pesanan dikonfirmasi. Koreksi manual ada di Katalog." />
      <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
        <Card>
          <h2 className="mb-3 font-sans font-bold">Stok saat ini (ready stock)</h2>
          {q.data!.products.length === 0 ? (
            <EmptyState title="Tidak ada produk ready stock" />
          ) : (
            <ul className="divide-y divide-cream-200">
              {q.data!.products.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-2.5">
                  <span className={clsx(!p.aktif && 'text-cocoa-400')}>{p.nama}</span>
                  <span className={clsx('font-bold tabular-nums', p.stok === 0 ? 'text-red-600' : p.stok <= 5 ? 'text-amber-700' : '')}>
                    {p.stok} <span className="text-xs font-normal text-cocoa-500">{p.satuan}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Link to="/dashboard/katalog" className="mt-3 inline-block text-sm font-semibold text-brand-600 hover:underline">
            Koreksi stok di Katalog
          </Link>
        </Card>
        <Card>
          <h2 className="mb-3 font-sans font-bold">Pergerakan terbaru</h2>
          {q.data!.moves.length === 0 ? (
            <p className="text-sm text-cocoa-500">Belum ada pergerakan.</p>
          ) : (
            <ul className="divide-y divide-cream-200 text-sm">
              {q.data!.moves.map((m) => (
                <li key={m.id} className="flex justify-between gap-3 py-2">
                  <span>
                    <span className="font-semibold">{names.get(m.product_id!) ?? 'Produk'}</span> · {JENIS[m.jenis] ?? m.jenis}
                    <span className="block text-xs text-cocoa-500">
                      {formatDateTime(m.created_at)}
                      {m.jenis.includes('pesanan') && m.ref_id ? ` · ${m.ref_id}` : ''}
                      {m.alasan ? ` · ${m.alasan}` : ''}
                    </span>
                  </span>
                  <span className="text-right tabular-nums">
                    <span className={Number(m.qty) < 0 ? 'text-red-700' : 'text-emerald-700'}>
                      {Number(m.qty) > 0 ? '+' : ''}
                      {Number(m.qty)}
                    </span>
                    <span className="block text-xs text-cocoa-500">sisa {Number(m.stok_sesudah)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
