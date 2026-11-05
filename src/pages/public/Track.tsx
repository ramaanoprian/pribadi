import { useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Copy, MessageCircle, PackageSearch, Stamp } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/auth/AuthProvider';
import { errorMessage } from '@/lib/errors';
import { formatDateTime, formatRupiah } from '@/lib/format';
import { formatPhone, normalizePhone } from '@/lib/phone';
import { FULFILLMENT_LABEL, PAYMENT_LABEL, waLink, type PublicOrder } from '@/lib/orders';
import { useContent } from '@/hooks/usePublic';
import { OrderSummary, OrderTimeline, StatusBadge } from '@/components/order/OrderParts';
import { Alert, Badge, Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';

export function OrderView({ order, isNew }: { order: PublicOrder; isNew?: boolean }) {
  const { session } = useAuth();
  const { c } = useContent();
  const toast = useToast();
  const storeWa = normalizePhone(c('kontak.whatsapp'));
  const confirmWa = waLink(
    storeWa,
    `Halo, saya ${order.nama_pemesan} ingin konfirmasi pesanan ${order.kode} (total ${formatRupiah(order.total)}${order.fulfillment === 'antar' && !order.ongkir_diset ? ' + ongkir' : ''}).`,
  );
  const unpaid = order.payment_status === 'belum_bayar' && order.status !== 'dibatalkan';
  const trackUrl = `${window.location.origin}/lacak/${order.tracking_code}`;

  return (
    <div className="space-y-5">
      {isNew && (
        <Alert tone="green" title="Pesanan berhasil dibuat!">
          Simpan kode pesanan <strong>{order.kode}</strong>. Konfirmasi juga dikirim ke WhatsApp {formatPhone(order.no_hp)}.
        </Alert>
      )}
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-cocoa-500">Kode pesanan</p>
            <p className="font-display text-2xl font-bold tracking-wide">{order.kode}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusBadge status={order.status} />
            <Badge tone={order.payment_status === 'lunas' ? 'green' : 'neutral'}>{PAYMENT_LABEL[order.payment_status]}</Badge>
          </div>
        </div>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-cocoa-500">{FULFILLMENT_LABEL[order.fulfillment]}</dt>
            <dd className="font-semibold">{formatDateTime(order.jadwal)}</dd>
          </div>
          <div>
            <dt className="text-cocoa-500">Pemesan</dt>
            <dd className="font-semibold">
              {order.nama_pemesan} · {formatPhone(order.no_hp)}
            </dd>
          </div>
          {order.alamat_antar && (
            <div className="sm:col-span-2">
              <dt className="text-cocoa-500">Alamat</dt>
              <dd>{order.alamat_antar}</dd>
            </div>
          )}
          {order.courier_name && (
            <div>
              <dt className="text-cocoa-500">Kurir</dt>
              <dd>{order.courier_name}</dd>
            </div>
          )}
          {order.alasan_batal && (
            <div className="sm:col-span-2">
              <dt className="text-cocoa-500">Alasan pembatalan</dt>
              <dd className="text-red-700">{order.alasan_batal}</dd>
            </div>
          )}
        </dl>
      </Card>

      {unpaid && (
        <Card className="bg-cream-50">
          <h2 className="font-sans font-bold">Cara pembayaran</h2>
          <p className="mt-1 text-sm whitespace-pre-line text-cocoa-700">{c('pembayaran.instruksi')}</p>
          {order.fulfillment === 'antar' && !order.ongkir_diset && <p className="mt-2 text-sm text-amber-800">Tunggu konfirmasi ongkir dari admin sebelum transfer.</p>}
          {confirmWa && (
            <a href={confirmWa} target="_blank" rel="noreferrer" className="mt-3 inline-flex h-11 items-center gap-2 rounded-xl bg-emerald-600 px-4 font-semibold text-white hover:bg-emerald-700">
              <MessageCircle className="size-4" /> Konfirmasi via WhatsApp
            </a>
          )}
        </Card>
      )}

      <div className="grid gap-5 md:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-sans font-bold">Status</h2>
          <OrderTimeline order={order} />
        </Card>
        <Card>
          <h2 className="mb-1 font-sans font-bold">Rincian</h2>
          <OrderSummary order={{ ...order, items: order.items.map((i) => ({ ...i, nama: i.nama })) }} />
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Button
          variant="secondary"
          size="sm"
          icon={<Copy className="size-4" />}
          onClick={() => {
            void navigator.clipboard?.writeText(trackUrl).then(() => toast('success', 'Tautan lacak disalin.'));
          }}
        >
          Salin tautan lacak
        </Button>
        <span className="text-cocoa-500">Simpan tautan ini untuk memantau pesanan.</span>
      </div>

      {isNew && !session && (
        <Card className="flex flex-col items-start gap-3 bg-brand-50 ring-brand-100 sm:flex-row sm:items-center">
          <Stamp className="size-8 shrink-0 text-brand-500" />
          <div className="flex-1">
            <p className="font-bold">Daftar sekarang, pesanan ini langsung dapat stamp.</p>
            <p className="text-sm text-cocoa-600">Daftar dengan nomor {formatPhone(order.no_hp)} — setelah nomor diverifikasi, pesanan ini dihitung ke kartu stamp Anda.</p>
          </div>
          <Link
            to={`/daftar?nama=${encodeURIComponent(order.nama_pemesan)}&hp=${encodeURIComponent(formatPhone(order.no_hp))}`}
            className="inline-flex h-11 items-center rounded-xl bg-brand-500 px-4 font-semibold text-white hover:bg-brand-600"
          >
            Daftar member
          </Link>
        </Card>
      )}
    </div>
  );
}

/** /lacak/:token — dari tautan rahasia (juga halaman sukses checkout). */
export function TrackByToken() {
  const { token } = useParams();
  const [params] = useSearchParams();
  const q = useQuery({
    queryKey: ['lacak', token],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('track_order_by_token', { p_token: token! });
      if (error) throw error;
      return data as unknown as PublicOrder | null;
    },
    refetchInterval: 60_000,
  });
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:py-12">
      {q.isLoading ? (
        <LoadingState label="Memuat pesanan…" />
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
      ) : !q.data ? (
        <EmptyState title="Pesanan tidak ditemukan" description="Tautan tidak valid." action={<Link to="/lacak" className="font-semibold text-brand-600">Lacak dengan kode pesanan</Link>} />
      ) : (
        <OrderView order={q.data} isNew={params.get('baru') === '1'} />
      )}
    </div>
  );
}

