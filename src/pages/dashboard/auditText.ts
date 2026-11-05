import type { Tables } from '@/lib/database.types';
import { ROLE_LABEL } from '@/lib/permissions';
import type { AppRole } from '@/lib/database.types';

type Log = Tables<'audit_logs'>;

export const ENTITAS_LABEL: Record<string, string> = {
  akun: 'Akun',
  undangan_staf: 'Undangan staf',
  pengaturan: 'Pengaturan',
  pelanggan: 'Pelanggan',
  pesanan: 'Pesanan',
  produk: 'Produk',
  promo: 'Promo',
  konten_web: 'Konten web',
  template_wa: 'Template WhatsApp',
  pesan_wa: 'Pesan WhatsApp',
  bahan: 'Bahan baku',
  resep: 'Resep',
  resep_bahan: 'Isi resep',
  produksi: 'Produksi',
  stamp: 'Stamp',
  aturan_stamp: 'Aturan stamp',
  hadiah: 'Hadiah',
  hadiah_member: 'Hadiah member',
  lencana: 'Lencana',
};

const roleLabel = (r: unknown) => ROLE_LABEL[r as AppRole] ?? String(r);

/** Kalimat singkat Bahasa Indonesia untuk satu baris log. */
export function describeAudit(l: Log): string {
  const lama = (l.data_lama ?? {}) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const baru = (l.data_baru ?? {}) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  switch (l.aksi) {
    case 'akun.ubah': {
      const parts: string[] = [];
      if (lama.role !== baru.role) parts.push(`mengubah peran dari ${roleLabel(lama.role)} menjadi ${roleLabel(baru.role)}`);
      if (lama.aktif !== baru.aktif) parts.push(baru.aktif ? 'mengaktifkan akun' : 'menonaktifkan akun');
      return parts.join(' dan ') || 'mengubah akun';
    }
    case 'undangan_staf.tambah':
      return `mengundang ${baru.email} sebagai ${roleLabel(baru.role)}`;
    case 'undangan_staf.ubah':
      return `mengubah status undangan ${baru.email ?? ''} menjadi ${baru.status}`;
    case 'pengaturan.ubah':
      return `mengubah pengaturan ${l.entitas_id}`;
    case 'produk.ubah':
      if (lama.harga !== baru.harga) return `mengubah harga ${baru.nama ?? ''} dari ${lama.harga} menjadi ${baru.harga}`;
      if (lama.stok !== baru.stok) return `stok ${baru.nama ?? 'produk'} ${lama.stok} → ${baru.stok}`;
      return `mengubah produk ${baru.nama ?? ''}`;
    case 'pesanan.ubah':
      return lama.status !== baru.status ? `mengubah status pesanan menjadi ${baru.status}` : 'mengubah pesanan';
    case 'produksi.batal':
      return `membatalkan produksi ${lama.produk ?? ''} (${lama.batches ?? '?'} batch)`;
    case 'stamp.koreksi':
      return `mengoreksi stamp (${baru.qty > 0 ? '+' : ''}${baru.qty})`;
    case 'bahan.belanja':
      return `mencatat belanja bahan (+${baru.qty})`;
    case 'bahan.koreksi_stok':
      return `mengoreksi stok bahan ${lama.stok} → ${baru.stok}`;
    case 'pesan_wa.kirim_ulang':
      return 'mengirim ulang pesan WhatsApp';
    case 'pesan_wa.uji_kirim':
      return 'melakukan uji kirim WhatsApp';
    default:
      if (l.aksi.endsWith('.ekspor_data')) return `mengekspor data ${ENTITAS_LABEL[l.entitas] ?? l.entitas}`;
      return `${l.aksi} (${l.entitas}${l.entitas_id ? ` ${l.entitas_id}` : ''})`;
  }
}
