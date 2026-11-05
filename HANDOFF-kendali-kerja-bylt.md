# Handoff: Kendali Kerja BYLT (perbaikan fitur + redesign UI)

Tanggal ringkasan: 2026-11-05. Ditulis untuk dipakai di sesi baru dengan model lain. Belum ada perubahan apa pun yang dibuat: tidak ada migration, deploy, atau commit.

## 1. Perintah pengguna (berurutan, kata per kata)

1. "pada supabase buka website yang ku buat yang bernama kendalikerjabylt, coba analisis kekurangan website tersebut dan apa aja yang harus di adjust, termasuk ui nya juga"
2. Setelah saya menjelaskan bahwa aplikasi ini berbagi project Supabase dan sistem login dengan dashboard dokumen: "gausah ngerubah itu deh, coba analisis fitur di dalamnya aja. apa aja yang harus di adjust disana"
3. Perintah terbaru, ini yang harus dikerjakan di sesi baru: **"coba perbaiki, dan juga buat ui nya lebih bagus lagi lengkap dengan animasi buat ui dan ux nya seperti website stripe dan apple"**

Batasan dari pengguna: JANGAN mengubah kondisi keamanan/pembagian project (poin 2 di bawah, "itu"). Perbaikan difokuskan ke fitur dan UI Kendali Kerja. Kalau cakupan "perbaiki" masih ambigu, konfirmasi singkat ke pengguna, tetapi asumsikan: daftar fitur di bagian 5 + redesign UI di bagian 6.

## 2. Konteks sistem

- Project Supabase: `dokbylt`, ref/id `mvxceyvbiehxeolfxslw`, region ap-southeast-1, URL `https://mvxceyvbiehxeolfxslw.supabase.co`. Ada project lain `siap-pcpm` (`mlrpskirnegqjryputwx`), tidak terkait.
- Aplikasi Kendali Kerja BYLT (UPT Balai Yasa Lahat) = tabel `bylt_*` + schema `bylt_private`. Dashboard dokumen (`dokumenbylt.my.id`) = tabel lama `records`, `activity`, `rekap_log`, bucket `lampiran`/`cadangan`, edge function `kabari-pic`, `lacak-dokumen`, `daftar-dokumen`, `rekap-harian`, `pinjam-drone`, `kirim-paket`. Keduanya satu project dan satu `auth.users`.
- Situs live: `https://kendalibylt.my.id` (Cloudflare) dan `https://kendali-kerja-bylt.ramanoprian73.chatgpt.site`. Domain `kerja.dokumenbylt.my.id` terdaftar di allowlist redirect `bylt-admin` tetapi tidak bisa diakses dari sandbox (502).
- Frontend: SPA React + Vite (bundle `assets/index-*.js`, chunk `react`, `supabase`, `validation`, CSS `index-*.css`). **Source frontend TIDAK ada di repo `ramaanoprian/pribadi`** (repo itu hanya berisi folder `.agents/skills` dan `.claude`, skill Higgsfield). Dugaan: dibuat lewat ChatGPT (domain `chatgpt.site`). Langkah pertama sesi baru: minta pengguna menunjuk repo/folder source frontend, atau tambahkan lewat `add_repo`. Tanpa source, redesign UI tidak bisa dikerjakan.
- Branch kerja yang ditetapkan sesi ini: `claude/intelligent-lovelace-bitmi4` (repo `ramaanoprian/pribadi`). Jangan buat PR kecuali diminta.

