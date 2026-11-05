import { describe, expect, it } from 'vitest';
import { renderTemplate, unknownVariables } from './whatsapp';

describe('template WhatsApp', () => {
  it('mengganti semua kemunculan variabel', () => {
    expect(renderTemplate('Halo {nama}, pesanan {kode} ({kode})', { nama: 'Rani', kode: 'GV-1' })).toBe('Halo Rani, pesanan GV-1 (GV-1)');
  });
  it('menandai variabel tidak dikenal', () => {
    expect(unknownVariables('Halo {nama} di {alamat} {}')).toEqual(['alamat', '']);
    expect(unknownVariables('Total {total}')).toEqual([]);
  });
});
