import { describe, expect, it } from 'vitest';
import { budgetStatus, shortRupiah } from './charts';

describe('grafik', () => {
  it('angka singkat rupiah', () => {
    expect(shortRupiah(1_250_000)).toBe('1,3 jt');
    expect(shortRupiah(45_000)).toBe('45 rb');
    expect(shortRupiah(-2_000_000)).toBe('−2 jt');
  });
  it('status anggaran hijau/kuning/merah', () => {
    expect(budgetStatus(50, 100).label).toBe('Aman');
    expect(budgetStatus(85, 100).label).toBe('Hampir habis');
    expect(budgetStatus(120, 100).label).toBe('Melebihi');
  });
});
