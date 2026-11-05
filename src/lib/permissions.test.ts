import { describe, expect, it } from 'vitest';
import { accessOf, canEdit, canView, homePathFor, navFor, NAV_ITEMS } from './permissions';

describe('matriks hak akses', () => {
  it('Admin Baking hanya punya Input Produksi, Riwayat Produksi, dan Stok Bahan', () => {
    expect(navFor('admin_baking').map((i) => i.label)).toEqual(['Input Produksi', 'Riwayat Produksi', 'Stok Bahan']);
  });

  it('Admin Baking hanya melihat stok bahan, tidak bisa mengubah', () => {
    expect(accessOf('admin_baking', 'stok_bahan')).toBe('V');
    expect(canEdit('admin_baking', 'stok_bahan_ubah')).toBe(false);
    expect(canView('admin_baking', 'resep')).toBe(false);
  });

  it('Admin tidak melihat menu khusus Owner', () => {
    const paths = navFor('admin').map((i) => i.path);
    for (const p of ['/dashboard/akun', '/dashboard/biaya', '/dashboard/laporan', '/dashboard/analisis-pelanggan', '/dashboard/pengaturan', '/dashboard/log-aktivitas']) {
      expect(paths).not.toContain(p);
    }
    expect(accessOf('admin', 'resep')).toBe('V');
    expect(accessOf('admin', 'aturan_loyalti')).toBe('V');
  });

  it('Owner melihat semua menu', () => {
    expect(navFor('owner')).toHaveLength(NAV_ITEMS.length);
  });

  it('Member & tamu tidak punya menu dashboard', () => {
    expect(navFor('member')).toEqual([]);
    expect(navFor(null)).toEqual([]);
    expect(canView('member', 'dashboard')).toBe(false);
  });

  it('halaman awal per peran', () => {
    expect(homePathFor('owner')).toBe('/dashboard');
    expect(homePathFor('admin')).toBe('/dashboard');
    expect(homePathFor('admin_baking')).toBe('/dashboard/produksi');
    expect(homePathFor('member')).toBe('/akun');
  });
});
