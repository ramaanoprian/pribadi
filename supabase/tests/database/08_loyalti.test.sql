-- Fase 5: stamp, kartu, hadiah, lencana, OTP, klaim pesanan tamu
begin;
create extension if not exists pgtap with schema extensions;
\ir ../helpers/helpers.psql
select plan(48);

select tests.create_user('owner@t.test', 'owner') as owner_id \gset
select tests.create_user('admin@t.test', 'admin') as admin_id \gset
select tests.create_user('baking@t.test', 'admin_baking') as baking_id \gset
select tests.create_user('m1@t.test', 'member', 'Mira', '081255550001') as m1_id \gset
select tests.create_user('m2@t.test', 'member', 'Dodi', '081255550002') as m2_id \gset

delete from public.reward_redemptions;
delete from public.stamps;
delete from public.whatsapp_messages;
delete from public.orders;
delete from public.production_logs;
delete from public.recipes;
delete from public.products;
update public.app_settings set value = '100' where key in ('batas.pesanan_per_jam', 'batas.lacak_per_15_menit');
update public.app_settings set value = '500' where key = 'batas.pesanan_per_jam_ip';
update public.stamp_rules set stamps_per_reward = 3, min_belanja_per_stamp = 0, aktif = true;
insert into public.products (id, nama, slug, harga, sale_mode, stok) values
  ('a0000000-0000-4000-8000-000000000001', 'Soes', 'soes', 3500, 'ready_stock', 1000),
  ('a0000000-0000-4000-8000-000000000002', 'Bolu', 'bolu', 85000, 'preorder', 0);

-- Helper: selesaikan pesanan sebagai Admin.
create or replace function tests.finish(p_kode text, p_admin uuid) returns void language plpgsql as $$
declare v_id uuid;
begin
  select id into v_id from public.orders where kode = p_kode;
  perform set_config('request.jwt.claims', json_build_object('sub', p_admin, 'role', 'authenticated')::text, true);
  perform public.confirm_order_payment(v_id);
  perform public.mark_order_ready(v_id);
  perform public.complete_order(v_id);
  perform set_config('request.jwt.claims', '', true);
end $$;
create or replace function tests.order_as(p_uid uuid, p_hp text, p_kode_hadiah text default null, p_produk uuid default 'a0000000-0000-4000-8000-000000000002')
returns text language plpgsql as $$
declare v jsonb;
begin
  perform set_config('request.jwt.claims', case when p_uid is null then json_build_object('role', 'anon')
          else json_build_object('sub', p_uid, 'role', 'authenticated') end::text, true);
  v := public.create_order('Uji', p_hp, 'ambil', now() + interval '1 day',
         jsonb_build_array(jsonb_build_object('product_id', p_produk, 'qty', 1)), null, null, null, true, p_kode_hadiah);
  perform set_config('request.jwt.claims', '', true);
  return v ->> 'kode';
end $$;

-- ---------- Stamp ----------
select tests.order_as(null, '081299990001') as g1 \gset
select tests.finish(:'g1', :'admin_id');
select is((select count(*)::int from public.stamps), 0, 'Pesanan tamu selesai tidak mendapat stamp');

select tests.order_as(:'m1_id', '081255550001') as a1 \gset
select tests.finish(:'a1', :'admin_id');
select is((select count(*)::int from public.stamps s join public.customers c on c.id = s.customer_id where c.user_id = :'m1_id'), 1,
  'Pesanan member selesai = 1 stamp');
select ok(exists (select 1 from public.customer_badges cb join public.badges b on b.id = cb.badge_id
                  join public.customers c on c.id = cb.customer_id where c.user_id = :'m1_id' and b.kode = 'pertama'),
  'Lencana "pesanan pertama" diberikan');
select ok((select body from public.whatsapp_messages where tahap = 'stamp_bertambah' order by created_at desc limit 1) like '%1/3%',
  'WhatsApp "stamp bertambah" memuat progres kartu');
select is(private.award_stamp((select id from public.orders where kode = :'a1')), false, 'Stamp tidak diberikan dua kali untuk pesanan yang sama');
select throws_ok(format($q$ insert into public.stamps (customer_id, order_id, tipe, qty) select customer_id, order_id, 'earn', 1 from public.stamps where order_id = (select id from public.orders where kode = %L) $q$, :'a1'),
  '23505', null, 'UNIQUE order_id mencegah stamp ganda');
