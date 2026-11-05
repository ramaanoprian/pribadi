import type { Fulfillment, OrderStatus, PaymentStatus, SaleMode } from './database.types';

export const STATUS_LABEL: Record<OrderStatus, string> = {
  menunggu_konfirmasi: 'Menunggu konfirmasi',
  dikonfirmasi: 'Dikonfirmasi',
  siap: 'Siap',
  selesai: 'Selesai',
  dibatalkan: 'Dibatalkan',
};

export const STATUS_TONE: Record<OrderStatus, 'amber' | 'blue' | 'brand' | 'green' | 'red'> = {
  menunggu_konfirmasi: 'amber',
  dikonfirmasi: 'blue',
  siap: 'brand',
  selesai: 'green',
  dibatalkan: 'red',
};

export const PAYMENT_LABEL: Record<PaymentStatus, string> = { belum_bayar: 'Belum dibayar', lunas: 'Lunas' };
export const FULFILLMENT_LABEL: Record<Fulfillment, string> = { ambil: 'Ambil di toko', antar: 'Diantar' };
export const SALE_MODE_LABEL: Record<SaleMode, string> = { ready_stock: 'Ready stock', preorder: 'Pre-order' };

/** Bentuk data pesanan yang dikembalikan create_order / track_order. */
export type PublicOrder = {
  kode: string;
  tracking_code: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  fulfillment: Fulfillment;
  jadwal: string;
  nama_pemesan: string;
  no_hp: string;
  alamat_antar: string | null;
  catatan: string | null;
  subtotal: number;
  diskon: number;
  promo_kode: string | null;
  shipping_cost: number;
  ongkir_diset: boolean;
  gratis_ongkir: boolean;
  courier_name: string | null;
  total: number;
  created_at: string;
  confirmed_at: string | null;
  ready_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  alasan_batal: string | null;
  /** Status notifikasi WhatsApp "pesanan diterima" (null bila tidak diantrekan) */
  notif_wa: 'pending' | 'mengirim' | 'terkirim' | 'gagal' | null;
  items: { product_id: string | null; nama: string; satuan: string; sale_mode: SaleMode; harga: number; qty: number; subtotal: number }[];
};

/** Langkah linimasa pesanan untuk pelanggan & admin. */
export function orderSteps(o: Pick<PublicOrder, 'status' | 'fulfillment' | 'created_at' | 'confirmed_at' | 'ready_at' | 'completed_at' | 'cancelled_at'>) {
  const steps = [
    { key: 'diterima', label: 'Pesanan diterima', at: o.created_at },
    { key: 'dikonfirmasi', label: 'Pembayaran dikonfirmasi', at: o.confirmed_at },
    { key: 'siap', label: o.fulfillment === 'antar' ? 'Siap dikirim' : 'Siap diambil', at: o.ready_at },
    { key: 'selesai', label: 'Selesai', at: o.completed_at },
  ];
  if (o.status === 'dibatalkan') return [...steps.filter((s) => s.at), { key: 'dibatalkan', label: 'Dibatalkan', at: o.cancelled_at }];
  return steps;
}

/** Tautan wa.me ke nomor 628xx dengan pesan terisi. */
export function waLink(phone628: string | null | undefined, text: string): string | null {
  if (!phone628) return null;
  return `https://wa.me/${phone628}?text=${encodeURIComponent(text)}`;
}

/** Nilai default jadwal: besok 10.00 waktu lokal, format untuk input datetime-local. */
export function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
