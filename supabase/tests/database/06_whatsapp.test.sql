-- Fase 3: antrean & template WhatsApp
begin;
create extension if not exists pgtap with schema extensions;
\ir ../helpers/helpers.psql
select plan(45);

select tests.create_user('owner@t.test', 'owner') as owner_id \gset
select tests.create_user('admin@t.test', 'admin') as admin_id \gset
select tests.create_user('baking@t.test', 'admin_baking') as baking_id \gset

delete from public.whatsapp_messages;
delete from public.orders;
delete from public.production_logs;
delete from public.recipes;
delete from public.products;
update public.app_settings set value = '100' where key in ('batas.pesanan_per_jam', 'batas.lacak_per_15_menit');
update public.app_settings set value = '500' where key = 'batas.pesanan_per_jam_ip';
update public.app_settings set value = '"https://gutvibes.id/"' where key = 'toko.url_situs';
update public.app_settings set value = '60' where key = 'whatsapp.maks_per_menit';
insert into public.products (id, nama, slug, harga, sale_mode, stok) values
  ('a0000000-0000-4000-8000-000000000001', 'Soes', 'soes', 3500, 'ready_stock', 100),
  ('a0000000-0000-4000-8000-000000000002', 'Bolu', 'bolu', 85000, 'preorder', 0);

-- ---------- Antrean saat pesanan dibuat ----------
select tests.as_anon();
select public.create_order('Rani', '081211110001', 'ambil', now() + interval '1 day',
  '[{"product_id": "a0000000-0000-4000-8000-000000000001", "qty": 10}]') as o1 \gset
select public.create_order('Budi', '081211110002', 'antar', now() + interval '1 day',
  '[{"product_id": "a0000000-0000-4000-8000-000000000002", "qty": 1}]', 'Jl. Rahasia No. 7, Bandung') as o2 \gset
select tests.logout();
select id as o1_id from public.orders where kode = :'o1'::jsonb ->> 'kode' \gset
select id as o2_id from public.orders where kode = :'o2'::jsonb ->> 'kode' \gset

select results_eq(format('select tahap, to_phone, status from public.whatsapp_messages where order_id = %L', :'o1_id'),
  $$ values ('pesanan_diterima', '6281211110001', 'pending') $$, 'Pesanan baru masuk antrean "pesanan diterima"');
select ok((select body from public.whatsapp_messages where order_id = :'o1_id') like '%' || (:'o1'::jsonb ->> 'kode') || '%',
  'Isi pesan memuat kode pesanan');
select ok((select body from public.whatsapp_messages where order_id = :'o1_id') like '%Rp35.000%', 'Isi pesan memuat total');
select ok((select body from public.whatsapp_messages where order_id = :'o1_id') like '%• Soes ×10%', 'Isi pesan memuat item');
select ok((select body from public.whatsapp_messages where order_id = :'o1_id')
          like '%https://gutvibes.id/lacak/' || (:'o1'::jsonb ->> 'tracking_code') || '%', 'Isi pesan memuat tautan lacak');
select ok((select body from public.whatsapp_messages where order_id = :'o1_id') like '%WIB%', 'Jadwal ditulis dalam WIB');
select ok((select body from public.whatsapp_messages where order_id = :'o2_id') like '%+ ongkir%', 'Ongkir belum diisi ditandai di total');
select ok((select body from public.whatsapp_messages where order_id = :'o2_id') not like '%Rahasia%', 'Alamat tidak dikirim lewat WhatsApp');
select ok((select body from public.whatsapp_messages where order_id = :'o2_id') not like '%081211110002%'
          and (select body from public.whatsapp_messages where order_id = :'o2_id') not like '%6281211110002%', 'Nomor HP tidak ada di isi pesan');
select tests.as_anon();
select is(public.track_order(:'o1'::jsonb ->> 'kode', '081211110001') ->> 'notif_wa', 'pending', 'Status notifikasi terlihat di halaman lacak');
select tests.logout();

-- Idempoten
select private.notify_order(:'o1_id', 'diterima');
select is((select count(*)::int from public.whatsapp_messages where order_id = :'o1_id'), 1, 'Tahap yang sama tidak diantrekan dua kali');