select tests.login_as(:'m1_id');
select throws_ok($$ insert into public.stamps (customer_id, tipe, qty) values ((select id from public.customers limit 1), 'adjust', 5) $$,
  '42501', null, 'Member tidak bisa menulis stamp');
select tests.logout();

-- Kartu penuh -> hadiah
select tests.order_as(:'m1_id', '081255550001') as a2 \gset
select tests.finish(:'a2', :'admin_id');
select tests.order_as(:'m1_id', '081255550001') as a3 \gset
select tests.finish(:'a3', :'admin_id');
select is(private.stamp_balance((select id from public.customers where user_id = :'m1_id')), 0, 'Kartu penuh -> kartu baru mulai dari 0');
select is((select count(*)::int from public.reward_redemptions r join public.customers c on c.id = r.customer_id where c.user_id = :'m1_id' and r.status = 'tersedia'),
  1, 'Hadiah terbuka saat kartu penuh');
select ok((select expires_at between now() + interval '179 days' and now() + interval '181 days' from public.reward_redemptions limit 1),
  'Hadiah berlaku 6 bulan');
select ok(exists (select 1 from public.whatsapp_messages where tahap = 'hadiah_terbuka'), 'WhatsApp "hadiah terbuka" diantrekan');
select kode as hd from public.reward_redemptions limit 1 \gset

select tests.login_as(:'m1_id');
select is((public.my_loyalty() ->> 'stamp')::int, 0, 'my_loyalty: saldo stamp');
select is(jsonb_array_length(public.my_loyalty() -> 'hadiah_saya'), 1, 'my_loyalty: daftar hadiah');
select is((select count(*)::int from public.reward_redemptions), 1, 'Member melihat hadiahnya sendiri');
select tests.login_as(:'m2_id');
select is((select count(*)::int from public.reward_redemptions), 0, 'Member lain tidak melihat hadiah orang lain');
select is((select count(*)::int from public.stamps), 0, 'Member lain tidak melihat stamp orang lain');
select tests.login_as(:'baking_id');
select is((select count(*)::int from public.stamps), 0, 'Admin Baking tidak melihat stamp');
select tests.logout();

-- ---------- Memakai hadiah ----------
select throws_ok(format('select tests.order_as(null, %L, %L)', '081299990009', :'hd'), '42501', null, 'Tamu tidak bisa memakai hadiah');
select throws_ok(format('select tests.order_as(%L, %L, %L)', :'m2_id', '081255550002', :'hd'), '22023', null, 'Hadiah orang lain ditolak');
select throws_ok(format($q$ select public.create_order('Uji', '081255550001', 'ambil', now() + interval '1 day', '[{"product_id": "a0000000-0000-4000-8000-000000000002", "qty": 1}]', null, null, 'X', true, %L) $q$, :'hd'),
  '22023', null, 'Promo dan hadiah tidak bisa bersamaan');
select tests.order_as(:'m1_id', '081255550001', :'hd') as r1 \gset
select results_eq(format('select subtotal, diskon, reward_diskon, total from public.orders where kode = %L', :'r1'),
  $$ values (85000::bigint, 25000::bigint, 25000::bigint, 60000::bigint) $$, 'Hadiah diskon Rp25.000 diterapkan di server');
select is((select status from public.reward_redemptions where kode = :'hd'), 'dipakai', 'Hadiah berstatus dipakai');
select throws_ok(format('select tests.order_as(%L, %L, %L)', :'m1_id', '081255550001', :'hd'), '22023', null, 'Hadiah tidak bisa dipakai dua kali');

select tests.login_as(:'admin_id');
select throws_ok(format('select public.confirm_order_payment(id) from public.orders where kode = %L', :'r1'), '22023', null,
  'Pembayaran tidak bisa dikonfirmasi sebelum hadiah diverifikasi');
select lives_ok(format('select public.reject_order_reward(id, %L) from public.orders where kode = %L', 'Kode salah pakai', :'r1'), 'Admin menolak hadiah');
select tests.logout();
select results_eq(format('select diskon, total from public.orders where kode = %L', :'r1'), $$ values (0::bigint, 85000::bigint) $$,
  'Hadiah ditolak: diskon dihapus dari pesanan');
select is((select status from public.reward_redemptions where kode = :'hd'), 'tersedia', 'Hadiah ditolak kembali tersedia');

