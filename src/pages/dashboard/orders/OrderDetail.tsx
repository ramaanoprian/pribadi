import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Ban, CheckCircle2, FileImage, MessageCircle, PackageCheck, Truck, Wallet } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/errors';
import { formatDateTime, formatRupiah } from '@/lib/format';
import { formatPhone } from '@/lib/phone';
import { uploadFile } from '@/lib/storage';
import { FULFILLMENT_LABEL, PAYMENT_LABEL, waLink } from '@/lib/orders';
import { OrderSummary, OrderTimeline, StatusBadge } from '@/components/order/OrderParts';
import { Alert, Badge, Card, PageHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { ErrorState, LoadingState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';

export function OrderDetail() {
  const { id } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const [modal, setModal] = useState<'bayar' | 'ongkir' | 'batal' | null>(null);

  const q = useQuery({
    queryKey: ['orders', 'detail', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('*, order_items(id, nama_produk, satuan, sale_mode, harga, qty, subtotal), customers(id, nama, user_id)')
        .eq('id', id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const proof = useQuery({
    queryKey: ['bukti', q.data?.bukti_transfer_path],
    enabled: Boolean(q.data?.bukti_transfer_path),
    queryFn: async () => {
      const { data, error } = await supabase.storage.from('bukti-transfer').createSignedUrl(q.data!.bukti_transfer_path!, 300);
      if (error) throw error;
      return data.signedUrl;
    },
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['orders'] });
  };

  const action = useMutation({
    mutationFn: async (kind: 'siap' | 'selesai') => {
      const { error } = kind === 'siap' ? await supabase.rpc('mark_order_ready', { p_id: id! }) : await supabase.rpc('complete_order', { p_id: id! });
      if (error) throw error;
      return kind;
    },
    onSuccess: (kind) => {
      toast('success', kind === 'siap' ? 'Pesanan ditandai siap.' : 'Pesanan selesai.');
      refresh();
    },
    onError: (e) => toast('error', errorMessage(e)),
  });

  if (q.isLoading) return <LoadingState />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />;
  const o = q.data;
  if (!o) return <ErrorState message="Pesanan tidak ditemukan." />;

  const open = o.status !== 'selesai' && o.status !== 'dibatalkan';
  const chat = waLink(o.no_hp, `Halo ${o.nama_pemesan}, terkait pesanan GutVibes ${o.kode}: `);

  let primary: ReactNode = null;
  if (o.status === 'menunggu_konfirmasi') {
    primary =
      o.fulfillment === 'antar' && !o.ongkir_diset ? (
        <Button icon={<Truck className="size-4" />} onClick={() => setModal('ongkir')}>
          Isi ongkir dulu
        </Button>
      ) : (
        <Button icon={<Wallet className="size-4" />} onClick={() => setModal('bayar')}>
          Konfirmasi pembayaran
        </Button>
      );
  } else if (o.status === 'dikonfirmasi') {
    primary = (
      <Button icon={<PackageCheck className="size-4" />} loading={action.isPending} onClick={() => action.mutate('siap')}>
        Tandai {o.fulfillment === 'antar' ? 'siap dikirim' : 'siap diambil'}
      </Button>
    );
  } else if (o.status === 'siap') {
    primary = (
      <Button icon={<CheckCircle2 className="size-4" />} loading={action.isPending} onClick={() => action.mutate('selesai')}>
        Selesaikan pesanan
      </Button>
    );
  }

  return (
    <>
      <Link to="/dashboard/pesanan" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-cocoa-600 hover:text-brand-600">
        <ArrowLeft className="size-4" /> Daftar pesanan
      </Link>
      <PageHeader
        title={o.kode}
        description={`Dibuat ${formatDateTime(o.created_at)}`}
        actions={
          <>
            {primary}
            {open && o.fulfillment === 'antar' && o.status !== 'menunggu_konfirmasi' && (
              <Button variant="secondary" icon={<Truck className="size-4" />} onClick={() => setModal('ongkir')}>
                Kurir
              </Button>
            )}
            {open && o.status === 'menunggu_konfirmasi' && o.fulfillment === 'antar' && o.ongkir_diset && (
              <Button variant="secondary" icon={<Truck className="size-4" />} onClick={() => setModal('ongkir')}>
                Ubah ongkir
              </Button>
            )}
            {open && (
              <Button variant="ghost" icon={<Ban className="size-4" />} onClick={() => setModal('batal')}>
                Batalkan
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-5">
          <Card>
            <div className="flex flex-wrap gap-2">
              <StatusBadge status={o.status} />
              <Badge tone={o.payment_status === 'lunas' ? 'green' : 'neutral'}>{PAYMENT_LABEL[o.payment_status]}</Badge>
              <Badge>{FULFILLMENT_LABEL[o.fulfillment]}</Badge>
              {o.gratis_ongkir && <Badge tone="green">Gratis ongkir</Badge>}
            </div>
            <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
              <Info label="Pelanggan">
                {o.nama_pemesan} {o.user_id ? <Badge tone="brand">Member</Badge> : <Badge>Tamu</Badge>}
                <br />
                <span className="text-cocoa-600">{formatPhone(o.no_hp)}</span>
                {chat && (
                  <a href={chat} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-1 font-semibold text-emerald-700 hover:underline">
                    <MessageCircle className="size-3.5" /> Chat
                  </a>
                )}
              </Info>
              <Info label={o.fulfillment === 'antar' ? 'Jadwal antar' : 'Jadwal ambil'}>
                <span className="font-semibold">{formatDateTime(o.jadwal)}</span>
              </Info>
              {o.alamat_antar && <Info label="Alamat">{o.alamat_antar}</Info>}
              {o.courier_name && <Info label="Kurir">{o.courier_name}</Info>}
              {o.catatan && <Info label="Catatan pelanggan">{o.catatan}</Info>}
              {o.alasan_batal && <Info label="Alasan batal">{o.alasan_batal}</Info>}
            </dl>
          </Card>
          <Card>
            <h2 className="font-sans font-bold">Item</h2>
            <OrderSummary order={{ ...o, items: o.order_items.map((i) => ({ ...i, nama: i.nama_produk })) }} />
            {o.order_items.some((i) => i.sale_mode === 'ready_stock') && (
              <p className="mt-3 text-xs text-cocoa-500">
                Item ready stock {o.stok_dipotong ? 'sudah memotong stok.' : 'akan memotong stok saat pembayaran dikonfirmasi.'}
              </p>
            )}
          </Card>
        </div>
        <div className="space-y-5">
          <Card>
            <h2 className="mb-3 font-sans font-bold">Linimasa</h2>
            <OrderTimeline order={o} />
          </Card>
          {o.bukti_transfer_path && (
            <Card>
              <h2 className="font-sans font-bold">Bukti transfer</h2>
              {proof.data ? (
                <a href={proof.data} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-2 font-semibold text-brand-600 hover:underline">
                  <FileImage className="size-4" /> Lihat bukti
                </a>
              ) : (
                <p className="mt-2 text-sm text-cocoa-500">Memuat…</p>
              )}
            </Card>
          )}
          <Link to={`/lacak/${o.tracking_code}`} target="_blank" className="block text-center text-sm font-semibold text-brand-600 hover:underline">
            Lihat halaman lacak pelanggan
          </Link>
        </div>
      </div>

      {modal === 'bayar' && <ConfirmPaymentModal order={o} onClose={() => setModal(null)} onDone={refresh} />}
      {modal === 'ongkir' && <ShippingModal order={o} onClose={() => setModal(null)} onDone={refresh} />}
      {modal === 'batal' && <CancelModal order={o} onClose={() => setModal(null)} onDone={refresh} />}
    </>
  );
}

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-cocoa-500">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

type O = { id: string; kode: string; total: number; fulfillment: string; status: string; shipping_cost: number; courier_name: string | null; gratis_ongkir: boolean; ongkir_diset: boolean };

function ConfirmPaymentModal({ order, onClose, onDone }: { order: O; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const m = useMutation({
    mutationFn: async () => {
      const path = file ? await uploadFile('bukti-transfer', order.kode, file, 3 * 1024 * 1024) : null;
      const { error } = await supabase.rpc('confirm_order_payment', { p_id: order.id, p_bukti_path: path });
      if (error) throw error;
    },
    onSuccess: () => {
      toast('success', 'Pembayaran dikonfirmasi.');
      onDone();
      onClose();
    },
    onError: (e) => toast('error', errorMessage(e)),
  });
  return (
    <Modal
      open
      onClose={onClose}
      title="Konfirmasi pembayaran"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Batal
          </Button>
          <Button loading={m.isPending} onClick={() => m.mutate()}>
            Pembayaran diterima
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <p>
          Pastikan transfer sebesar <strong>{formatRupiah(order.total)}</strong> untuk pesanan <strong>{order.kode}</strong> sudah masuk.
        </p>
        <Alert tone="blue">Item ready stock akan langsung mengurangi stok produk jadi. Pelanggan menerima notifikasi “pembayaran dikonfirmasi”.</Alert>
        <label className="block">
          <span className="font-semibold">Bukti transfer (opsional)</span>
          <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="mt-1.5 block w-full text-sm" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <span className="text-xs text-cocoa-500">JPG/PNG/WEBP/PDF, maks. 3 MB.</span>
        </label>
      </div>
    </Modal>
  );
}

function ShippingModal({ order, onClose, onDone }: { order: O; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const editableCost = order.status === 'menunggu_konfirmasi' && !order.gratis_ongkir;
  const [ongkir, setOngkir] = useState(order.ongkir_diset ? String(order.shipping_cost) : '');
  const [kurir, setKurir] = useState(order.courier_name ?? '');
  const m = useMutation({
    mutationFn: async () => {
      const cost = editableCost ? Number(ongkir) : null;
      if (editableCost && (!ongkir.trim() || Number.isNaN(cost) || cost! < 0)) throw new Error('Isi ongkir dengan angka (boleh 0).');
      const { error } = await supabase.rpc('set_order_shipping', { p_id: order.id, p_ongkir: cost, p_kurir: kurir });
      if (error) throw error;
    },
    onSuccess: () => {
      toast('success', 'Pengiriman diperbarui.');
      onDone();
      onClose();
    },
    onError: (e) => toast('error', errorMessage(e)),
  });
  return (
    <Modal
      open
      onClose={onClose}
      title="Ongkir & kurir"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Batal
          </Button>
          <Button loading={m.isPending} onClick={() => m.mutate()}>
            Simpan
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {order.gratis_ongkir && <Alert tone="green">Pesanan ini memenuhi syarat gratis ongkir.</Alert>}
        {editableCost && (
          <Input label="Ongkir (Rp)" type="number" inputMode="numeric" min={0} value={ongkir} onChange={(e) => setOngkir(e.target.value)} hint="Total pesanan akan dihitung ulang." />
        )}
        {!editableCost && !order.gratis_ongkir && <p className="text-sm text-cocoa-600">Ongkir terkunci setelah pembayaran dikonfirmasi ({formatRupiah(order.shipping_cost)}).</p>}
        <Input label="Nama kurir" value={kurir} onChange={(e) => setKurir(e.target.value)} maxLength={60} placeholder="Mis. GoSend, GrabExpress, kurir toko" />
      </div>
    </Modal>
  );
}

function CancelModal({ order, onClose, onDone }: { order: O; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [alasan, setAlasan] = useState('');
  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('cancel_order', { p_id: order.id, p_alasan: alasan });
      if (error) throw error;
    },
    onSuccess: () => {
      toast('success', 'Pesanan dibatalkan.');
      onDone();
      onClose();
    },
    onError: (e) => toast('error', errorMessage(e)),
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={`Batalkan ${order.kode}?`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Kembali
          </Button>
          <Button variant="danger" loading={m.isPending} disabled={alasan.trim().length < 3} onClick={() => m.mutate()}>
            Batalkan pesanan
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        {order.status !== 'menunggu_konfirmasi' && <Alert tone="amber">Stok ready stock akan dikembalikan. Pengembalian dana dilakukan manual.</Alert>}
        <Textarea label="Alasan pembatalan" value={alasan} onChange={(e) => setAlasan(e.target.value)} maxLength={300} required hint="Wajib diisi. Dikirim ke pelanggan & tercatat di log." />
      </div>
    </Modal>
  );
}