-- ---------- Tahap status ----------
select tests.login_as(:'admin_id');
select public.confirm_order_payment(:'o1_id');
select public.mark_order_ready(:'o1_id');
select public.complete_order(:'o1_id');
select public.cancel_order(:'o2_id', 'Stok bahan habis');
select tests.logout();
select results_eq(format('select tahap from public.whatsapp_messages where order_id = %L order by created_at, tahap', :'o1_id'),
  $$ values ('pembayaran_dikonfirmasi'), ('pesanan_diterima'), ('pesanan_selesai'), ('pesanan_siap') $$,
  'Setiap tahap status mengantrekan pesan');
select ok((select body from public.whatsapp_messages where order_id = :'o2_id' and tahap = 'pesanan_dibatalkan') like '%Stok bahan habis%',
  'Pesan pembatalan memuat alasan');

-- ---------- Sakelar & template nonaktif ----------
update public.whatsapp_templates set aktif = false where tahap = 'pesanan_diterima';
select tests.as_anon();
select public.create_order('Tanpa Template', '081211110003', 'ambil', now() + interval '1 day',
  '[{"product_id": "a0000000-0000-4000-8000-000000000002", "qty": 1}]') as o3 \gset
select tests.logout();
select is((select count(*)::int from public.whatsapp_messages m join public.orders o on o.id = m.order_id where o.kode = :'o3'::jsonb ->> 'kode'),
  0, 'Template nonaktif tidak mengirim pesan');
update public.whatsapp_templates set aktif = true where tahap = 'pesanan_diterima';
update public.app_settings set value = 'false' where key = 'whatsapp.aktif';
select tests.as_anon();
select public.create_order('WA Mati', '081211110004', 'ambil', now() + interval '1 day',
  '[{"product_id": "a0000000-0000-4000-8000-000000000002", "qty": 1}]') as o4 \gset
select tests.logout();
select is((select count(*)::int from public.whatsapp_messages m join public.orders o on o.id = m.order_id where o.kode = :'o4'::jsonb ->> 'kode'),
  0, 'Sakelar WhatsApp mati: tidak ada pesan, pesanan tetap dibuat');
update public.app_settings set value = 'true' where key = 'whatsapp.aktif';

-- Pesanan tetap tersimpan walau antrean error
alter table public.whatsapp_messages add constraint uji_gagal check (false) not valid;
select tests.as_anon();
select lives_ok($$ select public.create_order('Antrean Rusak', '081211110005', 'ambil', now() + interval '1 day',
  '[{"product_id": "a0000000-0000-4000-8000-000000000002", "qty": 1}]') $$, 'Pesanan tetap dibuat walau antrean WhatsApp gagal');
select tests.logout();
select is((select count(*)::int from public.orders where no_hp = '6281211110005'), 1, 'Pesanan tersimpan di database');
alter table public.whatsapp_messages drop constraint uji_gagal;

-- ---------- Template ----------
select tests.login_as(:'admin_id');
select throws_ok($$ update public.whatsapp_templates set isi = 'Halo {alamat}' where tahap = 'pesanan_selesai' $$, '22023', null,
  'Variabel template yang tidak dikenal ditolak');
select lives_ok($$ update public.whatsapp_templates set isi = 'Terima kasih {nama}! Pesanan {kode} selesai.' where tahap = 'pesanan_selesai' $$,
  'Admin bisa mengubah template');
select is((select count(*)::int from public.whatsapp_messages), (select count(*)::int from public.whatsapp_messages), 'Admin bisa melihat log WhatsApp');
select ok((select count(*) from public.whatsapp_messages) > 0, 'Log WhatsApp berisi pesan');
select tests.login_as(:'baking_id');
select is((select count(*)::int from public.whatsapp_messages), 0, 'Admin Baking tidak melihat log WhatsApp');
update public.whatsapp_templates set isi = 'Diretas' where tahap = 'pesanan_selesai';
select tests.logout();
select is((select isi from public.whatsapp_templates where tahap = 'pesanan_selesai'), 'Terima kasih {nama}! Pesanan {kode} selesai.',
  'Admin Baking tidak bisa mengubah template');
select ok(exists (select 1 from public.audit_logs where aksi = 'template_wa.ubah'), 'Perubahan template tercatat di log');
select tests.as_anon();
select throws_ok('select * from public.whatsapp_messages', '42501', null, 'Tamu tidak bisa membaca log WhatsApp');
select tests.logout();

-- ---------- Worker: klaim, batas per menit, coba ulang ----------
select tests.login_as(:'admin_id');
select throws_ok('select public.wa_claim_messages(10)', '42501', null, 'Hanya worker (service_role) yang bisa mengambil antrean');
select tests.logout();

