export function validatePassword(pw: string): string | null {
  if (pw.length < 8) return 'Minimal 8 karakter.';
  if (!/[a-zA-Z]/.test(pw) || !/\d/.test(pw)) return 'Harus berisi huruf dan angka.';
  return null;
}

export const isEmail = (v: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim());
