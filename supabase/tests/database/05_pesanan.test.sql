-- Fase 2: katalog, pesanan, stok, promo, lacak
begin;
create extension if not exists pgtap with schema extensions;
\ir ../helpers/helpers.psql
select plan(78);

-- ---------- Data (tes tidak bergantung pada seed; semua di-rollback) ----------
delete from public.orders;
delete from public.promos;
delete from public.production_logs;
delete from public.recipes;
delete from public.products;
delete from public.categories;
select tests.create_user('owner@t.test', 'owner') as owner_id \gset
select tests.create_user('admin@t.test', 'admin') as admin_id \gset
select tests.create_user('baking@t.test', 'admin_baking') as baking_id \gset
select tests.create_user('m1@t.test', 'member', 'Member Satu', '081211112222') as m1_id \gset
select tests.create_user('m2@t.test', 'member', 'Member Dua', '081233334444') as m2_id \gset

update public.app_settings set value = '100' where key in ('batas.pesanan_per_jam', 'batas.lacak_per_15_menit');
update public.app_settings set value = '500' where key = 'batas.pesanan_per_jam_ip';

insert into public.categories (id, nama, slug) values
  ('c0000000-0000-4000-8000-000000000001', 'Kue', 'kue'),
  ('c0000000-0000-4000-8000-000000000002', 'Arsip', 'arsip');
update public.categories set aktif = false where slug = 'arsip';

insert into public.products (id, category_id, nama, slug, harga, sale_mode, stok, cost_per_unit) values
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'Soes', 'soes', 3500, 'ready_stock', 100, 1200),
  ('a0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001', 'Bolu', 'bolu', 85000, 'preorder', 0, 30000),
  ('a0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000001', 'Brownies', 'brownies', 65000, 'ready_stock', 2, 20000),
  ('a0000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000001', 'Lama', 'lama', 1000, 'ready_stock', 10, 0),
  ('a0000000-0000-4000-8000-000000000005', 'c0000000-0000-4000-8000-000000000002', 'Kategori Mati', 'kategori-mati', 1000, 'ready_stock', 10, 0);
update public.products set aktif = false where slug = 'lama';

insert into public.promos (kode, nama, tipe, nilai, min_belanja, maks_diskon, kuota) values
  ('manis10', 'Diskon 10%', 'persen', 10, 50000, 20000, 3);
insert into public.promos (kode, nama, tipe, nilai, selesai, mulai) values
  ('LEWAT', 'Kedaluwarsa', 'nominal', 5000, now() - interval '1 day', now() - interval '10 days');

\set soes '''a0000000-0000-4000-8000-000000000001'''
\set bolu '''a0000000-0000-4000-8000-000000000002'''
\set brownies '''a0000000-0000-4000-8000-000000000003'''

-- ---------- Katalog publik ----------
select tests.as_anon();
select is((select count(*)::int from public.katalog_produk), 3, 'Katalog publik hanya produk aktif di kategori aktif');
select is((select stok from public.katalog_produk where slug = 'bolu'), null, 'Stok preorder tidak ditampilkan');
select throws_ok('select * from public.products', '42501', null, 'Anon tidak bisa membaca tabel produk');
select throws_ok('select * from public.orders', '42501', null, 'Anon tidak bisa membaca pesanan');
select is((select value from public.konten_publik where key = 'cerita.judul'), 'Cerita Kami', 'Anon membaca konten web publik');

-- ---------- create_order: harga dihitung ulang di server ----------
select public.create_order('Tamu Satu', '0812-5555-6666', 'ambil', now() + interval '1 day',
  jsonb_build_array(jsonb_build_object('product_id', :soes, 'qty', 10, 'harga', 1),
                    jsonb_build_object('product_id', :bolu, 'qty', 1, 'harga', 1))) as o1 \gset
select is((:'o1'::jsonb ->> 'total')::int, 120000, 'Total pakai harga database, harga dari klien diabaikan');
select is(:'o1'::jsonb ->> 'status', 'menunggu_konfirmasi', 'Status awal menunggu konfirmasi');
select ok(:'o1'::jsonb ->> 'kode' ~ '^GV-[0-9]{6}-[A-Z0-9]{4}$', 'Format kode pesanan GV-YYMMDD-XXXX');
select ok(char_length(:'o1'::jsonb ->> 'tracking_code') = 32, 'Tracking code acak 32 karakter');
select is((select stok from public.katalog_produk where slug = 'soes'), 100, 'Membuat pesanan belum memotong stok');

