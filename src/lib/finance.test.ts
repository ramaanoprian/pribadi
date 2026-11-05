import { describe, expect, it } from 'vitest';
import { isoDate, monthEnd, presetRange } from './finance';

describe('rentang periode', () => {
  it('akhir bulan & format tanggal lokal', () => {
    expect(isoDate(monthEnd(new Date(2026, 1, 10)))).toBe('2026-02-28');
  });
  it('preset bulan ini dimulai tanggal 1', () => {
    const [from, to] = presetRange('bulan_ini');
    expect(from.endsWith('-01')).toBe(true);
    expect(to >= from).toBe(true);
  });
});
