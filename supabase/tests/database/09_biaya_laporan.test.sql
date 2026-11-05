-- Fase 6: biaya operasional, anggaran, periode, laba rugi
begin;
create extension if not exists pgtap with schema extensions;
\ir ../helpers/helpers.psql
select plan(27);

select tests.create_user('owner@t.test', 'owner') as owner_id \gset
select tests.create_user('admin@t.test', 'admin') as admin_id \gset

delete from public.period_closings;
delete from public.expenses;
delete from public.budgets;
delete from public.reward_redemptions;
delete from public.stamps;
delete from public.whatsapp_messages;
delete from public.orders;

select id as kat_util from public.expense_categories where nama = 'Utilitas' \gset
select id as kat_kerja from public.expense_categories where nama = 'Tenaga kerja' \gset
select (date_trunc('month', (now() at time zone 'Asia/Jakarta'))::date) as bulan_ini \gset
select (date_trunc('month', (now() at time zone 'Asia/Jakarta'))::date - interval '1 month')::date as bulan_lalu \gset

-- Pesanan selesai bulan ini: 3 × Rp10.000 (HPP 4.000), ongkir 5.000
insert into public.customers (id, nama, phone_normalized) values ('c9000000-0000-4000-8000-000000000001', 'Uji', '6281200001234');
insert into public.orders (id, kode, customer_id, nama_pemesan, no_hp, status, fulfillment, jadwal, alamat_antar, subtotal, diskon,
                           shipping_cost, ongkir_diset, payment_status, completed_at)
values ('f9000000-0000-4000-8000-000000000001', 'GV-UJI-0001', 'c9000000-0000-4000-8000-000000000001', 'Uji', '6281200001234',
        'selesai', 'antar', now(), 'Jl. Uji 1', 30000, 0, 5000, true, 'lunas', now());
insert into public.order_items (order_id, nama_produk, sale_mode, harga, qty, cost_snapshot)
values ('f9000000-0000-4000-8000-000000000001', 'Kue Uji', 'ready_stock', 10000, 3, 4000);

-- ---------- Akses ----------
select tests.login_as(:'admin_id');
select is((select count(*)::int from public.expense_categories), 0, 'Admin tidak melihat kategori biaya');
select throws_ok(format($q$ insert into public.expenses (tanggal, category_id, nominal) values (current_date, %L, 1000) $q$, :'kat_util'),
  '42501', null, 'Admin tidak bisa mencatat biaya');
select throws_ok($$ select public.report_profit_loss(current_date - 30, current_date) $$, '42501', null, 'Admin tidak bisa membuka laporan laba rugi');
select throws_ok($$ select public.owner_dashboard() $$, '42501', null, 'Admin tidak bisa membuka dashboard keuangan');
select tests.login_as(:'owner_id', 'aal1');
select is((select count(*)::int from public.expense_categories), 8, 'Owner tanpa 2FA langsung melihat kategori biaya');

-- ---------- Owner ----------
select tests.login_as(:'owner_id', 'aal2');
select is((select count(*)::int from public.expense_categories), 8, '8 kategori biaya default');
select lives_ok(format($q$ insert into public.expenses (tanggal, category_id, nominal, keterangan) values (%L, %L, 3000, 'Listrik') $q$, :'bulan_ini', :'kat_util'),
  'Owner mencatat biaya');
select throws_ok(format($q$ insert into public.expenses (tanggal, category_id, nominal, rincian) values (%L, %L, 5000, '[{"nama":"A","nominal":3000},{"nama":"B","nominal":1000}]') $q$, :'bulan_ini', :'kat_kerja'),
  '22023', null, 'Rincian gaji harus berjumlah sama dengan nominal');
select lives_ok(format($q$ insert into public.expenses (tanggal, category_id, nominal, rincian) values (%L, %L, 5000, '[{"nama":"A","nominal":3000},{"nama":"B","nominal":2000}]') $q$, :'bulan_ini', :'kat_kerja'),
  'Gaji dengan rincian per orang');
select ok(exists (select 1 from public.audit_logs where aksi = 'biaya.tambah'), 'Pencatatan biaya tercatat di log');

-- Laba rugi
select public.report_profit_loss(:'bulan_ini', (:'bulan_ini'::date + interval '1 month - 1 day')::date) as pl \gset
select is((:'pl'::jsonb ->> 'pendapatan')::bigint, 35000::bigint, 'Pendapatan = penjualan + ongkir');
select is((:'pl'::jsonb ->> 'hpp')::bigint, 12000::bigint, 'HPP = cost_snapshot × qty');
select is((:'pl'::jsonb ->> 'laba_kotor')::bigint, 23000::bigint, 'Laba kotor = pendapatan − HPP');
select is((:'pl'::jsonb ->> 'biaya_operasional')::bigint, 8000::bigint, 'Biaya operasional periode');
select is((:'pl'::jsonb ->> 'laba_bersih')::bigint, 15000::bigint, 'Laba bersih = laba kotor − biaya');
select is((:'pl'::jsonb -> 'per_produk' -> 0 ->> 'margin_persen')::numeric, 60.0, 'Margin per produk (persen)');

-- Anggaran & dashboard
insert into public.budgets (periode, category_id, nominal) values (:'bulan_ini', :'kat_util', 2000);
select is(jsonb_array_length(public.owner_dashboard() -> 'tren'), 6, 'Tren 6 bulan');
select is((public.owner_dashboard() -> 'anggaran' -> 0 ->> 'realisasi')::bigint, 3000::bigint, 'Realisasi anggaran per kategori');

-- ---------- Periode ----------
select throws_ok(format('select public.close_period(%L)', :'bulan_ini'), '22023', null, 'Bulan berjalan belum bisa ditutup');
select lives_ok(format($q$ insert into public.expenses (tanggal, category_id, nominal) values (%L, %L, 1000) $q$, :'bulan_lalu', :'kat_util'), 'Catat biaya bulan lalu');
select lives_ok(format('select public.close_period(%L)', :'bulan_lalu'), 'Owner menutup periode bulan lalu');
select throws_ok(format($q$ insert into public.expenses (tanggal, category_id, nominal) values (%L, %L, 1000) $q$, :'bulan_lalu', :'kat_util'),
  '42501', null, 'Periode tertutup: tidak bisa menambah biaya');
select throws_ok(format($q$ update public.expenses set nominal = 9 where periode = %L $q$, :'bulan_lalu'), '42501', null, 'Periode tertutup: tidak bisa mengubah biaya');
select throws_ok(format($q$ delete from public.expenses where periode = %L $q$, :'bulan_lalu'), '42501', null, 'Periode tertutup: tidak bisa menghapus biaya');
select throws_ok(format('select public.reopen_period(%L, %L)', :'bulan_lalu', ''), '22023', null, 'Buka kembali periode wajib alasan');
select lives_ok(format('select public.reopen_period(%L, %L)', :'bulan_lalu', 'Nota susulan'), 'Owner membuka kembali periode');
select ok(exists (select 1 from public.audit_logs where aksi = 'periode.buka_kembali' and alasan = 'Nota susulan'), 'Buka periode tercatat di log');
select tests.logout();

select * from finish();
rollback;
