/** Ubah galat Supabase/Postgres menjadi pesan Bahasa Indonesia yang ramah. */
export function errorMessage(err: unknown): string {
  if (!err) return 'Terjadi kesalahan.';
  const e = err as { message?: string; code?: string; status?: number };
  const msg = e.message ?? String(err);

  const map: [RegExp, string][] = [
    [/invalid login credentials/i, 'Email atau kata sandi salah.'],
    [/email not confirmed/i, 'Email belum dikonfirmasi. Cek kotak masuk Anda.'],
    [/user already registered/i, 'Email sudah terdaftar. Silakan masuk.'],
    [/password should be at least/i, 'Kata sandi minimal 8 karakter.'],
    [/password should contain/i, 'Kata sandi harus berisi huruf dan angka.'],
    [/rate limit|too many requests/i, 'Terlalu banyak percobaan. Coba lagi beberapa saat lagi.'],
    [/invalid totp|invalid code|code.*expired/i, 'Kode verifikasi salah atau kedaluwarsa.'],
    [/failed to fetch|network/i, 'Tidak dapat terhubung ke server. Periksa koneksi internet.'],
    [/jwt expired/i, 'Sesi berakhir. Silakan masuk kembali.'],
    [/permission denied|row-level security/i, 'Anda tidak memiliki akses untuk tindakan ini.'],
  ];
  for (const [re, text] of map) if (re.test(msg)) return text;
  if (e.code === '42501') return msg === 'Akses ditolak' ? 'Anda tidak memiliki akses untuk tindakan ini.' : msg;
  return msg;
}
