# GutVibes Bakehouse

Website publik (etalase + pemesanan) dan dashboard internal toko kue GutVibes.
React + TypeScript + Vite + Tailwind (PWA) · Supabase (Postgres, Auth, RLS, Edge Functions).

**Status: Fase 1–4 selesai.**

## Menjalankan secara lokal

Prasyarat: Node 20+, Docker (untuk Supabase lokal).

```bash
npm install
cp supabase/functions/.env.example supabase/functions/.env   # WHATSAPP_PROVIDER=dummy untuk lokal
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
| Member kedua | budi@gutvibes.test | Member12345 |

Data contoh juga berisi 4 kategori, 6 produk (Soes Vla 1 batch = 70 pcs, ready stock & pre-order), promo `MANIS10`, konten web, dan 30 pesanan campuran tamu & member.

Owner pertama kali masuk akan diminta memindai kode QR dengan aplikasi authenticator (Google Authenticator, Authy, dll.).

### Supabase hosted (produksi)

```bash
npx supabase link --project-ref <ref>
npx supabase db push
npx supabase functions deploy invite-staff
npx supabase functions deploy whatsapp-worker --no-verify-jwt
npx supabase functions deploy whatsapp-admin
npx supabase secrets set APP_URL=https://domain-anda WHATSAPP_PROVIDER=fonnte FONNTE_TOKEN=token-perangkat WA_WORKER_SECRET=string-acak-panjang
```

- Auth > Providers > Email: aktifkan konfirmasi email. Auth > MFA: aktifkan TOTP.
- Auth > URL Configuration: isi Site URL dan tambahkan `https://domain-anda/**` ke Redirect URLs.
- Owner pertama: daftar lewat `/daftar`, lalu jalankan di SQL Editor:
  `update public.profiles set role = 'owner' where email = 'email-anda';`
- Jangan jalankan `seed.sql` di produksi.
- Worker WhatsApp: simpan URL & secret worker di Vault (SQL Editor), dengan secret yang sama dengan `WA_WORKER_SECRET`:
  ```sql
  select vault.create_secret('https://<ref>.supabase.co/functions/v1/whatsapp-worker', 'wa_worker_url');
  select vault.create_secret('string-acak-panjang', 'wa_worker_secret');
  ```
  pg_cron membangunkan worker tiap menit, dan trigger membangunkannya seketika saat ada pesan baru. Lalu isi **Pengaturan → Alamat website** (untuk tautan lacak di pesan).
- Backup terjadwal: aktifkan Point-in-Time Recovery / daily backup di dashboard Supabase (paket Pro).

## Catatan Fase 2

- Alur pesanan: `menunggu_konfirmasi → dikonfirmasi → siap → selesai` (atau `dibatalkan`). Pesanan diantar wajib diisi ongkirnya sebelum pembayaran bisa dikonfirmasi.
- Stok produk ready stock berkurang saat pembayaran dikonfirmasi dan kembali bila pesanan dibatalkan. Pre-order tidak memengaruhi stok.
- Pembayaran tanpa payment gateway: Admin mengonfirmasi manual, bukti transfer opsional (bucket privat `bukti-transfer`). Foto produk ada di bucket publik `produk`.
- Rate limit: pesanan per nomor HP (5/jam) dan per IP (20/jam), lacak pesanan per IP (10/15 menit). Semuanya bisa diubah di Pengaturan. Saat uji lokal berulang, reset penghitungnya dengan:
  `psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "truncate private.rate_limits"`
- Notifikasi WhatsApp belum dikirim (Fase 3). Titik kirimnya sudah disiapkan di `private.notify_order`. Halaman sukses checkout punya tombol "Konfirmasi via WhatsApp" ke nomor toko.

## Catatan Fase 3 (WhatsApp)

