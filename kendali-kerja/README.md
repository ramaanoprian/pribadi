# Kendali Kerja BYLT — perbaikan backend

Draft migration untuk project Supabase `dokbylt` (`mvxceyvbiehxeolfxslw`).
**Status: BELUM diterapkan ke produksi.** Terapkan berurutan setelah disetujui.

| Migration | Isi |
|---|---|
| `20261105000100_bylt_task_validation` | Pesan error jelas untuk Selesai/Menunggu/Dibatalkan; riwayat "pendukung" hanya saat berubah (dengan before/after); impor tugas selesai tanpa hasil aktual tidak gagal lagi. |
| `20261105000200_bylt_attachment_types` | Bucket `bylt-evidence` menerima HEIC/HEIF dan PowerPoint; `bylt_register_attachment` memakai ukuran/MIME dari storage, bukan dari klien. |
| `20261105000300_bylt_reminders_v2` | Pengingat ke PIC + pendukung; tugas tanpa PIC ke admin; "terlewati" diulang tiap hari (WIB); hormati preferensi pengingat. |
| `20261105000400_bylt_recurrences` | Tabel `bylt_recurrences` + RPC `bylt_save_recurrence`/`bylt_delete_recurrence` (admin) + job harian `bylt-recurrences` (00:05 WIB). Perlu UI di frontend untuk mengatur aturannya. |

Semua perubahan hanya menyentuh objek `bylt_*`. Policy, grant, dan fungsi dashboard dokumen
(`records`, `activity`, bucket `lampiran`/`cadangan`, dll.) tidak diubah.

## Uji lokal

`supabase/tests/00_mock_schema.sql` meniru struktur produksi yang relevan (termasuk definisi
fungsi lama). Dengan PostgreSQL 16 lokal:

```bash
createdb t
psql -d t -f supabase/tests/00_mock_schema.sql
for f in supabase/migrations/*.sql; do psql -d t -v ON_ERROR_STOP=1 -f "$f"; done
psql -d t -f supabase/tests/10_scenarios.sql
```
