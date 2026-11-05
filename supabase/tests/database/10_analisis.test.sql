-- Fase 7: analisis pelanggan (VIEW + fungsi, khusus Owner)
begin;
create extension if not exists pgtap with schema extensions;
\ir ../helpers/helpers.psql
select plan(16);

select tests.create_user('owner@t.test', 'owner') as owner_id \gset
select tests.create_user('admin@t.test', 'admin') as admin_id \gset
select tests.create_user('m1@t.test', 'member') as m1_id \gset

delete from public.reward_redemptions;
delete from public.stamps;
delete from public.whatsapp_messages;
delete from public.orders;
delete from public.customers;
update public.app_settings set value = '60' where key = 'pelanggan.hari_tidur';
update public.app_settings set value = '3' where key = 'pelanggan.ambang_vip';

insert into public.customers (id, user_id, nama, phone_normalized) values
  ('c7000000-0000-4000-8000-000000000001', :'m1_id', 'Ani Member', '6281200007001'),
  ('c7000000-0000-4000-8000-000000000002', null, 'Budi Tamu', '6281200007002'),
  ('c7000000-0000-4000-8000-000000000003', null, 'Citra Tidur', '6281200007003'),
  ('c7000000-0000-4000-8000-000000000004', null, 'Dedi Batal', '6281200007004');

-- Helper: pesanan selesai pada tanggal tertentu.
create or replace function tests.done(p_cust uuid, p_total bigint, p_when timestamptz, p_status public.order_status default 'selesai', p_produk text default 'Soes')
returns void language plpgsql as $$
declare v uuid := gen_random_uuid();
begin
  insert into public.orders (id, kode, customer_id, nama_pemesan, no_hp, status, fulfillment, jadwal, subtotal, ongkir_diset, completed_at, created_at)
  values (v, 'GV-T-' || substr(v::text, 1, 8), p_cust, 'x', '6281200009999', p_status, 'ambil', p_when, p_total, true,
          case when p_status = 'selesai' then p_when end, p_when - interval '1 day');
  insert into public.order_items (order_id, nama_produk, sale_mode, harga, qty) values (v, p_produk, 'ready_stock', p_total, 1);
end $$;

select tests.done('c7000000-0000-4000-8000-000000000001', 50000, now() - interval '100 days', 'selesai', 'Bolu');
select tests.done('c7000000-0000-4000-8000-000000000001', 30000, now() - interval '5 days');
select tests.done('c7000000-0000-4000-8000-000000000001', 20000, now() - interval '2 days');
select tests.done('c7000000-0000-4000-8000-000000000002', 90000, now() - interval '3 days');
select tests.done('c7000000-0000-4000-8000-000000000003', 40000, now() - interval '90 days');
select tests.done('c7000000-0000-4000-8000-000000000004', 70000, now() - interval '1 day', 'dibatalkan');

-- Akses
select tests.login_as(:'admin_id');
select is((select count(*)::int from public.analisis_pelanggan), 0, 'Admin tidak melihat analisis pelanggan');
select throws_ok($$ select public.customer_ranking() $$, '42501', null, 'Admin tidak bisa membuka peringkat');
select tests.login_as(:'owner_id', 'aal1');
select ok((select count(*)::int from public.analisis_pelanggan) > 0, 'Owner tanpa 2FA langsung melihat analisis');

select tests.login_as(:'owner_id', 'aal2');
select results_eq($$ select jumlah_pesanan, total_belanja, is_repeat, is_vip, is_tidur, jenis from public.analisis_pelanggan where nama = 'Ani Member' $$,
  $$ values (3, 100000::bigint, true, true, false, 'member') $$, 'Member: 3 pesanan selesai, repeat, VIP (ambang 3)');
select is((select produk_favorit from public.analisis_pelanggan where nama = 'Ani Member'), 'Soes', 'Produk favorit = paling sering dibeli');
select is((select is_tidur from public.analisis_pelanggan where nama = 'Citra Tidur'), true, 'Pelanggan tidur (> 60 hari)');
select is((select jumlah_pesanan from public.analisis_pelanggan where nama = 'Dedi Batal'), 0, 'Pesanan batal tidak dihitung');

-- Peringkat
select is((public.customer_ranking(null, null, null, null, null, 'total') -> 'rows' -> 0 ->> 'nama'), 'Ani Member', 'Urut total belanja: Ani (100 rb) teratas');
select is((public.customer_ranking((now() - interval '10 days')::date, now()::date, null, null, null, 'total') -> 'rows' -> 0 ->> 'nama'), 'Budi Tamu',
  'Filter periode 10 hari: Budi (90 rb) teratas');
select is((public.customer_ranking(null, null, 'tamu') ->> 'total')::int, 2, 'Filter jenis tamu (yang punya pesanan selesai)');
select is((public.customer_ranking(null, null, null, 'tidur') -> 'rows' -> 0 ->> 'nama'), 'Citra Tidur', 'Filter pelanggan tidur');
select is((public.customer_ranking(null, null, null, null, '7002') -> 'rows' -> 0 ->> 'nama'), 'Budi Tamu', 'Cari berdasarkan nomor HP');

-- Ringkasan periode 10 hari: Ani (lama → kembali) & Budi (baru)
select public.customer_analytics_summary((now() - interval '10 days')::date, now()::date) as s \gset
select is((:'s'::jsonb ->> 'aktif')::int, 2, 'Pelanggan aktif dalam periode');
select results_eq(format($q$ select (%1$L::jsonb ->> 'baru')::int, (%1$L::jsonb ->> 'kembali')::int $q$, :'s'), $$ values (1, 1) $$, 'Baru vs kembali');
select is((:'s'::jsonb ->> 'rata_rata_pesanan')::numeric, 1.50, 'Rata-rata pesanan per pelanggan (3 pesanan / 2)');
select is((:'s'::jsonb ->> 'tidur')::int, 1, 'Jumlah pelanggan tidur');
select tests.logout();

select * from finish();
rollback;
