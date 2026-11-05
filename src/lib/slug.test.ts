import { describe, expect, it } from 'vitest';
import { slugify } from './slug';
import { orderSteps, waLink } from './orders';

describe('slugify', () => {
  it('membuat slug URL', () => {
    expect(slugify('Roti Sobek Cokelat')).toBe('roti-sobek-cokelat');
    expect(slugify('  Kue & Pastry!! ')).toBe('kue-dan-pastry');
    expect(slugify('Crème Brûlée')).toBe('creme-brulee');
  });
});

describe('orderSteps', () => {
  const base = { fulfillment: 'antar' as const, created_at: 'a', confirmed_at: 'b', ready_at: null, completed_at: null, cancelled_at: null };
  it('menampilkan 4 tahap normal', () => {
    expect(orderSteps({ ...base, status: 'dikonfirmasi' }).map((s) => s.label)).toEqual([
      'Pesanan diterima',
      'Pembayaran dikonfirmasi',
      'Siap dikirim',
      'Selesai',
    ]);
  });
  it('pesanan batal hanya menampilkan tahap yang terjadi + dibatalkan', () => {
    expect(orderSteps({ ...base, status: 'dibatalkan', cancelled_at: 'c' }).map((s) => s.key)).toEqual(['diterima', 'dikonfirmasi', 'dibatalkan']);
  });
});

describe('waLink', () => {
  it('membuat tautan wa.me terenkode', () => {
    expect(waLink('628123', 'Halo kak')).toBe('https://wa.me/628123?text=Halo%20kak');
    expect(waLink(null, 'x')).toBeNull();
  });
});
