import { describe, expect, it } from 'vitest';
import { comeBackLink } from './analytics';

describe('ajak kembali', () => {
  it('membuat tautan WhatsApp personal', () => {
    const url = comeBackLink({ nama: 'Rani Putri', no_hp: '6281211112222', produk_favorit: 'Soes Vla' }, 'GutVibes', 'https://gutvibes.id/');
    expect(url).toMatch(/^https:\/\/wa\.me\/6281211112222\?text=/);
    const text = decodeURIComponent(url!.split('text=')[1]);
    expect(text).toContain('Halo Rani');
    expect(text).toContain('Soes Vla');
    expect(text).toContain('https://gutvibes.id/menu');
  });
});
