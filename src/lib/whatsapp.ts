import type { WaStatus } from './database.types';

/** Variabel template (harus sama dengan private.wa_allowed_vars di database). */
export const WA_VARIABLES: { key: string; label: string; contoh: string }[] = [
  { key: 'nama', label: 'Nama pemesan', contoh: 'Rani' },
  { key: 'toko', label: 'Nama toko', contoh: 'GutVibes' },
  { key: 'kode', label: 'Kode pesanan', contoh: 'GV-261106-K7QX' },
  { key: 'item', label: 'Daftar item', contoh: '• Soes Vla ×10\n• Bolu Pandan Klasik ×1' },
  { key: 'total', label: 'Total', contoh: 'Rp120.000' },
  { key: 'jadwal', label: 'Jadwal', contoh: 'Jumat, 6 Nov 2026, 10.00 WIB' },
  { key: 'metode', label: 'Ambil/antar', contoh: 'ambil di toko' },
  { key: 'tautan_lacak', label: 'Tautan lacak', contoh: 'https://gutvibes.id/lacak/3f9c…' },
  { key: 'kurir', label: 'Kurir', contoh: 'GoSend' },
  { key: 'alasan', label: 'Alasan batal', contoh: 'Stok habis' },
];

export const WA_STATUS_LABEL: Record<WaStatus, string> = {
  pending: 'Antre',
  mengirim: 'Mengirim',
  terkirim: 'Terkirim',
  gagal: 'Gagal',
};
export const WA_STATUS_TONE: Record<WaStatus, 'amber' | 'blue' | 'green' | 'red'> = {
  pending: 'amber',
  mengirim: 'blue',
  terkirim: 'green',
  gagal: 'red',
};
export const WA_TAHAP_LABEL: Record<string, string> = {
  pesanan_diterima: 'Pesanan diterima',
  pembayaran_dikonfirmasi: 'Pembayaran dikonfirmasi',
  pesanan_siap: 'Siap diambil/dikirim',
  pesanan_selesai: 'Selesai',
  pesanan_dibatalkan: 'Dibatalkan',
  uji_kirim: 'Uji kirim',
};

/** Pratinjau template dengan data contoh (logika sama dengan private.render_template). */
export function renderTemplate(isi: string, vars: Record<string, string> = Object.fromEntries(WA_VARIABLES.map((v) => [v.key, v.contoh]))): string {
  return Object.entries(vars).reduce((out, [k, v]) => out.split(`{${k}}`).join(v), isi);
}

/** Variabel {x} di template yang tidak dikenal. */
export function unknownVariables(isi: string): string[] {
  const allowed = new Set(WA_VARIABLES.map((v) => v.key));
  return [...isi.matchAll(/\{([^{}]*)\}/g)].map((m) => m[1]).filter((k) => !allowed.has(k));
}
