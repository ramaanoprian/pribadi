import type { RewardJenis } from './database.types';

export type MyLoyalty = {
  aktif: boolean;
  target: number;
  min_belanja: number;
  hadiah: string;
  masa_berlaku_hari: number;
  stamp: number;
  pesanan_selesai: number;
  phone_verified: boolean;
  no_hp: string | null;
  lencana: { kode: string; nama: string; deskripsi: string; ambang: number; ikon: string; earned_at: string | null }[];
  hadiah_saya: { kode: string; nama: string; jenis: RewardJenis; status: 'tersedia' | 'dipakai' | 'kedaluwarsa' | 'dibatalkan'; expires_at: string; used_at: string | null }[];
  riwayat_stamp: { tipe: 'earn' | 'adjust' | 'kartu_penuh'; qty: number; alasan: string | null; created_at: string; kode: string | null }[];
};

export const REWARD_JENIS_LABEL: Record<RewardJenis, string> = {
  diskon_nominal: 'Diskon nominal (Rp)',
  diskon_persen: 'Diskon persen (%)',
  produk_gratis: 'Produk gratis',
  gratis_ongkir: 'Gratis ongkir',
};

export const REDEMPTION_STATUS: Record<string, { label: string; tone: 'green' | 'neutral' | 'red' | 'amber' }> = {
  tersedia: { label: 'Tersedia', tone: 'green' },
  dipakai: { label: 'Dipakai', tone: 'neutral' },
  kedaluwarsa: { label: 'Kedaluwarsa', tone: 'red' },
  dibatalkan: { label: 'Dibatalkan', tone: 'red' },
};

/** Status efektif (hadiah tersedia yang lewat tanggal = kedaluwarsa). */
export function effectiveStatus(status: string, expiresAt: string): string {
  return status === 'tersedia' && new Date(expiresAt).getTime() < Date.now() ? 'kedaluwarsa' : status;
}
