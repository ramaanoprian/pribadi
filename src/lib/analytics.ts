import { waLink } from './orders';

export type RankingRow = {
  id: string;
  nama: string;
  no_hp: string;
  jenis: 'member' | 'tamu';
  jumlah_pesanan: number;
  total_belanja: number;
  jumlah_periode: number;
  total_periode: number;
  pesanan_pertama: string;
  pesanan_terakhir: string;
  produk_favorit: string | null;
  is_repeat: boolean;
  is_vip: boolean;
  is_tidur: boolean;
};

export type AnalyticsSummary = {
  aktif: number;
  baru: number;
  kembali: number;
  repeat: number;
  repeat_rate: number;
  rata_rata_pesanan: number;
  pesanan: number;
  member: number;
  tamu: number;
  tidur: number;
  vip: number;
  hari_tidur: number;
  ambang_vip: number;
};

/** Tautan "Ajak kembali": membuka WhatsApp dengan pesan personal terisi (bukan blast). */
export function comeBackLink(row: Pick<RankingRow, 'nama' | 'no_hp' | 'produk_favorit'>, storeName: string, siteUrl: string): string | null {
  const nama = row.nama.split(' ')[0];
  const fav = row.produk_favorit ? ` ${row.produk_favorit} favoritmu masih ada lho.` : '';
  const menu = siteUrl ? ` Lihat menu: ${siteUrl.replace(/\/$/, '')}/menu` : '';
  return waLink(row.no_hp, `Halo ${nama}, sudah lama nggak mampir ke ${storeName}! Kami kangen 😊${fav}${menu}`);
}