/** /lacak — kode pesanan + nomor HP, tanpa login. */
export function Track() {
  const [kode, setKode] = useState('');
  const [hp, setHp] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<PublicOrder | null | undefined>(undefined);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!kode.trim() || !normalizePhone(hp)) return setError('Isi kode pesanan dan nomor HP yang valid.');
    setBusy(true);
    const { data, error } = await supabase.rpc('track_order', { p_kode: kode.trim(), p_no_hp: hp });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    setOrder((data as unknown as PublicOrder) ?? null);
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:py-12">
      <h1 className="text-3xl font-bold">Lacak Pesanan</h1>
      <p className="mt-1 text-cocoa-600">Masukkan kode pesanan dan nomor WhatsApp yang dipakai saat memesan.</p>
      <Card className="mt-6">
        <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Input label="Kode pesanan" placeholder="GV-241105-ABCD" value={kode} onChange={(e) => setKode(e.target.value.toUpperCase())} />
          <Input label="Nomor HP" type="tel" inputMode="tel" placeholder="0812xxxxxxxx" value={hp} onChange={(e) => setHp(e.target.value)} />
          <Button type="submit" loading={busy} icon={<PackageSearch className="size-4" />}>
            Lacak
          </Button>
        </form>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </Card>
      <div className="mt-6">
        {order === null && <EmptyState title="Pesanan tidak ditemukan" description="Periksa kembali kode pesanan dan nomor HP Anda." />}
        {order && <OrderView order={order} />}
      </div>
      {order === undefined && (
        <p className="mt-6 flex items-center gap-2 text-sm text-cocoa-500">
          <CheckCircle2 className="size-4" /> Member bisa melihat semua pesanan di <Link to="/akun" className="font-semibold text-brand-600">Akun Saya</Link>.
        </p>
      )}
    </div>
  );
}
