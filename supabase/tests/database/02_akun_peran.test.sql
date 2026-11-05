-- Akun, peran, undangan staf, akses Owner
begin;
create extension if not exists pgtap with schema extensions;
\ir ../helpers/helpers.psql
select plan(25);

-- Data
select tests.create_user('owner@t.test', 'owner', 'Owner Uji') as owner_id \gset
select tests.create_user('admin@t.test', 'admin') as admin_id \gset
select tests.create_user('baking@t.test', 'admin_baking') as baking_id \gset
select tests.create_user('m1@t.test', 'member', 'Member Satu', '0812-1111-2222') as m1_id \gset

-- 1. Pendaftaran membuat profil member + HP dinormalisasi
select results_eq(
  format('select role::text, nama, no_hp from public.profiles where id = %L', :'m1_id'),
  $$ values ('member', 'Member Satu', '6281211112222') $$,
  'Pendaftaran publik membuat profil member dengan HP ternormalisasi');

-- 2. Metadata "role" dari klien diabaikan
insert into auth.users (id, email, raw_user_meta_data)
values ('11111111-1111-4111-8111-111111111111', 'licik@t.test', '{"role":"owner","nama":"Licik"}');
select is((select role::text from public.profiles where id = '11111111-1111-4111-8111-111111111111'),
  'member', 'Metadata role dari pendaftar diabaikan (tetap member)');

select count(*)::int as total_profil from public.profiles \gset

-- 3. Owner langsung punya hak penuh tanpa 2FA (sesi aal1)
select tests.login_as(:'owner_id', 'aal1');
select lives_ok($$ select public.create_staff_invitation('Kasir@T.test', 'admin', 'Kasir Baru') $$,
  'Owner tanpa 2FA (aal1) bisa membuat undangan staf');
select is((select count(*)::int from public.profiles), :total_profil, 'Owner tanpa 2FA melihat semua profil');
select throws_ok($$ select public.create_staff_invitation('m1@t.test', 'admin') $$,
  '23505', null, 'Undangan untuk email terdaftar ditolak');

-- 4. Owner yang kebetulan memakai 2FA (aal2) tetap diterima
select tests.login_as(:'owner_id', 'aal2');
select is((select count(*)::int from public.profiles), :total_profil, 'Owner dengan sesi aal2 tetap diterima');
select tests.logout();

-- 5. Pendaftaran publik dengan email yang sedang diundang TIDAK jadi staf
insert into auth.users (id, email) values ('22222222-2222-4222-8222-222222222222', 'kasir@t.test');
select is((select role::text from public.profiles where id = '22222222-2222-4222-8222-222222222222'),
  'member', 'Daftar publik dengan email undangan tetap member (tanpa invited_at)');
select is((select status from public.staff_invitations where email = 'kasir@t.test'),
  'menunggu', 'Undangan tetap menunggu');
delete from auth.users where id = '22222222-2222-4222-8222-222222222222';

-- 6. Alur undangan Auth: user dibuat lalu invited_at di-set -> peran staf
insert into auth.users (id, email) values ('33333333-3333-4333-8333-333333333333', 'kasir@t.test');
update auth.users set invited_at = now() where id = '33333333-3333-4333-8333-333333333333';
select results_eq(
  $$ select role::text, nama from public.profiles where id = '33333333-3333-4333-8333-333333333333' $$,
  $$ values ('admin', 'Kasir Baru') $$,
  'User dari undangan mendapat peran & nama sesuai undangan');
select is((select status from public.staff_invitations where email = 'kasir@t.test'),
  'terkirim', 'Status undangan menjadi terkirim');

-- 7. Admin tidak bisa mengundang / mengubah peran
select tests.login_as(:'admin_id');
select throws_ok($$ select public.create_staff_invitation('x@t.test', 'admin') $$,
  '42501', null, 'Admin tidak bisa mengundang staf');
select throws_ok(format('select public.set_user_role(%L, %L)', :'m1_id', 'owner'),
  '42501', null, 'Admin tidak bisa mengubah peran');
select is((select count(*)::int from public.profiles), 1, 'Admin hanya melihat profilnya sendiri');
select is((select count(*)::int from public.staff_invitations), 0, 'Admin tidak melihat undangan staf');

-- 8. Member mengubah profil sendiri
select tests.login_as(:'m1_id');
select throws_ok(format('update public.profiles set role = %L where id = %L', 'owner', :'m1_id'),
  '42501', null, 'Member tidak bisa mengubah perannya sendiri');
select throws_ok(format('update public.profiles set aktif = false where id = %L', :'m1_id'),
  '42501', null, 'Member tidak bisa mengubah status aktif');
select lives_ok(format('update public.profiles set nama = %L, no_hp = %L where id = %L', 'Member Baru', '+62 813 9999 0000', :'m1_id'),
  'Member bisa mengubah nama & nomor HP');
select is((select no_hp from public.profiles where id = :'m1_id'), '6281399990000', 'Nomor HP tersimpan ternormalisasi');
select throws_ok(format('update public.profiles set no_hp = %L where id = %L', '12345', :'m1_id'),
  '22023', null, 'Nomor HP tidak valid ditolak');
select is((select count(*)::int from public.profiles), 1, 'Member hanya melihat profilnya sendiri');

-- 9. Owner mengubah peran + audit
select tests.login_as(:'owner_id', 'aal2');
select lives_ok(format('select public.set_user_role(%L, %L, %L)', :'admin_id', 'admin_baking', 'Pindah ke dapur'),
  'Owner bisa mengubah peran');
select throws_ok(format('select public.set_user_role(%L, %L)', :'owner_id', 'admin'),
  '42501', null, 'Owner tidak bisa mengubah peran sendiri');
select results_eq(
  format($q$ select aksi, actor_role, data_lama ->> 'role', data_baru ->> 'role', alasan
              from public.audit_logs where entitas = 'akun' and entitas_id = %L and actor_id = %L $q$, :'admin_id', :'owner_id'),
  $$ values ('akun.ubah', 'owner', 'admin', 'admin_baking', 'Pindah ke dapur') $$,
  'Perubahan peran tercatat di audit log lengkap dengan alasan');

-- 10. Akun nonaktif kehilangan akses
select lives_ok(format('select public.set_user_active(%L, false, %L)', :'baking_id', 'Resign'), 'Owner menonaktifkan akun');
select tests.login_as(:'baking_id');
select is((select count(*)::int from public.app_settings where not is_public), 0,
  'Akun nonaktif tidak lagi melihat pengaturan internal');

select * from finish();
rollback;
