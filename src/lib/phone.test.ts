import { describe, expect, it } from 'vitest';
import { formatPhone, normalizePhone } from './phone';

describe('normalizePhone (harus sama dengan public.normalize_phone)', () => {
  it.each([
    ['08123456789', '628123456789'],
    ['+62 812-3456-789', '628123456789'],
    ['628123456789', '628123456789'],
    ['8123456789', '628123456789'],
    ['0215550000', null],
    ['0812', null],
    ['halo', null],
    ['', null],
    [null, null],
  ])('%s -> %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });
});

describe('formatPhone', () => {
  it('menampilkan format lokal', () => {
    expect(formatPhone('628123456789')).toBe('0812-3456-789');
    expect(formatPhone(null)).toBe('-');
  });
});
