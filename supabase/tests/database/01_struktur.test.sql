-- Struktur & pengerasan keamanan dasar
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

select is(
  (select count(*)::int from pg_tables
    where schemaname in ('public', 'private') and not rowsecurity),
  0, 'RLS aktif di semua tabel public & private');

select is(
  (select string_agg(table_name || ':' || privilege_type, ',' order by table_name, privilege_type)
     from information_schema.role_table_grants
    where grantee = 'anon' and table_schema in ('public', 'private')),
  'katalog_kategori:SELECT,katalog_produk:SELECT,konten_publik:SELECT,pengaturan_publik:SELECT',
  'Anon hanya boleh SELECT view publik (katalog, konten, pengaturan publik)');

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private') and p.prosecdef
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')),
  0, 'Semua fungsi SECURITY DEFINER punya search_path tetap');

select ok(not has_function_privilege('anon', 'public.set_user_role(uuid, public.app_role, text)', 'execute'),
  'Anon tidak bisa memanggil set_user_role');
select ok(not has_function_privilege('anon', 'private.hit_rate_limit(text, int, interval)', 'execute'),
  'Anon tidak bisa memanggil fungsi rate limit privat');
select ok(not has_function_privilege('authenticated', 'private.write_audit(text, text, text, jsonb, jsonb, text, jsonb)', 'execute'),
  'Pengguna tidak bisa menulis audit log langsung');

-- Normalisasi nomor HP
select is(public.normalize_phone('08123456789'), '628123456789', '08xx -> 628xx');
select is(public.normalize_phone('+62 812-3456-789'), '628123456789', '+62 dengan spasi/strip -> 628xx');
select is(public.normalize_phone('628123456789'), '628123456789', '628xx tetap');
select is(public.normalize_phone('8123456789'), '628123456789', '8xx -> 628xx');
select is(public.normalize_phone('0215550000'), null, 'Nomor non-seluler ditolak');
select is(public.normalize_phone('0812'), null, 'Nomor terlalu pendek ditolak');
select is(public.normalize_phone('halo'), null, 'Teks ditolak');

select * from finish();
rollback;