select public.create_order('Tamu Satu Lagi', '+62 812 5555 6666', 'ambil', now() + interval '2 day',
  jsonb_build_array(jsonb_build_object('product_id', :soes, 'qty', 2))) as o2 \gset
select tests.logout();
select is((select count(*)::int from public.customers where phone_normalized = '6281255556666'), 1,
  'Pesanan tamu digabung per nomor HP (08xx = +628xx)');
select is((select nama from public.customers where phone_normalized = '6281255556666'), 'Tamu Satu',
  'Nama pelanggan lama tidak ditimpa pesanan berikutnya');
select is((select user_id from public.orders where kode = :'o1'::jsonb ->> 'kode'), null, 'Pesanan tamu tanpa user_id');

-- ---------- Validasi ----------
select tests.as_anon();
select throws_ok(format($q$ select public.create_order('X Y', '081211119999', 'ambil', now() + interval '1 day',
  '[{"product_id": "a0000000-0000-4000-8000-000000000004", "qty": 1}]') $q$), '22023', null, 'Produk nonaktif ditolak');
select throws_ok(format($q$ select public.create_order('X Y', '081211119999', 'ambil', now() + interval '1 day',
  '[{"product_id": "a0000000-0000-4000-8000-000000000005", "qty": 1}]') $q$), '22023', null, 'Produk di kategori nonaktif ditolak');
select throws_ok(format($q$ select public.create_order('X Y', '081211119999', 'ambil', now() + interval '1 day',
  jsonb_build_array(jsonb_build_object('product_id', %L, 'qty', 3))) $q$, 'a0000000-0000-4000-8000-000000000003'),
  '23514', null, 'Ready stock melebihi stok ditolak');
select throws_ok($$ select public.create_order('X Y', '12345', 'ambil', now() + interval '1 day', '[{"product_id": "a0000000-0000-4000-8000-000000000001", "qty": 1}]') $$,
  '22023', null, 'Nomor HP tidak valid ditolak');
select throws_ok($$ select public.create_order('X Y', '081211119999', 'antar', now() + interval '1 day', '[{"product_id": "a0000000-0000-4000-8000-000000000001", "qty": 1}]') $$,
  '22023', null, 'Pesanan antar wajib alamat');
select throws_ok($$ select public.create_order('X Y', '081211119999', 'ambil', now() - interval '1 hour', '[{"product_id": "a0000000-0000-4000-8000-000000000001", "qty": 1}]') $$,
  '22023', null, 'Jadwal di masa lalu ditolak');
select throws_ok($$ select public.create_order('X Y', '081211119999', 'ambil', now() + interval '1 day', '[]') $$,
  '22023', null, 'Keranjang kosong ditolak');
select throws_ok($$ select public.create_order('X Y', '081211119999', 'ambil', now() + interval '1 day', '[{"product_id": "a0000000-0000-4000-8000-000000000001", "qty": 0}]') $$,
  '22023', null, 'Qty 0 ditolak');

-- ---------- Promo ----------
select is(public.check_promo('manis10', 100000) ->> 'diskon', '10000', 'check_promo menghitung diskon persen');
select is(public.check_promo('MANIS10', 300000) ->> 'diskon', '20000', 'Diskon dibatasi maks_diskon');
select is(public.check_promo('MANIS10', 30000) ->> 'valid', 'false', 'Minimal belanja dicek');
select is(public.check_promo('LEWAT', 100000) ->> 'valid', 'false', 'Promo kedaluwarsa tidak berlaku');
select is(public.check_promo('NGAWUR', 100000) ->> 'valid', 'false', 'Kode tak dikenal tidak berlaku');
select public.create_order('Promo Satu', '081277770001', 'ambil', now() + interval '1 day',
  jsonb_build_array(jsonb_build_object('product_id', :bolu, 'qty', 2)), null, null, 'manis10') as op \gset