### Backend Kendali Kerja (hasil inspeksi)
- Tabel: `bylt_organizations`, `bylt_profiles` (id, name, reminders), `bylt_memberships` (role admin/member/viewer, active), `bylt_teams`, `bylt_team_members`, `bylt_departments`, `bylt_contacts`, `bylt_tasks`, `bylt_task_members`, `bylt_subtasks`, `bylt_comments`, `bylt_attachments`, `bylt_history`, `bylt_notifications`, `bylt_reports`, `bylt_invitations`, `bylt_private.setup_tickets`. Semua RLS aktif, akses lewat `bylt_private.role_for(org)`.
- `bylt_tasks`: `kind` CHECK hanya `evp`/`routine`; `status` todo/doing/waiting/done/cancelled; `priority` normal/high/urgent; kolom `version` untuk kontrol konflik edit, `request_id` untuk idempotensi, `import_key`, `archived_at`; `number` dari sequence global `bylt_task_number`.
- RPC SECURITY DEFINER (semua cek peran di dalam, `search_path` terkunci): `bylt_save_task`, `bylt_archive_task`, `bylt_add_comment`, `bylt_set_subtask`, `bylt_register_attachment`, `bylt_report_data`, `bylt_finalize_report`, `bylt_export_org`, `bylt_import_data` (maks 500 tugas/kontak), `bylt_manage_member`, `bylt_prepare_invite`, `bylt_consume_setup`, `bylt_run_reminders`.
- Edge function Kendali Kerja: `bylt-admin` (undang anggota, verifikasi JWT di dalam kode; `verify_jwt:false`) dan `bylt-bootstrap` (token setup sekali pakai; redirect hardcode ke domain chatgpt.site).
- pg_cron: `bylt-deadline-reminders` tiap 15 menit memanggil `public.bylt_run_reminders()` (terverifikasi sukses). Juga `rekap-harian` milik dashboard dokumen.
- Storage: bucket `bylt-evidence` (privat, 20 MB, MIME: pdf, jpeg, png, webp, csv, doc/docx, xls/xlsx).
- Data saat ini: 1 organisasi, 2 anggota (keduanya admin), 1 tim, 7 bagian, 2 tugas (satu data uji yang sudah diarsipkan; satu tugas asli yang tenggatnya 3 Nov dan masih berjalan 25%, jadi sudah terlewat), 0 kontak, 0 lampiran, 0 laporan.
- Migration yang sudah ada: `bylt_core`, `bylt_storage_admin`, `bylt_import_invites`, `bylt_export`, `bylt_bootstrap`, `bylt_report_period` (+ 3 migration awal dashboard dokumen).

## 3. Temuan keamanan: JANGAN dikerjakan (pengguna menolak)

Dicatat hanya agar sesi baru tidak menyentuhnya dan tidak kaget:
- Policy tabel lama (`records`, `activity`, bucket `lampiran`) terbuka untuk semua pengguna login, sehingga anggota Kendali Kerja (bahkan viewer) bisa mengakses data dashboard dokumen. `list_staff()` membuka daftar semua akun.
- `log_record_change()` bisa dieksekusi `anon`; leaked password protection mati; `pg_net` di schema public; tidak ada header keamanan (CSP, HSTS, X-Frame-Options) di Cloudflare.
- Risiko belum terasa karena anggotanya baru 2 admin. Jika pengguna berubah pikiran, opsinya: pisahkan project, atau kunci policy tabel lama ke peran `staf`/`admin`.
- Penting: jangan ubah policy, grant, atau fungsi milik dashboard dokumen. Project dipakai bersama; kerusakan di sana berdampak ke aplikasi lain.

## 4. Hasil analisis UI (dari situs live + mode pratinjau)

Mode pratinjau ("Lihat pratinjau" di halaman login) memakai data contoh lokal dan tidak butuh login. Halaman yang sudah dilihat: login/landing, Ringkasan, Pekerjaan (list + Kanban), Agenda, Laporan EVP, Kontak bagian, Aktivitas, Arsip, Pengaturan (Profil, Anggota, Tim kerja, Bagian, Data & migrasi), modal Panduan singkat, drawer Catat tugas. Desktop 1366px dan HP (iPhone 13) tanpa overflow horizontal. Tidak ada error konsol. Fondasi visual sudah bersih: sidebar, breadcrumb, dark mode, ⌘K, bottom-nav HP, empty state yang baik.

