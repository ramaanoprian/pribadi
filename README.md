# GutVibes Bakehouse

Website publik (etalase + pemesanan) dan dashboard internal toko kue GutVibes.
React + TypeScript + Vite + Tailwind (PWA) · Supabase (Postgres, Auth, RLS, Edge Functions).

**Status: Fase 1 — Fondasi (selesai, menunggu uji).**

## Menjalankan secara lokal

Prasyarat: Node 20+, Docker (untuk Supabase lokal).

```bash
npm install
npx supabase start          # menjalankan Postgres, Auth, API, Mailpit, Edge Runtime
npx supabase db reset       # migrasi + data contoh (seed.sql)
npx supabase status         # salin API URL & anon key
cp .env.example .env.local  # isi VITE_SUPABASE_URL & VITE_SUPABASE_ANON_KEY
npm run dev                 # http://localhost:5173
```

Email (undangan staf, konfirmasi daftar, lupa kata sandi) di lokal masuk ke Mailpit: http://127.0.0.1:54324

### Akun contoh

| Peran | Email | Kata sandi |
|---|---|---|
| Owner (wajib 2FA) | owner@gutvibes.test | Owner12345 |
| Admin | admin@gutvibes.test | Admin12345 |
| Admin Baking | baking@gutvibes.test | Baking12345 |
| Member | member@gutvibes.test | Member12345 |

Owner pertama kali masuk akan diminta memindai kode QR dengan aplikasi authenticator (Google Authenticator, Authy, dll.).

### Supabase hosted (produksi)

```bash
npx supabase link --project-ref <ref>
npx supabase db push
npx supabase functions deploy invite-staff
npx supabase secrets set APP_URL=https://domain-anda
```

- Auth > Providers > Email: aktifkan konfirmasi email. Auth > MFA: aktifkan TOTP.
- Auth > URL Configuration: isi Site URL dan tambahkan `https://domain-anda/**` ke Redirect URLs.
- Owner pertama: daftar lewat `/daftar`, lalu jalankan di SQL Editor:
  `update public.profiles set role = 'owner' where email = 'email-anda';`
- Jangan jalankan `seed.sql` di produksi.
- Backup terjadwal: aktifkan Point-in-Time Recovery / daily backup di dashboard Supabase (paket Pro).

## Tes

```bash
npm test               # unit test frontend (normalisasi HP, matriks hak akses)
npm run test:db        # pgTAP di PostgreSQL lokal tanpa Docker (pakai shim Supabase)
npx supabase test db   # pgTAP di Supabase lokal (Docker)
npm run test:e2e       # E2E API ke Supabase lokal; butuh SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
```

## Struktur

```
supabase/migrations/   skema, RLS, fungsi server (satu file per fase)
supabase/functions/    Edge Functions (invite-staff)
supabase/tests/        tes pgTAP
supabase/seed.sql      data contoh lokal
src/lib/permissions.ts matriks hak akses (UI); penegakan sebenarnya di RLS
src/auth/              sesi, profil, 2FA, penjaga rute
src/pages/             halaman publik, akun member, dashboard
```

## Keamanan (ringkas)

- RLS aktif di semua tabel; peran dibaca dari `profiles`. Hak tabel juga dibatasi per kolom.
- Peran tidak pernah diambil dari data pendaftar. Staf hanya bisa dibuat lewat undangan Owner (Edge Function + Auth Admin API).
- Hak Owner hanya berlaku bila sesi sudah 2FA (`aal2`). Ini ditegakkan di database, bukan cuma di UI.
- `audit_logs` hanya bisa ditambah (append-only). Isinya: perubahan peran/status akun, undangan, pengaturan, kontak pelanggan, ekspor data.
- Rate limit generik (`private.hit_rate_limit`) dipakai untuk pesanan, lacak pesanan, dan OTP di fase-fase berikutnya.
- Rahasia (service role, token Fonnte) hanya disimpan sebagai secret server.
