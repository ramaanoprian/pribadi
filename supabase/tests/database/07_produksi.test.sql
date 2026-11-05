-- Fase 4: produksi, resep, stok bahan
begin;
create extension if not exists pgtap with schema extensions;
\ir ../helpers/helpers.psql
select plan(46);

select tests.create_user('owner@t.test', 'owner') as owner_id \gset
select tests.create_user('admin@t.test', 'admin') as admin_id \gset
select tests.create_user('baking@t.test', 'admin_baking') as baking_id \gset
select tests.create_user('baking2@t.test', 'admin_baking') as baking2_id \gset

delete from public.production_logs;
delete from public.recipes;
delete from public.orders;
delete from public.products;
delete from public.ingredients;

insert into public.ingredients (id, nama, satuan, stok, min_stock, cost_per_unit) values
  ('d0000000-0000-4000-8000-00000000000a', 'Terigu', 'gram', 1000, 200, 10),
  ('d0000000-0000-4000-8000-00000000000b', 'Telur', 'butir', 10, 5, 2000);
insert into public.products (id, nama, slug, harga, sale_mode, stok) values
  ('a0000000-0000-4000-8000-000000000001', 'Soes', 'soes', 3500, 'ready_stock', 0),
  ('a0000000-0000-4000-8000-000000000002', 'Bolu', 'bolu', 85000, 'preorder', 0),
  ('a0000000-0000-4000-8000-000000000003', 'Tanpa Resep', 'tanpa-resep', 1000, 'ready_stock', 0);