Bug dan perbaikan UI yang sudah teridentifikasi:
- Landing/login: di HP judul tertulis "Masuk **keruang** kerja" (spasi hilang karena `<br>` disembunyikan). 3 tombol "Masuk" + 2 tautan pratinjau yang sama (duplikat). H1 berupa satu kalimat panjang dengan ruang kosong besar di hero desktop. Tidak ada tombol tampil/sembunyikan kata sandi. Placeholder `nama@kai.id` mengasumsikan domain KAI.
- Ukuran/aksesibilitas: 12 elemen interaktif di desktop dan 6 di HP berukuran di bawah 40px (mis. "Lupa kata sandi?" 32px). Sekitar 60-73 elemen teks di bawah 12px. Kontras teks abu-abu (eyebrow, placeholder, footer) tipis; belum diukur.
- Ringkasan di HP: 4 kartu KPI memakan hampir satu layar sebelum "Perlu perhatian". Banner "Mode contoh" makan ruang.
- Agenda: angka tanggal tidak sejajar vertikal (hari kosong di tengah sel, hari berisi di atas); teks acara terpotong di sel; kalender 7 kolom sulit dibaca di HP.
- Aktivitas: hanya 100 item, tanpa filter/pencarian; teks generik ("Memperbarui pekerjaan").

## 5. Backlog perbaikan fitur (urut prioritas)

Semua perubahan skema/fungsi adalah perubahan ke database PRODUKSI: tampilkan SQL ke pengguna dan minta persetujuan sebelum `apply_migration`. Pakai migration, bukan `execute_sql` untuk DDL. Setelah itu jalankan `get_advisors` (security + performance).

1. **Pengulangan pekerjaan rutin.** Tabel tidak punya kolom recurrence; tugas rutin dicatat ulang manual. Tambah aturan pengulangan (mingguan/bulanan, hari, tenggat relatif) + job pg_cron yang membuat instans tugas baru. Pertahankan idempotensi (`request_id`/`import_key`) agar tidak ganda.
2. **Pengingat.** `bylt_run_reminders()` hanya mengirim ke PIC, hanya untuk tenggat ≤24 jam, dan notifikasi "terlewati" cuma sekali per `due_at` (dedupe_key). Perbaiki: tugas tanpa PIC diarahkan ke admin; ikutkan pendukung (`bylt_task_members`); ulangi pengingat terlewati (mis. harian); tambah kanal WhatsApp via Fonnte (edge function `kabari-pic` sudah memakai secret `FONNTE_TOKEN` di project; perlu kolom nomor WA di `bylt_profiles`). Hormati preferensi `bylt_profiles.reminders`.
3. **Validasi "Selesai" di server.** Panduan UI bilang status Selesai wajib punya hasil aktual, tetapi `bylt_save_task` tidak mengeceknya (hanya cek alasan buka-kembali). Tambahkan pengecekan `actual_result` saat status `done`. Hati-hati: `bylt_import_data` memanggil `bylt_save_task`, jadi impor tugas berstatus selesai tanpa hasil aktual akan gagal; tangani (mis. izinkan untuk impor atau beri nilai default berlabel).
4. **Lampiran HEIC/PowerPoint.** Tambah `image/heic`, `image/heif`, dan pptx/ppt ke `allowed_mime_types` bucket `bylt-evidence`. Cek juga fungsi `bylt_register_attachment` (belum dibaca isinya) apakah memvalidasi MIME/ukuran; samakan.
5. **Laporan EVP.** Alur 5 langkah sudah ada, tetapi hanya cetak/PDF/CSV, tidak ada pengiriman. Tambah template PDF berkop Balai Yasa, narasi otomatis dari data periode, opsi kirim WA/email.
6. **Bagian (departemen).** 7 bagian ada di DB tetapi tugas tidak mengisinya ("Bagian belum ditetapkan"). Jadikan wajib untuk Arahan EVP atau tautkan ke PIC/kontak; isi direktori kontak (masih 0).
7. **Aktivitas.** Tampilkan perubahan konkret (mis. "Status: Berjalan → Menunggu") dari `before_data`/`after_data`; tambah filter per tugas/orang; paginasi. `bylt_save_task` menulis riwayat 'supporters' tiap update walau tidak berubah (membuat linimasa berisik): catat hanya saat berubah.
8. **Jenis pekerjaan** terkunci CHECK `evp`/`routine`; jadikan tabel yang dapat diatur admin (butuh migration + perubahan form/filter).
9. **Pencadangan.** Ekspor hanya JSON (tanpa Auth dan isi lampiran). Pastikan paket Supabase punya backup harian/PITR; pertimbangkan salinan bucket terjadwal.
10. Minor: `number` pakai satu sequence global untuk semua organisasi.

