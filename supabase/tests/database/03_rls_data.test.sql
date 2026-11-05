-- RLS per peran: pengaturan, pelanggan, alamat, audit log
begin;
create extension if not exists pgtap with schema extensions;
\ir ../helpers/helpers.psql
select plan(32);

select tests.create_user('owner@t.test', 'owner') as owner_id \gset
select tests.create_user('admin@t.test', 'admin') as admin_id \gset
select tests.create_user('baking@t.test', 'admin_baking') as baking_id \gset
select tests.create_user('m1@t.test', 'member') as m1_id \gset
select tests.create_user('m2@t.test', 'member') as m2_id \gset

insert into public.customers (user_id, nama, phone_normalized) values (:'m1_id', 'Member Satu', '081211112222');
insert into public.customers (nama, phone_normalized) values ('Tamu', '+6281333334444');
insert into public.addresses (user_id, penerima, no_hp, alamat, is_default)
values (:'m2_id', 'M2', '081255556666', 'Jl. Kenanga 2, Bandung', true);

select is((select phone_normalized from public.customers where nama = 'Tamu'), '6281333334444',
  'Nomor pelanggan tamu dinormalisasi (+628 -> 628)');
select throws_ok($$ insert into public.customers (nama, phone_normalized) values ('Dobel', '0813-3333-4444') $$,
  '23505', null, 'Pelanggan digabung per nomor (08xx & +628xx dianggap sama)');

-- ANON
select tests.as_anon();
select is((select count(*)::int from public.app_settings),
          (select count(*)::int from public.app_settings where is_public), 'Anon hanya melihat pengaturan publik');
select ok((select count(*) from public.app_settings) > 0, 'Anon dapat membaca pengaturan publik');
select throws_ok('select * from public.profiles', '42501', null, 'Anon tidak bisa membaca profil');
select throws_ok('select * from public.customers', '42501', null, 'Anon tidak bisa membaca pelanggan');
select throws_ok('select * from public.audit_logs', '42501', null, 'Anon tidak bisa membaca audit log');
select throws_ok($$ update public.app_settings set value = '"X"' where key = 'toko.nama' $$, '42501', null,
  'Anon tidak bisa mengubah pengaturan');
select tests.logout();

-- ADMIN BAKING
select tests.login_as(:'baking_id');
select is((select count(*)::int from public.customers), 0, 'Admin Baking tidak melihat data pelanggan');
select is((select count(*)::int from public.audit_logs), 0, 'Admin Baking tidak melihat log aktivitas');
select is((select count(*)::int from public.addresses), 0, 'Admin Baking tidak melihat alamat');
select throws_ok($$ insert into public.customers (nama, phone_normalized) values ('X', '081277778888') $$,
  '42501', null, 'Admin Baking tidak bisa menambah pelanggan');

-- ADMIN
select tests.login_as(:'admin_id');
select is((select count(*)::int from public.customers), 2, 'Admin melihat semua kontak pelanggan');
select lives_ok($$ update public.customers set nama = 'Tamu Setia' where nama = 'Tamu' $$, 'Admin bisa mengubah kontak pelanggan');
select throws_ok($$ update public.customers set is_vip = true where nama = 'Tamu Setia' $$,
  '42501', null, 'Admin tidak bisa mengubah penanda VIP');
update public.app_settings set value = '"Diretas"' where key = 'toko.nama';
select is((select value #>> '{}' from public.app_settings where key = 'toko.nama'), 'GutVibes',
  'Admin tidak bisa mengubah pengaturan (RLS)');
select is((select count(*)::int from public.audit_logs), 0, 'Admin tidak melihat log aktivitas');
select is((select count(*)::int from public.addresses), 0, 'Admin tidak melihat alamat member');

-- MEMBER
select tests.login_as(:'m1_id');
select is((select count(*)::int from public.customers), 1, 'Member hanya melihat data pelanggannya sendiri');
select lives_ok($$ insert into public.addresses (penerima, no_hp, alamat, is_default) values ('Saya', '081211112222', 'Jl. Mawar 1, Bandung', true) $$,
  'Member menambah alamat sendiri');
select lives_ok($$ insert into public.addresses (label, penerima, no_hp, alamat, is_default) values ('Kantor', 'Saya', '081211112222', 'Jl. Asia Afrika 8, Bandung', true) $$,
  'Member menambah alamat default kedua');
select is((select count(*)::int from public.addresses where is_default), 1, 'Hanya satu alamat default per member');
select is((select count(*)::int from public.addresses), 2, 'Member hanya melihat alamatnya sendiri');
select throws_ok(format($q$ insert into public.addresses (user_id, penerima, no_hp, alamat) values (%L, 'X', '081211112222', 'Jl. Palsu 1') $q$, :'m2_id'),
  '42501', null, 'Member tidak bisa menulis alamat untuk user lain');
delete from public.addresses where penerima = 'M2';
update public.addresses set alamat = 'Diretas 123' where penerima = 'M2';
update public.customers set nama = 'Diretas';
select tests.logout();
select is((select count(*)::int from public.customers where nama = 'Diretas'), 0, 'Member tidak bisa mengubah data pelanggan');
select is((select alamat from public.addresses where penerima = 'M2'), 'Jl. Kenanga 2, Bandung',
  'Alamat member lain tidak bisa diubah/dihapus');

-- OWNER
select tests.login_as(:'owner_id', 'aal2');
select lives_ok($$ update public.app_settings set value = '"GutVibes Bakehouse"' where key = 'toko.nama' $$, 'Owner mengubah pengaturan');
select throws_ok($$ update public.app_settings set value = '"enam puluh"' where key = 'pelanggan.hari_tidur' $$,
  '22023', null, 'Nilai pengaturan divalidasi tipenya');
select throws_ok($$ update public.app_settings set value = '"hapus"' where key = 'produksi.mode_bahan_kurang' $$,
  '22023', null, 'Nilai pilihan divalidasi');
select results_eq(
  $$ select aksi, data_lama ->> 'value', data_baru ->> 'value' from public.audit_logs where entitas = 'pengaturan' and entitas_id = 'toko.nama' $$,
  $$ values ('pengaturan.ubah', 'GutVibes', 'GutVibes Bakehouse') $$,
  'Perubahan pengaturan tercatat di audit log');
select throws_ok($$ update public.audit_logs set aksi = 'x' $$, '42501', null, 'Owner pun tidak bisa mengubah audit log');
select tests.logout();
select throws_ok($$ delete from public.audit_logs $$, '42501', null, 'Audit log tidak bisa dihapus bahkan oleh superuser');

select * from finish();
rollback;
