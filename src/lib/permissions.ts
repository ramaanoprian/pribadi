import type { AppRole } from './database.types';

export type StaffRole = Exclude<AppRole, 'member'>;
/** F = penuh, V = lihat saja, X = tidak ada akses. */
export type Access = 'F' | 'V' | 'X';

export const STAFF_ROLES: StaffRole[] = ['owner', 'admin', 'admin_baking'];

export const ROLE_LABEL: Record<AppRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  admin_baking: 'Admin Baking',
  member: 'Member',
};

export function isStaffRole(role: AppRole | null | undefined): role is StaffRole {
  return role === 'owner' || role === 'admin' || role === 'admin_baking';
}

/**
 * Matriks hak akses (salinan langsung dari spesifikasi bagian 2).
 * Ini hanya untuk UI (menu & penjaga rute). Penegakan sesungguhnya ada di
 * RLS & fungsi database.
 */
export const ACCESS_MATRIX = {
  dashboard: { label: 'Dashboard ringkasan', owner: 'F', admin: 'F', admin_baking: 'F' },
  akun: { label: 'Akun & peran', owner: 'F', admin: 'X', admin_baking: 'X' },
  katalog: { label: 'Katalog produk', owner: 'F', admin: 'F', admin_baking: 'X' },
  harga_promo: { label: 'Harga & promo', owner: 'F', admin: 'F', admin_baking: 'X' },
  pesanan: { label: 'Pesanan', owner: 'F', admin: 'F', admin_baking: 'X' },
  pelanggan: { label: 'Data pelanggan', owner: 'F', admin: 'F', admin_baking: 'X' },
  resep: { label: 'Resep & hasil per batch', owner: 'F', admin: 'V', admin_baking: 'X' },
  produksi: { label: 'Input produksi harian', owner: 'F', admin: 'F', admin_baking: 'F' },
  stok_bahan: { label: 'Stok bahan baku: lihat', owner: 'F', admin: 'F', admin_baking: 'V' },
  stok_bahan_ubah: { label: 'Stok bahan baku: tambah/koreksi', owner: 'F', admin: 'F', admin_baking: 'X' },
  stok_produk: { label: 'Stok produk jadi', owner: 'F', admin: 'F', admin_baking: 'V' },
  biaya: { label: 'Biaya operasional, anggaran, gaji', owner: 'F', admin: 'X', admin_baking: 'X' },
  ongkir: { label: 'Ongkir per pesanan (input)', owner: 'F', admin: 'F', admin_baking: 'X' },
  laporan: { label: 'Laporan laba rugi, HPP, margin', owner: 'F', admin: 'X', admin_baking: 'X' },
  analisis_pelanggan: { label: 'Analisis pelanggan', owner: 'F', admin: 'X', admin_baking: 'X' },
  aturan_loyalti: { label: 'Aturan stamp/hadiah/lencana', owner: 'F', admin: 'V', admin_baking: 'X' },
  koreksi_stamp: { label: 'Koreksi stamp manual, proses hadiah', owner: 'F', admin: 'F', admin_baking: 'X' },
  konten_web: { label: 'Konten web', owner: 'F', admin: 'F', admin_baking: 'X' },
  whatsapp: { label: 'Template & log WhatsApp', owner: 'F', admin: 'F', admin_baking: 'X' },
  pengaturan: { label: 'Koneksi Fonnte, pengaturan sistem', owner: 'F', admin: 'X', admin_baking: 'X' },
  log_aktivitas: { label: 'Log aktivitas', owner: 'F', admin: 'X', admin_baking: 'X' },
} as const satisfies Record<string, { label: string } & Record<StaffRole, Access>>;

export type ModuleKey = keyof typeof ACCESS_MATRIX;

export function accessOf(role: AppRole | null | undefined, module: ModuleKey): Access {
  if (!isStaffRole(role)) return 'X';
  return ACCESS_MATRIX[module][role];
}

export function canView(role: AppRole | null | undefined, module: ModuleKey): boolean {
  return accessOf(role, module) !== 'X';
}

export function canEdit(role: AppRole | null | undefined, module: ModuleKey): boolean {
  return accessOf(role, module) === 'F';
}