insert into public.recipes (id, product_id, yield_per_batch) values
  ('e0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 70),
  ('e0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000002', 2);
insert into public.recipe_items (recipe_id, ingredient_id, qty_per_batch) values
  ('e0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-00000000000a', 500),
  ('e0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-00000000000b', 8),
  ('e0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-00000000000a', 100);
update public.app_settings set value = '"peringatan"' where key = 'produksi.mode_bahan_kurang';

\set soes '''a0000000-0000-4000-8000-000000000001'''
\set telur '''d0000000-0000-4000-8000-00000000000b'''
\set terigu '''d0000000-0000-4000-8000-00000000000a'''

-- ---------- Admin Baking: akses ----------
select tests.login_as(:'baking_id');
select is((select count(*)::int from public.production_products()), 2, 'Admin Baking melihat produk yang punya resep');
select is((select count(*)::int from public.recipes), 0, 'Admin Baking tidak bisa membuka resep');
select is((select count(*)::int from public.recipe_items), 0, 'Admin Baking tidak bisa membuka isi resep');
select throws_ok('select cost_per_unit from public.ingredients', '42501', null, 'Admin Baking tidak melihat harga bahan');
select is((select count(*)::int from public.biaya_bahan), 0, 'View harga bahan kosong untuk Admin Baking');
select is((select count(*)::int from public.ingredients), 2, 'Admin Baking melihat daftar stok bahan');

-- Pratinjau
select is((public.production_preview(:soes, 2) ->> 'hasil')::numeric, 140::numeric, '2 batch Soes = 140 pcs');
select is((public.production_preview(:soes, 2) ->> 'ada_kurang')::boolean, true, 'Pratinjau memperingatkan bahan kurang (telur 16 > 10)');
select is((public.production_preview(:soes, 1) ->> 'ada_kurang')::boolean, false, '1 batch: bahan cukup');
select throws_ok(format('select public.production_preview(%L, 0)', 'a0000000-0000-4000-8000-000000000001'), '22023', null, 'Batch minimal 1');

-- Input produksi
select public.record_production(:soes, 1) as p1 \gset
select is((select stok from public.products where slug = 'soes'), 70, 'Stok produk jadi bertambah 70');
select results_eq($$ select nama, stok from public.ingredients order by nama $$,
  $$ values ('Telur', 2.000), ('Terigu', 500.000) $$, 'Bahan berkurang sesuai resep');
select results_eq(format('select created_by, batches, total_output, status from public.production_logs where id = %L', :'p1'::jsonb ->> 'id'),
  format('values (%L::uuid, 1, 70.000, %L)', :'baking_id', 'aktif'), 'Log produksi mencatat penginput & hasil');
select throws_ok(format('update public.production_logs set batches = 5 where id = %L', :'p1'::jsonb ->> 'id'), '42501', null,
  'Admin Baking tidak bisa mengubah input');
select throws_ok(format('delete from public.production_logs where id = %L', :'p1'::jsonb ->> 'id'), '42501', null,
  'Admin Baking tidak bisa menghapus input');
select throws_ok(format('select public.cancel_production(%L, %L)', :'p1'::jsonb ->> 'id', 'Salah'), '42501', null,
  'Admin Baking tidak bisa membatalkan produksi');
select throws_ok(format('select public.add_ingredient_stock(%L, 10, 1000)', 'd0000000-0000-4000-8000-00000000000b'), '42501', null,
  'Admin Baking tidak bisa menambah stok bahan');
select throws_ok($$ insert into public.ingredients (nama, satuan) values ('Gula', 'gram') $$, '42501', null, 'Admin Baking tidak bisa menambah bahan');
select is((select count(*)::int from public.stock_movements where product_id is not null), 0, 'Admin Baking tidak melihat pergerakan stok produk');
select ok((select count(*) from public.stock_movements where ingredient_id is not null) > 0, 'Admin Baking melihat pergerakan stok bahan');
select throws_ok(format('select public.record_production(%L, 1)', 'a0000000-0000-4000-8000-000000000003'), 'P0002', null,
  'Produk tanpa resep tidak bisa diproduksi');

-- Riwayat milik sendiri
select tests.login_as(:'baking2_id');
select is((select count(*)::int from public.production_logs), 0, 'Admin Baking lain tidak melihat riwayat orang lain');
select tests.logout();

-- HPP
select is((select hpp_snapshot from public.production_logs where id = (:'p1'::jsonb ->> 'id')::uuid), 21000.00, 'HPP batch = 500×10 + 8×2000');
select is((select cost_per_unit from public.products where slug = 'soes'), 300.00, 'HPP per pcs = 21000 / 70');

-- Mode blokir
update public.app_settings set value = '"blokir"' where key = 'produksi.mode_bahan_kurang';
select tests.login_as(:'baking_id');
select throws_ok(format('select public.record_production(%L, 1)', 'a0000000-0000-4000-8000-000000000001'), '23514', null,
  'Mode blokir: produksi ditolak bila bahan kurang');
select tests.logout();
select is((select stok from public.ingredients where nama = 'Telur'), 2.000, 'Stok bahan tidak berubah saat ditolak');

-- Mode peringatan: tetap lanjut, stok bahan minus sebagai penanda
update public.app_settings set value = '"peringatan"' where key = 'produksi.mode_bahan_kurang';
select tests.login_as(:'baking_id');
select public.record_production(:soes, 1) as p2 \gset
select tests.logout();
select is((:'p2'::jsonb ->> 'bahan_kurang')::boolean, true, 'Mode peringatan: produksi tetap tersimpan dengan tanda bahan kurang');
select is((select stok from public.ingredients where nama = 'Telur'), -6.000, 'Selisih bahan terlihat sebagai stok minus');
select is((select stok from public.products where slug = 'soes'), 140, 'Stok produk jadi 140');

-- Preorder: stok produk tidak berubah
select tests.login_as(:'admin_id');
select public.record_production('a0000000-0000-4000-8000-000000000002', 1) as p3 \gset
select is((select stok from public.products where slug = 'bolu'), 0, 'Produk pre-order tidak menambah stok jadi');

-- Belanja & koreksi bahan
select is(public.add_ingredient_stock(:telur, 20, 50000, 'Pasar'), 14.000, 'Belanja menambah stok bahan');
select throws_ok(format('select public.adjust_ingredient_stock(%L, -1, %L)', 'd0000000-0000-4000-8000-00000000000b', ''), '22023', null,
  'Koreksi stok bahan wajib alasan');
select is(public.adjust_ingredient_stock(:telur, -2, 'Pecah'), 12.000, 'Koreksi stok bahan');
select tests.logout();
select is((select cost_per_unit from public.ingredients where nama = 'Telur'), 2500.0000, 'Harga rata-rata bergerak dari belanja (stok minus dihitung 0)');

-- Pembatalan
select tests.login_as(:'admin_id');
select throws_ok(format('select public.cancel_production(%L, %L)', :'p1'::jsonb ->> 'id', ''), '22023', null, 'Pembatalan wajib alasan');
select lives_ok(format('select public.cancel_production(%L, %L)', :'p1'::jsonb ->> 'id', 'Salah input jumlah'), 'Admin membatalkan produksi');
select is((select stok from public.products where slug = 'soes'), 70, 'Pembatalan mengurangi stok produk jadi');
select is((select stok from public.ingredients where nama = 'Terigu'), 400.000, 'Pembatalan mengembalikan stok bahan (terigu: -100 + 500)');
select throws_ok(format('select public.cancel_production(%L, %L)', :'p1'::jsonb ->> 'id', 'Lagi'), '22023', null, 'Tidak bisa dibatalkan dua kali');
select is(public.adjust_product_stock(:soes, -60, 'Terjual offline'), 10, 'Sebagian stok terjual');
select throws_ok(format('select public.cancel_production(%L, %L)', :'p2'::jsonb ->> 'id', 'Batal'), '23514', null,
  'Tidak bisa membatalkan bila hasil produksi sudah terjual');
select throws_ok(format($q$ select public.save_recipe(%L, 70, '[{"ingredient_id": %s, "qty": 1}]') $q$, 'a0000000-0000-4000-8000-000000000003', '"d0000000-0000-4000-8000-00000000000a"'),
  '42501', null, 'Admin tidak bisa mengubah resep (lihat saja)');
select ok((select count(*) from public.recipes) = 2, 'Admin bisa melihat resep');

-- Owner menyimpan resep
select tests.login_as(:'owner_id', 'aal2');
select lives_ok($$ select public.save_recipe('a0000000-0000-4000-8000-000000000003', 10,
  '[{"ingredient_id": "d0000000-0000-4000-8000-00000000000a", "qty": 50}, {"ingredient_id": "d0000000-0000-4000-8000-00000000000b", "qty": 2}]') $$,
  'Owner menyimpan resep baru');
select throws_ok($$ select public.save_recipe('a0000000-0000-4000-8000-000000000003', 10,
  '[{"ingredient_id": "d0000000-0000-4000-8000-00000000000a", "qty": 50}, {"ingredient_id": "d0000000-0000-4000-8000-00000000000a", "qty": 2}]') $$,
  '22023', null, 'Bahan ganda dalam resep ditolak');
select ok(exists (select 1 from public.audit_logs where aksi = 'produksi.batal' and alasan = 'Salah input jumlah'), 'Pembatalan produksi tercatat di log');
select tests.logout();

select * from finish();
rollback;