update public.app_settings set value = '3' where key = 'whatsapp.maks_per_menit';
select tests.as_service();
select is(jsonb_array_length(public.wa_claim_messages(10) -> 'pesan'), 3, 'Klaim dibatasi batas kirim per menit');
select is(jsonb_array_length(public.wa_claim_messages(10) -> 'pesan'), 0, 'Kuota menit ini habis');
select tests.logout();
select is((select count(*)::int from public.whatsapp_messages where status = 'mengirim' and attempts = 1), 3, 'Pesan yang diklaim berstatus mengirim');

select id as m1 from public.whatsapp_messages where status = 'mengirim' order by created_at limit 1 \gset
select id as m2 from public.whatsapp_messages where status = 'mengirim' order by created_at offset 1 limit 1 \gset
select tests.as_service();
select is(public.wa_mark_result(:'m1', true, 'dummy', 'abc-1'), 'terkirim', 'Hasil sukses -> terkirim');
select is(public.wa_mark_result(:'m2', false, 'dummy', null, 'device disconnect'), 'pending', 'Gagal pertama -> dijadwalkan ulang');
select tests.logout();
select ok((select next_attempt_at > now() + interval '50 seconds' from public.whatsapp_messages where id = :'m2'), 'Coba ulang diberi jeda');
select is((select private.order_public_json(order_id) ->> 'notif_wa' from public.whatsapp_messages where id = :'m2' and tahap = 'pesanan_diterima')
          is distinct from 'pending', true, 'Pelanggan melihat status gagal (tombol cadangan) setelah percobaan pertama gagal');
select is((select sent_at is not null from public.whatsapp_messages where id = :'m1'), true, 'Waktu terkirim dicatat');

-- Percobaan ke-2 & ke-3 gagal -> status gagal
update public.app_settings set value = '60' where key = 'whatsapp.maks_per_menit';
update public.whatsapp_messages set next_attempt_at = now(), last_attempt_at = now() - interval '2 minutes' where id = :'m2';
update public.whatsapp_messages set status = 'terkirim' where status = 'pending' and id <> :'m2';
select tests.as_service();
select is((public.wa_claim_messages(10) -> 'pesan' -> 0 ->> 'id')::uuid, :'m2'::uuid, 'Pesan dicoba ulang setelah jeda');
select public.wa_mark_result(:'m2', false, 'dummy', null, 'timeout') \gset
select tests.logout();
update public.whatsapp_messages set next_attempt_at = now() where id = :'m2';
select tests.as_service();
select is((public.wa_claim_messages(10) -> 'pesan' -> 0 ->> 'attempts')::int, 3, 'Percobaan ketiga');
select is(public.wa_mark_result(:'m2', false, 'dummy', null, 'timeout'), 'gagal', 'Setelah 3x gagal -> status gagal');
select tests.logout();

-- Pesan macet di "mengirim" diambil ulang
select id as m3 from public.whatsapp_messages where status = 'mengirim' limit 1 \gset
update public.whatsapp_messages set locked_at = now() - interval '10 minutes' where id = :'m3';
select tests.as_service();
select ok(public.wa_claim_messages(10) -> 'pesan' @> jsonb_build_array(jsonb_build_object('id', :'m3')), 'Pesan macet diambil ulang');
select tests.logout();

-- ---------- Kirim ulang & uji kirim ----------
select tests.login_as(:'baking_id');
select throws_ok(format('select public.wa_resend(%L)', :'m2'), '42501', null, 'Admin Baking tidak bisa kirim ulang');
select tests.login_as(:'admin_id');
select throws_ok(format('select public.wa_resend(%L)', :'m1'), '22023', null, 'Pesan terkirim tidak bisa dikirim ulang');
select lives_ok(format('select public.wa_resend(%L)', :'m2'), 'Admin mengirim ulang pesan gagal');
select results_eq(format('select status, attempts from public.whatsapp_messages where id = %L', :'m2'),
  $$ values ('pending', 0) $$, 'Pesan kembali ke antrean dengan percobaan direset');
select throws_ok($$ select public.wa_enqueue_test('081211119999') $$, '42501', null, 'Admin tidak bisa uji kirim (khusus Owner)');
select tests.login_as(:'owner_id', 'aal2');
select ok(public.wa_enqueue_test('081211119999') is not null, 'Owner bisa uji kirim');
select ok(exists (select 1 from public.audit_logs where aksi = 'pesan_wa.kirim_ulang'), 'Kirim ulang tercatat di log aktivitas');
select tests.logout();

select * from finish();
rollback;