select results_eq(format($q$ select (%L::jsonb ->> 'subtotal')::int, (%L::jsonb ->> 'diskon')::int, (%L::jsonb ->> 'total')::int $q$, :'op', :'op', :'op'),
  $$ values (170000, 17000, 153000) $$, 'Diskon promo diterapkan di server');
select public.create_order('Promo Dua', '081277770002', 'ambil', now() + interval '1 day',
  jsonb_build_array(jsonb_build_object('product_id', :bolu, 'qty', 1)), null, null, 'MANIS10') \gset
select public.create_order('Promo Tiga', '081277770003', 'ambil', now() + interval '1 day',
  jsonb_build_array(jsonb_build_object('product_id', :bolu, 'qty', 1)), null, null, 'MANIS10') \gset
select throws_ok($$ select public.create_order('Promo Empat', '081277770004', 'ambil', now() + interval '1 day',
  '[{"product_id": "a0000000-0000-4000-8000-000000000002", "qty": 1}]', null, null, 'MANIS10') $$,
  '22023', 'Kuota promo sudah habis', 'Kuota promo dihormati');
select tests.logout();

-- ---------- Gratis ongkir ----------
update public.app_settings set value = '100000' where key = 'pesanan.gratis_ongkir_min';
select tests.as_anon();
select public.create_order('Antar Gratis', '081277770005', 'antar', now() + interval '1 day',
  jsonb_build_array(jsonb_build_object('product_id', :bolu, 'qty', 2)), 'Jl. Mawar No. 1, Bandung') as og \gset
select public.create_order('Antar Bayar', '081277770006', 'antar', now() + interval '1 day',
  jsonb_build_array(jsonb_build_object('product_id', :soes, 'qty', 5)), 'Jl. Melati No. 2, Bandung') as oa \gset
select tests.logout();
select results_eq(format($q$ select gratis_ongkir, ongkir_diset from public.orders where kode = %L $q$, :'og'::jsonb ->> 'kode'),
  $$ values (true, true) $$, 'Antar di atas ambang otomatis gratis ongkir');
select results_eq(format($q$ select gratis_ongkir, ongkir_diset from public.orders where kode = %L $q$, :'oa'::jsonb ->> 'kode'),
  $$ values (false, false) $$, 'Antar di bawah ambang menunggu input ongkir');

-- ---------- Member ----------
select tests.login_as(:'m1_id');
select public.create_order('Member Satu', '081211112222', 'ambil', now() + interval '1 day',
  jsonb_build_array(jsonb_build_object('product_id', :soes, 'qty', 1))) as om \gset
select is((select count(*)::int from public.orders), 1, 'Member hanya melihat pesanannya sendiri');
select is((select count(*)::int from public.order_items), 1, 'Member hanya melihat item pesanannya sendiri');
select throws_ok(format('select public.confirm_order_payment(%L)', (select id from public.orders limit 1)), '42501', null,
  'Member tidak bisa mengonfirmasi pembayaran');
select tests.logout();
select is((select user_id from public.customers where phone_normalized = '6281211112222'), :'m1_id'::uuid,
  'Pelanggan member tertaut ke akunnya');

-- ---------- Admin Baking ----------
select tests.login_as(:'baking_id');
select is((select count(*)::int from public.orders), 0, 'Admin Baking tidak melihat pesanan');
select throws_ok(format('select public.confirm_order_payment(%L)', (select id from public.orders where kode = :'o1'::jsonb ->> 'kode')),
  '42501', null, 'Admin Baking tidak bisa mengelola pesanan');
select tests.logout();
select id as o1_id from public.orders where kode = :'o1'::jsonb ->> 'kode' \gset
select id as oa_id from public.orders where kode = :'oa'::jsonb ->> 'kode' \gset
select id as o2_id from public.orders where kode = :'o2'::jsonb ->> 'kode' \gset

-- ---------- Admin: alur status & stok ----------
select tests.login_as(:'admin_id');
select lives_ok(format('select public.confirm_order_payment(%L)', :'o1_id'), 'Admin mengonfirmasi pembayaran');
select results_eq(format('select status::text, payment_status::text, stok_dipotong from public.orders where id = %L', :'o1_id'),
  $$ values ('dikonfirmasi', 'lunas', true) $$, 'Status dikonfirmasi & lunas');