/** Fase pembangunan yang sudah selesai; modul dengan fase lebih besar tampil sebagai "segera hadir". */
export const CURRENT_PHASE = 4;

/** Item menu dashboard. `phase` = fase pembangunan modul tersebut. */
export type NavItem = {
  path: string;
  label: string;
  module: ModuleKey;
  icon: string;
  phase: number;
  group: string;
  /** Batasi item ke peran tertentu walau modulnya bisa diakses (mis. halaman khusus dapur). */
  roles?: StaffRole[];
};

export const NAV_ITEMS: NavItem[] = [
  { path: '/dashboard', label: 'Ringkasan', module: 'dashboard', icon: 'LayoutDashboard', phase: 1, group: 'Utama', roles: ['owner', 'admin'] },
  { path: '/dashboard/pesanan', label: 'Pesanan', module: 'pesanan', icon: 'ShoppingBag', phase: 2, group: 'Penjualan' },
  { path: '/dashboard/katalog', label: 'Katalog Produk', module: 'katalog', icon: 'Croissant', phase: 2, group: 'Penjualan' },
  { path: '/dashboard/promo', label: 'Harga & Promo', module: 'harga_promo', icon: 'BadgePercent', phase: 2, group: 'Penjualan' },
  { path: '/dashboard/pelanggan', label: 'Pelanggan', module: 'pelanggan', icon: 'Users', phase: 2, group: 'Penjualan' },
  { path: '/dashboard/loyalti', label: 'Stamp & Hadiah', module: 'koreksi_stamp', icon: 'Stamp', phase: 5, group: 'Penjualan' },
  { path: '/dashboard/produksi', label: 'Input Produksi', module: 'produksi', icon: 'ChefHat', phase: 4, group: 'Dapur' },
  { path: '/dashboard/produksi/riwayat', label: 'Riwayat Produksi', module: 'produksi', icon: 'History', phase: 4, group: 'Dapur' },
  { path: '/dashboard/stok-bahan', label: 'Stok Bahan', module: 'stok_bahan', icon: 'Wheat', phase: 4, group: 'Dapur' },
  { path: '/dashboard/stok-produk', label: 'Stok Produk Jadi', module: 'stok_produk', icon: 'Package', phase: 4, group: 'Dapur', roles: ['owner', 'admin'] },
  { path: '/dashboard/resep', label: 'Resep', module: 'resep', icon: 'BookOpen', phase: 4, group: 'Dapur' },
  { path: '/dashboard/biaya', label: 'Biaya Operasional', module: 'biaya', icon: 'Wallet', phase: 6, group: 'Keuangan' },
  { path: '/dashboard/laporan', label: 'Laba Rugi', module: 'laporan', icon: 'FileBarChart', phase: 6, group: 'Keuangan' },
  { path: '/dashboard/analisis-pelanggan', label: 'Analisis Pelanggan', module: 'analisis_pelanggan', icon: 'ChartLine', phase: 7, group: 'Keuangan' },
  { path: '/dashboard/konten', label: 'Konten Web', module: 'konten_web', icon: 'PanelsTopLeft', phase: 2, group: 'Sistem' },
  { path: '/dashboard/whatsapp', label: 'WhatsApp', module: 'whatsapp', icon: 'MessageCircle', phase: 3, group: 'Sistem' },
  { path: '/dashboard/akun', label: 'Akun & Peran', module: 'akun', icon: 'UserCog', phase: 1, group: 'Sistem' },
  { path: '/dashboard/log-aktivitas', label: 'Log Aktivitas', module: 'log_aktivitas', icon: 'ScrollText', phase: 1, group: 'Sistem' },
  { path: '/dashboard/pengaturan', label: 'Pengaturan', module: 'pengaturan', icon: 'Settings', phase: 1, group: 'Sistem' },
];

export function navFor(role: AppRole | null | undefined): NavItem[] {
  if (!isStaffRole(role)) return [];
  return NAV_ITEMS.filter((item) => canView(role, item.module) && (!item.roles || item.roles.includes(role)));
}

/** Halaman awal setelah masuk. */
export function homePathFor(role: AppRole | null | undefined): string {
  if (role === 'admin_baking') return '/dashboard/produksi';
  if (isStaffRole(role)) return '/dashboard';
  return '/akun';
}