- Alur: perubahan tahap pesanan → `private.notify_order` merender template ke tabel `whatsapp_messages` (status `pending`) dalam transaksi yang sama → trigger + pg_net membangunkan Edge Function `whatsapp-worker` → kirim via penyedia → `terkirim` / coba ulang (jeda 1 lalu 5 menit, maks. 3x) → `gagal`.
- Pesanan tidak pernah gagal karena WhatsApp: galat antrean hanya dicatat sebagai warning.
- Penyedia ada di `supabase/functions/_shared/whatsapp/provider.ts` (`FonnteProvider`). Untuk pindah ke WhatsApp API resmi, tambahkan kelas yang mengimplementasikan `WhatsAppProvider`, lalu ubah `WHATSAPP_PROVIDER`.
- `WHATSAPP_PROVIDER=dummy` hanya untuk lokal: tidak mengirim apa pun; nomor berakhiran `9999` disimulasikan gagal.
- Token Fonnte hanya ada di secret Edge Function, tidak pernah di database atau frontend.
- Template hanya boleh memakai variabel `{nama} {toko} {kode} {item} {total} {jadwal} {metode} {tautan_lacak} {kurir} {alasan}` (tanpa alamat/HP).

## Catatan Fase 4 (Produksi)

- `record_production` (atomik, row lock): bahan dikurangi sesuai resep × batch, stok produk jadi bertambah (ready stock), HPP produk dihitung dengan rata-rata bergerak, dan log produksi mencatat penginput.
- Bila bahan kurang: mode **peringatan** (default) tetap menyimpan, stok bahan menjadi minus sebagai tanda untuk dikoreksi; mode **blokir** menolak. Mode diatur di Pengaturan.
- Admin Baking hanya bisa input, melihat riwayat miliknya, dan melihat stok bahan. Resep & harga bahan tidak terlihat olehnya (hanya pratinjau pemakaian).
- Pembatalan (Owner/Admin, wajib alasan) membalik stok bahan & produk. Pembatalan ditolak bila hasilnya sudah terjual (pakai koreksi stok).
- Belanja bahan (jumlah + total harga) memperbarui harga rata-rata bahan.

## Tes

```bash
npm test               # unit test frontend (normalisasi HP, matriks hak akses)
npm run test:db        # pgTAP di PostgreSQL lokal tanpa Docker (pakai shim Supabase)
npx supabase test db   # pgTAP di Supabase lokal (Docker)
deno test supabase/functions/_shared/whatsapp/   # unit test penyedia WhatsApp (Deno)
npm run test:e2e       # E2E API ke Supabase lokal; butuh SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
                       # (opsional INVITE_FN_URL bila Edge Function dijalankan di luar `supabase start`)
```

## Struktur

```
supabase/migrations/   skema, RLS, fungsi server (satu file per fase)
supabase/functions/    Edge Functions (invite-staff, whatsapp-worker, whatsapp-admin)
supabase/tests/        tes pgTAP
supabase/seed.sql      data contoh lokal
src/lib/permissions.ts matriks hak akses (UI); penegakan sebenarnya di RLS
src/auth/              sesi, profil, 2FA, penjaga rute
src/pages/             halaman publik, akun member, dashboard
```

## Keamanan (ringkas)

- RLS aktif di semua tabel; peran dibaca dari `profiles`. Hak tabel juga dibatasi per kolom.
- Tamu hanya membaca view publik (`katalog_produk`, `katalog_kategori`, `konten_publik`, `pengaturan_publik`) dan memanggil RPC `create_order`, `check_promo`, `track_order`, `track_order_by_token`.
- Harga selalu dihitung ulang di server. HPP (`cost_per_unit`, `cost_snapshot`) tidak bisa dibaca Admin; Owner membacanya lewat view `biaya_produk`.
- Peran tidak pernah diambil dari data pendaftar. Staf hanya bisa dibuat lewat undangan Owner (Edge Function + Auth Admin API).
- Hak Owner hanya berlaku bila sesi sudah 2FA (`aal2`). Ini ditegakkan di database, bukan cuma di UI.
- `audit_logs` hanya bisa ditambah (append-only). Isinya: perubahan peran/status akun, undangan, pengaturan, kontak pelanggan, ekspor data.
- Rate limit generik (`private.hit_rate_limit`) dipakai untuk pesanan, lacak pesanan, dan OTP di fase-fase berikutnya.
- Rahasia (service role, token Fonnte) hanya disimpan sebagai secret server.
