/**
 * Normalisasi nomor HP Indonesia ke format 628xxxxxxxx.
 * Harus identik dengan fungsi SQL public.normalize_phone.
 *   08xx, +628xx, 628xx, 8xx -> 628xx. Mengembalikan null bila tidak valid.
 */
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  let v = input.replace(/\D/g, '');
  if (!v) return null;
  if (v.startsWith('62')) {
    // sudah format internasional
  } else if (v.startsWith('0')) {
    v = '62' + v.slice(1);
  } else if (v.startsWith('8')) {
    v = '62' + v;
  } else {
    return null;
  }
  return /^628\d{7,12}$/.test(v) ? v : null;
}

/** Tampilkan 628123456789 sebagai 0812-3456-789. */
export function formatPhone(normalized: string | null | undefined): string {
  if (!normalized) return '-';
  const local = normalized.startsWith('62') ? '0' + normalized.slice(2) : normalized;
  return local.replace(/^(\d{4})(\d{4})(\d+)$/, '$1-$2-$3');
}