select tests.order_as(:'m1_id', '081255550001', :'hd') as r2 \gset
select tests.login_as(:'admin_id');
select lives_ok(format('select public.verify_order_reward(id) from public.orders where kode = %L', :'r2'), 'Admin memverifikasi hadiah');
select lives_ok(format('select public.confirm_order_payment(id) from public.orders where kode = %L', :'r2'), 'Setelah verifikasi, pembayaran bisa dikonfirmasi');
select lives_ok(format('select public.cancel_order(id, %L) from public.orders where kode = %L', 'Pelanggan batal', :'r2'), 'Pesanan dengan hadiah dibatalkan');
select tests.logout();
select is((select status from public.reward_redemptions where kode = :'hd'), 'tersedia', 'Pembatalan mengembalikan hadiah');

-- Penukaran di toko
select tests.login_as(:'admin_id');
select throws_ok(format('select public.redeem_reward_manual(%L, %L)', :'hd', ''), '22023', null, 'Penukaran manual wajib catatan');
select lives_ok(format('select public.redeem_reward_manual(%L, %L)', :'hd', 'Ditukar di kasir'), 'Admin memproses penukaran hadiah di toko');
select tests.logout();
select is((select status from public.reward_redemptions where kode = :'hd'), 'dipakai', 'Hadiah tercatat dipakai');

-- ---------- Koreksi stamp ----------
select id as c1 from public.customers where user_id = :'m1_id' \gset
select tests.login_as(:'baking_id');
select throws_ok(format('select public.adjust_stamps(%L, 1, %L)', :'c1', 'Bonus'), '42501', null, 'Admin Baking tidak bisa koreksi stamp');
select tests.login_as(:'admin_id');
select throws_ok(format('select public.adjust_stamps(%L, 1, %L)', :'c1', ''), '22023', null, 'Koreksi stamp wajib alasan');
select throws_ok(format('select public.adjust_stamps(%L, -5, %L)', :'c1', 'Salah'), '23514', null, 'Stamp tidak bisa minus');
select is(public.adjust_stamps(:'c1', 2, 'Pesanan offline'), 2, 'Admin menambah stamp manual');
select tests.logout();
select ok(exists (select 1 from public.audit_logs where aksi = 'stamp.koreksi' and alasan = 'Pesanan offline'), 'Koreksi stamp tercatat di log');

-- Minimal belanja per stamp
update public.stamp_rules set min_belanja_per_stamp = 1000000;
select tests.order_as(:'m1_id', '081255550001') as a4 \gset
select tests.finish(:'a4', :'admin_id');
select is(private.stamp_balance(:'c1'), 2, 'Di bawah minimal belanja tidak mendapat stamp');
update public.stamp_rules set min_belanja_per_stamp = 0;

-- ---------- OTP & klaim pesanan tamu ----------
select tests.order_as(null, '081277770777') as g2 \gset
select tests.finish(:'g2', :'admin_id');
select tests.order_as(null, '081277770777') as g3 \gset
select tests.finish(:'g3', :'admin_id');
select tests.login_as(:'m2_id');
select ok((public.request_phone_otp('0812-7777-0777') ->> 'phone') = '6281277770777', 'Member meminta OTP');
select tests.logout();
select substring(body from '([0-9]{6})') as otp from public.whatsapp_messages where tahap = 'kode_otp' order by created_at desc limit 1 \gset
select ok(:'otp' ~ '^[0-9]{6}$', 'Kode OTP 6 digit dikirim lewat antrean WhatsApp');
select tests.login_as(:'m2_id');
select is(public.verify_phone_otp('000000') ->> 'ok', 'false', 'Kode salah ditolak');
select is((public.verify_phone_otp(:'otp') ->> 'stamp_diklaim')::int, 2, 'Kode benar: 2 pesanan tamu selesai diklaim jadi stamp');
select tests.logout();
select ok((select phone_verified_at is not null and no_hp = '6281277770777' from public.profiles where id = :'m2_id'), 'Nomor HP terverifikasi');
select is((select count(*)::int from public.orders where no_hp = '6281277770777' and user_id = :'m2_id'), 2, 'Pesanan tamu lama kini milik member');
select tests.login_as(:'m1_id');
select throws_ok($$ select public.request_phone_otp('081277770777') $$, '23505', null, 'Nomor yang sudah terverifikasi di akun lain ditolak');
select tests.login_as(:'m2_id');
update public.profiles set no_hp = '081288881111' where id = auth.uid();
select tests.logout();
select is((select phone_verified_at from public.profiles where id = :'m2_id'), null, 'Ganti nomor mencabut status verifikasi');

select * from finish();
rollback;