select is((select stok from public.products where slug = 'soes'), 90, 'Ready stock dipotong saat dikonfirmasi');
select is((select stok from public.products where slug = 'bolu'), 0, 'Preorder tidak memengaruhi stok');
select is((select count(*)::int from public.stock_movements where ref_id = :'o1'::jsonb ->> 'kode' and jenis = 'pesanan'), 1,
  'Pergerakan stok tercatat');
select throws_ok(format('select public.confirm_order_payment(%L)', :'o1_id'), '22023', null, 'Tidak bisa dikonfirmasi dua kali');
select throws_ok(format('select public.complete_order(%L)', :'o1_id'), '22023', null, 'Tidak bisa lompat ke selesai sebelum siap');

select throws_ok(format('select public.confirm_order_payment(%L)', :'oa_id'), '22023', 'Isi ongkir terlebih dahulu sebelum mengonfirmasi pembayaran',
  'Pesanan antar wajib ongkir sebelum dikonfirmasi');
select lives_ok(format('select public.set_order_shipping(%L, 15000, %L)', :'oa_id', 'GoSend'), 'Admin mengisi ongkir & kurir');
select results_eq(format('select total, courier_name from public.orders where id = %L', :'oa_id'),
  $$ values (32500::bigint, 'GoSend') $$, 'Total = subtotal - diskon + ongkir');

-- Stok tidak cukup saat konfirmasi
select tests.logout();
select tests.as_anon();
select public.create_order('Brow A', '081288880001', 'ambil', now() + interval '1 day', jsonb_build_array(jsonb_build_object('product_id', :brownies, 'qty', 2))) as ba \gset
select public.create_order('Brow B', '081288880002', 'ambil', now() + interval '1 day', jsonb_build_array(jsonb_build_object('product_id', :brownies, 'qty', 2))) as bb \gset
select tests.logout();
select tests.login_as(:'admin_id');
select lives_ok(format('select public.confirm_order_payment(id) from public.orders where kode = %L', :'ba'::jsonb ->> 'kode'), 'Konfirmasi pertama memakai stok terakhir');
select throws_ok(format('select public.confirm_order_payment(id) from public.orders where kode = %L', :'bb'::jsonb ->> 'kode'),
  '23514', null, 'Konfirmasi ditolak bila stok sudah habis');

-- Siap -> selesai + snapshot HPP
select lives_ok(format('select public.mark_order_ready(%L)', :'o1_id'), 'Tandai siap');
select tests.logout();
update public.products set cost_per_unit = 1300 where slug = 'soes';
select tests.login_as(:'admin_id');
select lives_ok(format('select public.complete_order(%L)', :'o1_id'), 'Selesaikan pesanan');
select tests.logout();
select is((select cost_snapshot from public.order_items where order_id = :'o1_id' and nama_produk = 'Soes'), 1300.00,
  'Snapshot HPP diambil saat pesanan selesai');
select tests.login_as(:'admin_id');
select throws_ok(format('select public.cancel_order(%L, %L)', :'o1_id', 'Salah input'), '22023', null, 'Pesanan selesai tidak bisa dibatalkan');

-- Batal mengembalikan stok
select lives_ok(format('select public.confirm_order_payment(%L)', :'o2_id'), 'Konfirmasi pesanan kedua (soes 2)');
select is((select stok from public.products where slug = 'soes'), 88, 'Stok soes 88 setelah konfirmasi');
select throws_ok(format('select public.cancel_order(%L, %L)', :'o2_id', ''), '22023', null, 'Pembatalan wajib alasan');
select lives_ok(format('select public.cancel_order(%L, %L)', :'o2_id', 'Pelanggan batal'), 'Admin membatalkan pesanan');
select is((select stok from public.products where slug = 'soes'), 90, 'Stok kembali saat pesanan dibatalkan');

-- HPP tidak terlihat Admin
select throws_ok('select cost_per_unit from public.products', '42501', null, 'Admin tidak bisa membaca HPP produk');
select throws_ok('select cost_snapshot from public.order_items', '42501', null, 'Admin tidak bisa membaca HPP item pesanan');
select is((select count(*)::int from public.biaya_produk), 0, 'View biaya_produk kosong untuk Admin');
select throws_ok($$ update public.products set stok = 999 where slug = 'soes' $$, '42501', null, 'Stok tidak bisa diubah langsung');

