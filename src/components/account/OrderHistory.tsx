import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { RotateCcw, ShoppingBag } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/auth/AuthProvider';
import { useCart } from '@/lib/cart';
import { errorMessage } from '@/lib/errors';
import { formatDateTime, formatRupiah } from '@/lib/format';
import { FULFILLMENT_LABEL } from '@/lib/orders';
import { StatusBadge } from '@/components/order/OrderParts';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Pagination } from '@/components/ui/Table';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';

const PAGE = 5;

export function OrderHistory() {
  const { profile } = useAuth();
  const cart = useCart();
  const toast = useToast();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [reordering, setReordering] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ['my_orders', profile?.id, page],
    enabled: Boolean(profile),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const from = (page - 1) * PAGE;
      const { data, error, count } = await supabase
        .from('orders')
        .select('id, kode, tracking_code, status, fulfillment, jadwal, total, created_at, order_items(product_id, nama_produk, qty)', { count: 'exact' })
        .eq('user_id', profile!.id)
        .order('created_at', { ascending: false })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      return { rows: data, total: count ?? 0 };
    },
  });

  /** Pesan ulang 1 klik: isi keranjang dengan item yang masih dijual (harga terbaru). */
  async function reorder(items: { product_id: string | null; qty: number }[], kode: string) {
    setReordering(kode);
    const ids = items.map((i) => i.product_id).filter(Boolean) as string[];
    const { data, error } = await supabase.from('katalog_produk').select('*').in('id', ids);
    setReordering(null);
    if (error) return toast('error', errorMessage(error));
    const live = new Map(data.map((p) => [p.id, p]));
    const next = items.flatMap((i) => {
      const p = i.product_id ? live.get(i.product_id) : undefined;
      if (!p) return [];
      const qty = p.sale_mode === 'ready_stock' ? Math.min(i.qty, p.stok ?? 0) : i.qty;
      return qty > 0 ? [{ product_id: p.id, slug: p.slug, nama: p.nama, harga: p.harga, satuan: p.satuan, sale_mode: p.sale_mode, gambar_path: p.gambar_path, qty }] : [];
    });
    if (next.length === 0) return toast('error', 'Produk di pesanan ini sedang tidak tersedia.');
    cart.replace(next);
    if (next.length < items.length) toast('error', 'Sebagian produk tidak tersedia dan dilewati.');
    navigate('/keranjang');
  }

  return (
    <Card>
      <h2 className="font-sans text-lg font-bold">Riwayat pesanan</h2>
      <div className="mt-4">
        {q.isLoading ? (
          <LoadingState />
        ) : q.isError ? (
          <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
        ) : !q.data?.rows.length ? (
          <EmptyState
            icon={<ShoppingBag className="size-8" />}
            title="Belum ada pesanan"
            action={
              <Link to="/menu" className="font-semibold text-brand-600">
                Mulai pesan
              </Link>
            }
          />
        ) : (
          <>
            <ul className="space-y-3">
              {q.data.rows.map((o) => (
                <li key={o.id} className="rounded-xl border border-cream-200 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link to={`/lacak/${o.tracking_code}`} className="font-semibold hover:text-brand-600">
                      {o.kode}
                    </Link>
                    <StatusBadge status={o.status} />
                  </div>
                  <p className="mt-1 text-sm text-cocoa-600">
                    {o.order_items.map((i) => `${i.nama_produk} ×${i.qty}`).join(', ')}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="text-cocoa-500">
                      {FULFILLMENT_LABEL[o.fulfillment]} · {formatDateTime(o.jadwal)}
                    </span>
                    <span className="font-bold">{formatRupiah(o.total)}</span>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="mt-3"
                    icon={<RotateCcw className="size-4" />}
                    loading={reordering === o.kode}
                    onClick={() => void reorder(o.order_items, o.kode)}
                  >
                    Pesan ulang
                  </Button>
                </li>
              ))}
            </ul>
            <Pagination page={page} pageSize={PAGE} total={q.data.total} onPage={setPage} />
          </>
        )}
      </div>
    </Card>
  );
}
