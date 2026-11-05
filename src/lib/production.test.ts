import { describe, expect, it } from 'vitest';
import { formatQty, ingredientStatus } from './production';

describe('status stok bahan', () => {
  it('Aman / Menipis / Habis berdasarkan min_stock', () => {
    expect(ingredientStatus(500, 100).label).toBe('Aman');
    expect(ingredientStatus(100, 100).label).toBe('Menipis');
    expect(ingredientStatus(0, 100).label).toBe('Habis');
    expect(ingredientStatus(-6, 5).label).toBe('Habis');
  });
  it('format jumlah', () => {
    expect(formatQty(1500)).toBe('1.500');
    expect(formatQty(0.5)).toBe('0,5');
  });
});