-- Koreksi stok & ubah harga (teraudit)
select throws_ok(format('select public.adjust_product_stock(%L, -5, %L)', 'a0000000-0000-4000-8000-000000000001', ''), '22023', null,
  'Koreksi stok wajib alasan');
select is(public.adjust_product_stock('a0000000-0000-4000-8000-000000000001', -5, 'Rusak/jatuh'), 85, 'Koreksi stok mengurangi stok');
select throws_ok(format('select public.adjust_product_stock(%L, -500, %L)', 'a0000000-0000-4000-8000-000000000001', 'Salah'), '23514', null,
  'Koreksi tidak boleh membuat stok negatif');
update public.products set harga = 4000 where slug = 'soes';
select tests.logout();

select tests.login_as(:'owner_id', 'aal2');
select is((select count(*)::int from public.biaya_produk), 5, 'Owner (2FA) membaca HPP lewat biaya_produk');
select results_eq($$ select data_lama ->> 'harga', data_baru ->> 'harga' from public.audit_logs
                     where aksi = 'produk.ubah' and data_lama ->> 'harga' is distinct from data_baru ->> 'harga' $$,
  $$ values ('3500', '4000') $$, 'Perubahan harga tercatat di audit log');
select ok(exists (select 1 from public.audit_logs where aksi = 'produk.ubah' and alasan = 'Rusak/jatuh'), 'Koreksi stok tercatat dengan alasan');
select ok(exists (select 1 from public.audit_logs where aksi = 'pesanan.ubah' and alasan = 'Pelanggan batal'), 'Pembatalan tercatat dengan alasan');
select tests.logout();

-- ---------- Lacak pesanan ----------
select tests.as_anon();
select is(public.track_order(:'o1'::jsonb ->> 'kode', '081255556666') ->> 'status', 'selesai', 'Lacak dengan kode + HP');
select is(public.track_order(:'o1'::jsonb ->> 'kode', '081299999999'), null, 'HP salah tidak membocorkan data');
select is(public.track_order_by_token(:'o1'::jsonb ->> 'tracking_code') ->> 'kode', :'o1'::jsonb ->> 'kode', 'Lacak lewat tautan rahasia');
select ok(not (public.track_order(:'o1'::jsonb ->> 'kode', '081255556666') ?| array['customer_id', 'user_id', 'id']),
  'Data lacak tanpa id internal');
select tests.logout();
update public.app_settings set value = '1' where key = 'batas.lacak_per_15_menit';
select tests.as_anon();
select throws_ok($$ select public.track_order('GV-000000-AAAA', '081255556666') $$, '54000', null, 'Percobaan lacak dibatasi');
select tests.logout();

-- ---------- Rate limit pesanan per nomor ----------
update public.app_settings set value = '1' where key = 'batas.pesanan_per_jam';
select tests.as_anon();
select lives_ok($$ select public.create_order('Spam', '081299990000', 'ambil', now() + interval '1 day', '[{"product_id": "a0000000-0000-4000-8000-000000000002", "qty": 1}]') $$,
  'Pesanan pertama nomor baru diterima');
select throws_ok($$ select public.create_order('Spam', '081299990000', 'ambil', now() + interval '1 day', '[{"product_id": "a0000000-0000-4000-8000-000000000002", "qty": 1}]') $$,
  '54000', null, 'Pesanan berikutnya dari nomor yang sama dibatasi');
select tests.logout();

-- ---------- Konten web ----------
select tests.login_as(:'admin_id');
select lives_ok($$ update public.site_content set value = 'Jl. Braga 1, Bandung' where key = 'lokasi.alamat' $$, 'Admin mengubah konten web');
select throws_ok($$ update public.site_content set value = 'javascript:alert(1)' where key = 'lokasi.maps_url' $$, '22023', null,
  'Tautan konten wajib https');
select tests.login_as(:'baking_id');
update public.site_content set value = 'Diretas' where key = 'lokasi.alamat';
select tests.logout();
select is((select value from public.site_content where key = 'lokasi.alamat'), 'Jl. Braga 1, Bandung', 'Admin Baking tidak bisa mengubah konten');

select * from finish();
rollback;
