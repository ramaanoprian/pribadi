export type PL = {
  dari: string;
  sampai: string;
  jumlah_pesanan: number;
  penjualan_kotor: number;
  diskon: number;
  penjualan_bersih: number;
  pendapatan_ongkir: number;
  pendapatan: number;
  hpp: number;
  laba_kotor: number;
  biaya_operasional: number;
  biaya_per_kategori: { kategori: string; total: number }[];
  laba_bersih: number;
  per_produk?: { nama: string; qty: number; pendapatan: number; hpp: number; margin: number; margin_persen: number | null }[];
};

export type OwnerDashboard = {
  bulan: string;
  ringkasan: PL;
  tren: { bulan: string; pendapatan: number; total_biaya: number; laba_bersih: number }[];
  anggaran: { kategori: string; anggaran: number; realisasi: number }[];
  biaya_terbesar: { tanggal: string; kategori: string; keterangan: string | null; nominal: number }[];
};

const pad = (n: number) => String(n).padStart(2, '0');
/** YYYY-MM-DD lokal (bukan UTC). */
export const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const monthStart = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), 1);
export const monthEnd = (d = new Date()) => new Date(d.getFullYear(), d.getMonth() + 1, 0);
export const monthLabel = (iso: string, style: 'short' | 'long' = 'long') =>
  new Date(`${iso.slice(0, 7)}-01T00:00:00`).toLocaleDateString('id-ID', { month: style, year: style === 'long' ? 'numeric' : '2-digit' });

/** Pilihan rentang cepat untuk laporan. */
export function presetRange(key: string): [string, string] {
  const now = new Date();
  switch (key) {
    case 'bulan_lalu': {
      const m = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return [isoDate(monthStart(m)), isoDate(monthEnd(m))];
    }
    case '3_bulan':
      return [isoDate(new Date(now.getFullYear(), now.getMonth() - 2, 1)), isoDate(monthEnd(now))];
    case 'tahun_ini':
      return [isoDate(new Date(now.getFullYear(), 0, 1)), isoDate(new Date(now.getFullYear(), 11, 31))];
    default:
      return [isoDate(monthStart(now)), isoDate(monthEnd(now))];
  }
}