## 6. Brief redesign UI: "seperti Stripe dan Apple" + animasi

Tujuan pengguna: tampilan jauh lebih bagus, lengkap dengan animasi untuk UI dan UX ala Stripe/Apple. Panduan eksekusi:
- Pertahankan identitas yang ada (aksen indigo/ungu, tipografi bersih, layout sidebar), tingkatkan kualitasnya: skala tipografi lebih tegas, spasi lega, bayangan lembut berlapis, radius konsisten, gradien halus/mesh pada hero landing, kartu dengan border tipis + hover lift.
- Animasi (hormati `prefers-reduced-motion`, jaga 60fps dengan transform/opacity): reveal saat scroll di landing; transisi halaman (View Transitions API atau Framer Motion/`motion`); angka KPI count-up; progress bar mengisi; skeleton loading menggantikan spinner; micro-interaction tombol (press/hover, panah bergeser); drawer dan modal dengan spring easing; reorder animasi daftar/Kanban; indikator "Tersimpan di cloud" yang halus; toast bergerak masuk/keluar.
- Terapkan perbaikan di bagian 4 sekaligus (bug "keruang", duplikat CTA, tombol ≥44px di HP, teks ≥12-13px, kontras ≥4.5:1, kalender sejajar dan ramah HP, KPI HP lebih ringkas, tombol tampil kata sandi, placeholder email generik).
- Jangan merusak fungsi: login, RLS, versi konflik, offline draft. Jangan menambah dependensi berat tanpa perlu; ukur ukuran bundle.
- Verifikasi: Playwright + Chromium sudah terpasang di sandbox (`require('playwright')`, jangan install ulang). Uji di mode pratinjau (data contoh, tanpa login, tanpa menyentuh DB). Ambil screenshot desktop 1366 dan HP 390 sebelum/sesudah, cek overflow horizontal, error konsol, dan skor aksesibilitas dasar. Jangan login ke data asli atau membuat/mengubah data produksi untuk pengujian tanpa izin pengguna.

## 7. Yang belum diverifikasi

Alur dengan data asli (login, unggah lampiran, finalisasi/ekspor laporan, undangan anggota via email); kebijakan kata sandi di Auth (UI menyebut minimal 12 karakter); isi `bylt_register_attachment`, `bylt_private.can_edit`, `audit_task`; perilaku seret-dan-lepas Kanban; hasil pencarian ⌘K; apakah ada rate-limit/captcha login. Screenshot dan skrip uji ada di scratchpad sesi lama dan akan hilang; ambil ulang bila perlu.

## 8. Alat yang dipakai di sesi ini

Supabase MCP (`list_projects`, `list_tables`, `get_advisors`, `execute_sql` read-only, `get_edge_function`, `list_migrations`, `apply_migration` belum dipakai) dan Playwright. Sesi baru butuh konektor Supabase yang terhubung ke org yang sama untuk bagian backend.
