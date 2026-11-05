-- Rate limit & log aktivitas klien
begin;
create extension if not exists pgtap with schema extensions;
\ir ../helpers/helpers.psql
select plan(9);

select tests.create_user('owner@t.test', 'owner') as owner_id \gset
select tests.create_user('admin@t.test', 'admin') as admin_id \gset
select tests.create_user('baking@t.test', 'admin_baking') as baking_id \gset
select tests.create_user('m1@t.test') as m1_id \gset

select results_eq(
  $$ select private.hit_rate_limit('uji:628111', 3, interval '1 hour') from generate_series(1, 4) $$,
  $$ values (true), (true), (true), (false) $$,
  'Rate limit mengizinkan 3 percobaan lalu memblokir');
select ok(private.hit_rate_limit('uji:628222', 3, interval '1 hour'), 'Rate limit terpisah per kunci');

select tests.login_as(:'admin_id');
select lives_ok($$ select public.log_activity('ekspor_data', 'pesanan', '{"format":"xlsx"}') $$, 'Admin mencatat ekspor data');
select throws_ok($$ select public.log_activity('hapus_semua', 'pesanan') $$, '22023', null, 'Aksi log di luar daftar ditolak');
select throws_ok($$ select private.hit_rate_limit('x', 1, interval '1 minute') $$, '42501', null,
  'Pengguna tidak bisa memanggil rate limit langsung');

select tests.login_as(:'baking_id');
select throws_ok($$ select public.log_activity('ekspor_data', 'pesanan') $$, '42501', null, 'Admin Baking tidak bisa mengekspor');

select tests.login_as(:'m1_id');
select throws_ok($$ select public.log_activity('ekspor_data', 'pesanan') $$, '42501', null, 'Member tidak bisa mengekspor');

select tests.login_as(:'owner_id', 'aal2');
select results_eq(
  $$ select aksi, actor_role, meta ->> 'format' from public.audit_logs where aksi = 'pesanan.ekspor_data' $$,
  $$ values ('pesanan.ekspor_data', 'admin', 'xlsx') $$,
  'Ekspor data tercatat di log aktivitas');
select is((select count(*)::int from public.audit_logs where aksi = 'pesanan.ekspor_data'), 1, 'Hanya ekspor yang sah tercatat');

select * from finish();
rollback;
