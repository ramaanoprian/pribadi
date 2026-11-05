-- =====================================================================
-- FASE 1 — FONDASI
-- Peran (owner, admin, admin_baking, member), profil, undangan staf,
-- pelanggan, alamat, pengaturan aplikasi, audit log, rate limit.
--
-- Prinsip keamanan:
--  * RLS aktif di semua tabel; peran dibaca dari public.profiles.
--  * Owner hanya punya hak penuh bila sesi sudah 2FA (aal2).
--  * Hak tabel dicabut dari anon/authenticated lalu diberikan per kolom
--    seperlunya (lapis kedua di atas RLS).
--  * Fungsi sensitif: SECURITY DEFINER + search_path kosong.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Skema privat (tidak diekspos lewat API)
-- ---------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- Tipe
-- ---------------------------------------------------------------------
create type public.app_role as enum ('owner', 'admin', 'admin_baking', 'member');

-- ---------------------------------------------------------------------
-- Utilitas umum
-- ---------------------------------------------------------------------

-- Normalisasi nomor HP Indonesia ke format 628xxxxxxxx.
-- 08xx, +628xx, 628xx, 8xx  ->  628xx. Mengembalikan NULL bila tidak valid.
create or replace function public.normalize_phone(p_phone text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text;
begin
  if p_phone is null then
    return null;
  end if;
  v := regexp_replace(p_phone, '[^0-9]', '', 'g');
  if v = '' then
    return null;
  end if;
  if left(v, 2) = '62' then
    v := v;
  elsif left(v, 1) = '0' then
    v := '62' || substr(v, 2);
  elsif left(v, 1) = '8' then
    v := '62' || v;
  else
    return null;
  end if;
  -- 62 + 8 + 7..12 digit  => total 10..15 digit
  if v !~ '^628[0-9]{7,12}$' then
    return null;
  end if;
  return v;
end;
$$;

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Tabel: profiles
-- ---------------------------------------------------------------------
create table public.profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  role            public.app_role not null default 'member',
  nama            text not null default '' check (char_length(nama) <= 120),
  no_hp           text check (no_hp is null or no_hp ~ '^628[0-9]{7,12}$'),
  email           text,
  aktif           boolean not null default true,
  last_sign_in_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
comment on table public.profiles is 'Satu baris per akun login. Peran hanya bisa diubah lewat RPC set_user_role (Owner).';
create index profiles_role_idx on public.profiles (role);
create index profiles_email_idx on public.profiles (lower(email));

create or replace function private.profiles_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_norm text;
begin
  new.nama := btrim(coalesce(new.nama, ''));
  if new.no_hp is not null and btrim(new.no_hp) <> '' then
    v_norm := public.normalize_phone(new.no_hp);
    if v_norm is null then
      raise exception 'Nomor HP tidak valid' using errcode = '22023';
    end if;
    new.no_hp := v_norm;
  else
    new.no_hp := null;
  end if;
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create trigger profiles_before_write
before insert or update on public.profiles
for each row execute function private.profiles_before_write();

-- ---------------------------------------------------------------------
-- Helper peran (dipakai di semua kebijakan RLS)
-- ---------------------------------------------------------------------
create or replace function private.jwt_aal()
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1');
$$;

-- Peran efektif pengguna saat ini.
--  * NULL bila tidak login, akun nonaktif, atau Owner yang belum 2FA (aal2).
create or replace function private.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select case
           when p.role = 'owner' and private.jwt_aal() <> 'aal2' then null
           else p.role
         end
  from public.profiles p
  where p.id = auth.uid()
    and p.aktif;
$$;

create or replace function private.has_role(variadic p_roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.current_app_role() = any (p_roles), false);
$$;

create or replace function private.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_role('owner', 'admin', 'admin_baking');
$$;

-- Wajib dipanggil di awal RPC khusus peran tertentu.
create or replace function private.require_role(variadic p_roles public.app_role[])
returns public.app_role
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role public.app_role := private.current_app_role();
begin
  if v_role is null or not (v_role = any (p_roles)) then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  return v_role;
end;
$$;

-- ---------------------------------------------------------------------
-- Tabel: audit_logs (append-only)
-- ---------------------------------------------------------------------
create table public.audit_logs (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  actor_id    uuid,
  actor_role  text,
  actor_nama  text,
  aksi        text not null,
  entitas     text not null,
  entitas_id  text,
  data_lama   jsonb,
  data_baru   jsonb,
  alasan      text,
  meta        jsonb
);
comment on table public.audit_logs is 'Log aktivitas. Tidak bisa diubah/dihapus oleh siapa pun lewat aplikasi.';
create index audit_logs_created_at_idx on public.audit_logs (created_at desc);
create index audit_logs_entitas_idx on public.audit_logs (entitas, entitas_id);
create index audit_logs_actor_idx on public.audit_logs (actor_id);
create index audit_logs_aksi_idx on public.audit_logs (aksi);

create or replace function private.audit_logs_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Log aktivitas tidak dapat diubah atau dihapus' using errcode = '42501';
end;
$$;

create trigger audit_logs_no_update
before update or delete on public.audit_logs
for each row execute function private.audit_logs_immutable();

-- Tulis satu baris audit. Alasan bisa dikirim lewat GUC app.audit_reason
-- (di-set oleh RPC dengan set_config(..., true)).
create or replace function private.write_audit(
  p_aksi text,
  p_entitas text,
  p_entitas_id text,
  p_data_lama jsonb default null,
  p_data_baru jsonb default null,
  p_alasan text default null,
  p_meta jsonb default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_nama text;
begin
  if v_uid is not null then
    select p.role::text, p.nama into v_role, v_nama
    from public.profiles p where p.id = v_uid;
  end if;
  insert into public.audit_logs (actor_id, actor_role, actor_nama, aksi, entitas, entitas_id,
                                 data_lama, data_baru, alasan, meta)
  values (v_uid,
          coalesce(v_role, case when v_uid is null then 'sistem' end),
          coalesce(v_nama, case when v_uid is null then 'Sistem' end),
          p_aksi, p_entitas, p_entitas_id, p_data_lama, p_data_baru,
          coalesce(p_alasan, nullif(current_setting('app.audit_reason', true), '')),
          p_meta);
end;
$$;

-- Trigger audit generik.
--  TG_ARGV[0] = nama entitas untuk log (mis. 'akun')
--  TG_ARGV[1..] = kolom yang dipantau; UPDATE hanya dicatat bila salah satunya berubah.
create or replace function private.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entitas text := tg_argv[0];
  v_cols text[] := tg_argv[1:];
  v_old jsonb;
  v_new jsonb;
  v_old_sub jsonb := '{}'::jsonb;
  v_new_sub jsonb := '{}'::jsonb;
  v_col text;
  v_changed boolean := false;
  v_id text;
begin
  if tg_op in ('UPDATE', 'DELETE') then v_old := to_jsonb(old); end if;
  if tg_op in ('INSERT', 'UPDATE') then v_new := to_jsonb(new); end if;
  v_id := coalesce(v_new ->> 'id', v_old ->> 'id', v_new ->> 'key', v_old ->> 'key');

  if coalesce(array_length(v_cols, 1), 0) = 0 then
    v_old_sub := v_old;
    v_new_sub := v_new;
    v_changed := tg_op <> 'UPDATE' or v_old is distinct from v_new;
  else
    foreach v_col in array v_cols loop
      if v_old is not null then v_old_sub := v_old_sub || jsonb_build_object(v_col, v_old -> v_col); end if;
      if v_new is not null then v_new_sub := v_new_sub || jsonb_build_object(v_col, v_new -> v_col); end if;
      if tg_op <> 'UPDATE' or (v_old -> v_col) is distinct from (v_new -> v_col) then
        v_changed := true;
      end if;
    end loop;
    if tg_op = 'INSERT' then v_old_sub := null; end if;
    if tg_op = 'DELETE' then v_new_sub := null; end if;
  end if;

  if v_changed then
    perform private.write_audit(
      v_entitas || '.' || case tg_op when 'INSERT' then 'tambah' when 'UPDATE' then 'ubah' else 'hapus' end,
      v_entitas, v_id, v_old_sub, v_new_sub);
  end if;
  return coalesce(new, old);
end;
$$;

create trigger profiles_audit
after update on public.profiles
for each row execute function private.audit_row_change('akun', 'role', 'aktif');

-- ---------------------------------------------------------------------
-- Tabel: staff_invitations
-- ---------------------------------------------------------------------
create table public.staff_invitations (
  id           uuid primary key default gen_random_uuid(),
  email        text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role         public.app_role not null check (role in ('owner', 'admin', 'admin_baking')),
  nama         text not null default '' check (char_length(nama) <= 120),
  status       text not null default 'menunggu'
               check (status in ('menunggu', 'terkirim', 'dibatalkan', 'gagal')),
  catatan      text,
  invited_by   uuid references public.profiles (id) on delete set null,
  user_id      uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index staff_invitations_pending_email_uq
  on public.staff_invitations (email) where status = 'menunggu';

create trigger staff_invitations_touch
before update on public.staff_invitations
for each row execute function private.touch_updated_at();

create trigger staff_invitations_audit
after insert or update on public.staff_invitations
for each row execute function private.audit_row_change('undangan_staf', 'email', 'role', 'status');

-- ---------------------------------------------------------------------
-- Sinkronisasi auth.users -> profiles
-- ---------------------------------------------------------------------

-- Terapkan undangan staf. Hanya berlaku bila user dibuat lewat undangan
-- (invited_at terisi oleh server Auth). Pendaftaran publik tidak pernah
-- mengisi invited_at, sehingga tidak bisa menjadi staf.
create or replace function private.apply_staff_invitation(p_user_id uuid, p_email text, p_invited_at timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.staff_invitations;
begin
  if p_invited_at is null or p_email is null then
    return;
  end if;
  select * into v_inv
  from public.staff_invitations
  where email = lower(p_email) and status = 'menunggu'
  for update;
  if not found then
    return;
  end if;

  update public.profiles
     set role = v_inv.role,
         nama = case when nama = '' or nama = split_part(coalesce(email, ''), '@', 1)
                     then coalesce(nullif(v_inv.nama, ''), nama) else nama end
   where id = p_user_id;

  update public.staff_invitations
     set status = 'terkirim', user_id = p_user_id
   where id = v_inv.id;
end;
$$;

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  -- Peran dari metadata pengguna TIDAK dipercaya: selalu 'member'.
  insert into public.profiles (id, role, email, nama, no_hp, last_sign_in_at)
  values (
    new.id,
    'member',
    lower(new.email),
    left(coalesce(nullif(btrim(v_meta ->> 'nama'), ''), split_part(coalesce(new.email, ''), '@', 1)), 120),
    public.normalize_phone(v_meta ->> 'no_hp'),
    new.last_sign_in_at
  );
  perform private.apply_staff_invitation(new.id, new.email, new.invited_at);
  return new;
end;
$$;

create or replace function private.handle_updated_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email or new.last_sign_in_at is distinct from old.last_sign_in_at then
    update public.profiles
       set email = lower(new.email),
           last_sign_in_at = new.last_sign_in_at
     where id = new.id;
  end if;
  if new.invited_at is not null and old.invited_at is null then
    perform private.apply_staff_invitation(new.id, new.email, new.invited_at);
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_auth_user();

create trigger on_auth_user_updated
after update on auth.users
for each row execute function private.handle_updated_auth_user();

-- ---------------------------------------------------------------------
-- Tabel: customers (pelanggan member & tamu, digabung per nomor HP)
-- ---------------------------------------------------------------------
create table public.customers (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid unique references public.profiles (id) on delete set null,
  nama              text not null check (char_length(btrim(nama)) between 1 and 120),
  phone_normalized  text not null unique check (phone_normalized ~ '^628[0-9]{7,12}$'),
  is_vip            boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
comment on column public.customers.is_vip is 'Penanda VIP manual oleh Owner. Status VIP otomatis dihitung lewat VIEW analisis (Fase 7).';

create or replace function private.customers_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_norm text := public.normalize_phone(new.phone_normalized);
begin
  if v_norm is null then
    raise exception 'Nomor HP tidak valid' using errcode = '22023';
  end if;
  new.phone_normalized := v_norm;
  new.nama := btrim(new.nama);
  -- Penanda VIP termasuk analisis pelanggan: khusus Owner (atau proses server).
  if (tg_op = 'INSERT' and new.is_vip)
     or (tg_op = 'UPDATE' and new.is_vip is distinct from old.is_vip) then
    if auth.uid() is not null and not private.has_role('owner') then
      raise exception 'Hanya Owner yang dapat mengubah penanda VIP' using errcode = '42501';
    end if;
  end if;
  if tg_op = 'UPDATE' then new.updated_at := now(); end if;
  return new;
end;
$$;

create trigger customers_before_write
before insert or update on public.customers
for each row execute function private.customers_before_write();

create trigger customers_audit
after update on public.customers
for each row execute function private.audit_row_change('pelanggan', 'nama', 'phone_normalized', 'is_vip');

-- ---------------------------------------------------------------------
-- Tabel: addresses (alamat tersimpan member)
-- ---------------------------------------------------------------------
create table public.addresses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  label       text not null default 'Rumah' check (char_length(label) between 1 and 40),
  penerima    text not null check (char_length(btrim(penerima)) between 1 and 120),
  no_hp       text not null,
  alamat      text not null check (char_length(btrim(alamat)) between 5 and 500),
  catatan     text check (catatan is null or char_length(catatan) <= 300),
  is_default  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index addresses_user_idx on public.addresses (user_id);
create unique index addresses_one_default_uq on public.addresses (user_id) where is_default;

create or replace function private.addresses_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_norm text := public.normalize_phone(new.no_hp);
begin
  if v_norm is null then
    raise exception 'Nomor HP tidak valid' using errcode = '22023';
  end if;
  new.no_hp := v_norm;
  -- Alamat default baru menggantikan default lama.
  if new.is_default then
    update public.addresses set is_default = false
     where user_id = new.user_id and is_default and id <> new.id;
  end if;
  if tg_op = 'UPDATE' then new.updated_at := now(); end if;
  return new;
end;
$$;

create trigger addresses_before_write
before insert or update on public.addresses
for each row execute function private.addresses_before_write();

-- ---------------------------------------------------------------------
-- Tabel: app_settings
-- ---------------------------------------------------------------------
create table public.app_settings (
  key         text primary key check (key ~ '^[a-z0-9_.]+$'),
  value       jsonb not null,
  tipe        text not null check (tipe in ('teks', 'angka', 'boolean', 'pilihan')),
  opsi        jsonb not null default '{}'::jsonb,
  label       text not null,
  deskripsi   text,
  kategori    text not null default 'Umum',
  urutan      int not null default 0,
  is_public   boolean not null default false,
  updated_by  uuid references public.profiles (id) on delete set null,
  updated_at  timestamptz not null default now()
);
comment on table public.app_settings is 'Pengaturan yang bisa diubah Owner. Rahasia (token Fonnte dll.) TIDAK disimpan di sini.';

create or replace function private.app_settings_validate()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_num numeric;
begin
  case new.tipe
    when 'angka' then
      if jsonb_typeof(new.value) <> 'number' then
        raise exception 'Nilai "%" harus berupa angka', new.label using errcode = '22023';
      end if;
      v_num := (new.value #>> '{}')::numeric;
      if new.opsi ? 'min' and v_num < (new.opsi ->> 'min')::numeric then
        raise exception 'Nilai "%" minimal %', new.label, new.opsi ->> 'min' using errcode = '22023';
      end if;
      if new.opsi ? 'max' and v_num > (new.opsi ->> 'max')::numeric then
        raise exception 'Nilai "%" maksimal %', new.label, new.opsi ->> 'max' using errcode = '22023';
      end if;
      if coalesce((new.opsi ->> 'bulat')::boolean, false) and v_num <> trunc(v_num) then
        raise exception 'Nilai "%" harus bilangan bulat', new.label using errcode = '22023';
      end if;
    when 'boolean' then
      if jsonb_typeof(new.value) <> 'boolean' then
        raise exception 'Nilai "%" harus ya/tidak', new.label using errcode = '22023';
      end if;
    when 'teks' then
      if jsonb_typeof(new.value) <> 'string' then
        raise exception 'Nilai "%" harus berupa teks', new.label using errcode = '22023';
      end if;
      if char_length(new.value #>> '{}') > coalesce((new.opsi ->> 'maks_panjang')::int, 500) then
        raise exception 'Nilai "%" terlalu panjang', new.label using errcode = '22023';
      end if;
    when 'pilihan' then
      if not exists (
        select 1 from jsonb_array_elements(coalesce(new.opsi -> 'pilihan', '[]'::jsonb)) e
        where e -> 'nilai' = new.value
      ) then
        raise exception 'Nilai "%" tidak termasuk pilihan yang tersedia', new.label using errcode = '22023';
      end if;
  end case;
  if tg_op = 'UPDATE' then
    new.updated_at := now();
    new.updated_by := coalesce(auth.uid(), new.updated_by);
  end if;
  return new;
end;
$$;

create trigger app_settings_validate
before insert or update on public.app_settings
for each row execute function private.app_settings_validate();

create trigger app_settings_audit
after update on public.app_settings
for each row execute function private.audit_row_change('pengaturan', 'value');

-- Nilai default (dapat diubah Owner di halaman Pengaturan).
insert into public.app_settings (key, value, tipe, opsi, label, deskripsi, kategori, urutan, is_public) values
  ('toko.nama', '"GutVibes"', 'teks', '{"maks_panjang": 60}', 'Nama toko',
   'Ditampilkan di website dan pesan WhatsApp.', 'Toko', 10, true),
  ('toko.whatsapp', '""', 'teks', '{"maks_panjang": 20}', 'Nomor WhatsApp toko',
   'Dipakai untuk tombol "Konfirmasi via WhatsApp" dan kontak. Format 08xx / 628xx.', 'Toko', 20, true),
  ('toko.alamat', '""', 'teks', '{"maks_panjang": 300}', 'Alamat toko',
   'Ditampilkan di halaman Lokasi & Kontak.', 'Toko', 30, true),
  ('pesanan.gratis_ongkir_min', '0', 'angka', '{"min": 0, "bulat": true, "satuan": "Rp"}', 'Gratis ongkir mulai dari',
   'Subtotal minimal agar ongkir gratis. Isi 0 untuk menonaktifkan.', 'Pesanan', 10, true),
  ('produksi.mode_bahan_kurang', '"peringatan"', 'pilihan',
   '{"pilihan": [{"nilai": "peringatan", "label": "Peringatan, boleh lanjut"}, {"nilai": "blokir", "label": "Blokir input produksi"}]}',
   'Bila bahan kurang saat input produksi', null, 'Produksi', 10, false),
  ('pelanggan.hari_tidur', '60', 'angka', '{"min": 7, "max": 365, "bulat": true, "satuan": "hari"}', 'Pelanggan dianggap tidur setelah',
   'Jumlah hari sejak pesanan selesai terakhir.', 'Pelanggan', 10, false),
  ('pelanggan.ambang_vip', '10', 'angka', '{"min": 1, "max": 1000, "bulat": true, "satuan": "pesanan"}', 'Penanda VIP mulai dari',
   'Jumlah pesanan selesai agar pelanggan ditandai VIP.', 'Pelanggan', 20, false),
  ('loyalti.klaim_pesanan_tamu', 'true', 'boolean', '{}', 'Klaim stamp pesanan tamu',
   'Saat tamu mendaftar dengan nomor HP terverifikasi, pesanan selesai sebelumnya dihitung sebagai stamp.', 'Loyalti', 10, false),
  ('batas.pesanan_per_jam', '5', 'angka', '{"min": 1, "max": 100, "bulat": true, "satuan": "pesanan/jam"}', 'Batas pesanan per nomor/IP',
   'Mencegah spam pesanan.', 'Keamanan', 10, false),
  ('batas.lacak_per_15_menit', '10', 'angka', '{"min": 1, "max": 100, "bulat": true, "satuan": "percobaan"}', 'Batas percobaan lacak pesanan',
   'Per IP setiap 15 menit.', 'Keamanan', 20, false),
  ('batas.otp_per_jam', '3', 'angka', '{"min": 1, "max": 20, "bulat": true, "satuan": "permintaan/jam"}', 'Batas permintaan OTP',
   'Per nomor HP setiap jam.', 'Keamanan', 30, false);

-- Pembaca pengaturan untuk fungsi server.
create or replace function private.setting(p_key text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select value from public.app_settings where key = p_key;
$$;

-- ---------------------------------------------------------------------
-- Rate limit (jendela tetap) — dipakai pesanan, lacak pesanan, OTP
-- ---------------------------------------------------------------------
create table private.rate_limits (
  bucket        text not null,
  window_start  timestamptz not null,
  hits          int not null default 0,
  primary key (bucket, window_start)
);

-- Mengembalikan TRUE bila masih diizinkan (dan mencatat 1 percobaan).
create or replace function private.hit_rate_limit(p_bucket text, p_max int, p_window interval)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secs double precision := extract(epoch from p_window);
  v_start timestamptz := to_timestamp(floor(extract(epoch from clock_timestamp()) / v_secs) * v_secs);
  v_hits int;
begin
  insert into private.rate_limits as r (bucket, window_start, hits)
  values (p_bucket, v_start, 1)
  on conflict (bucket, window_start) do update set hits = r.hits + 1
  returning hits into v_hits;

  -- Bersihkan jendela lama sesekali.
  if random() < 0.02 then
    delete from private.rate_limits where window_start < clock_timestamp() - interval '2 days';
  end if;
  return v_hits <= p_max;
end;
$$;

-- IP klien dari header yang diteruskan PostgREST.
create or replace function private.client_ip()
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(
    nullif(btrim(split_part(
      coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json ->> 'x-forwarded-for', ',', 1)), ''),
    'unknown');
$$;

-- ---------------------------------------------------------------------
-- RPC publik (dipanggil dari aplikasi)
-- ---------------------------------------------------------------------

-- Owner: buat undangan staf (dipanggil Edge Function invite-staff, yang
-- kemudian mengirim email undangan lewat Auth Admin API).
create or replace function public.create_staff_invitation(p_email text, p_role public.app_role, p_nama text default '')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(p_email));
  v_id uuid;
begin
  perform private.require_role('owner');
  if p_role not in ('owner', 'admin', 'admin_baking') then
    raise exception 'Peran undangan tidak valid' using errcode = '22023';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Email tidak valid' using errcode = '22023';
  end if;
  if exists (select 1 from public.profiles where lower(email) = v_email) then
    raise exception 'Email sudah terdaftar. Ubah perannya dari daftar akun.' using errcode = '23505';
  end if;

  -- Undangan lama yang belum terkirim untuk email yang sama digantikan.
  update public.staff_invitations set status = 'dibatalkan'
   where email = v_email and status = 'menunggu';

  insert into public.staff_invitations (email, role, nama, invited_by)
  values (v_email, p_role, left(btrim(coalesce(p_nama, '')), 120), auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.cancel_staff_invitation(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_role('owner');
  update public.staff_invitations set status = 'dibatalkan'
   where id = p_id and status in ('menunggu', 'gagal');
  if not found then
    raise exception 'Undangan tidak ditemukan atau sudah terkirim' using errcode = 'P0002';
  end if;
end;
$$;

-- Owner: ubah peran akun.
create or replace function public.set_user_role(p_user_id uuid, p_role public.app_role, p_alasan text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target public.profiles;
begin
  perform private.require_role('owner');
  if p_user_id = auth.uid() then
    raise exception 'Anda tidak dapat mengubah peran akun sendiri' using errcode = '42501';
  end if;
  select * into v_target from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'Akun tidak ditemukan' using errcode = 'P0002';
  end if;
  if v_target.role = 'owner' and p_role <> 'owner' and v_target.aktif
     and (select count(*) from public.profiles where role = 'owner' and aktif) <= 1 then
    raise exception 'Harus ada minimal satu Owner aktif' using errcode = '42501';
  end if;
  perform set_config('app.audit_reason', coalesce(p_alasan, ''), true);
  update public.profiles set role = p_role where id = p_user_id;
  perform set_config('app.audit_reason', '', true);
end;
$$;

-- Owner: aktifkan / nonaktifkan akun.
create or replace function public.set_user_active(p_user_id uuid, p_aktif boolean, p_alasan text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target public.profiles;
begin
  perform private.require_role('owner');
  if p_user_id = auth.uid() then
    raise exception 'Anda tidak dapat menonaktifkan akun sendiri' using errcode = '42501';
  end if;
  select * into v_target from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'Akun tidak ditemukan' using errcode = 'P0002';
  end if;
  if not p_aktif and v_target.role = 'owner' and v_target.aktif
     and (select count(*) from public.profiles where role = 'owner' and aktif) <= 1 then
    raise exception 'Harus ada minimal satu Owner aktif' using errcode = '42501';
  end if;
  perform set_config('app.audit_reason', coalesce(p_alasan, ''), true);
  update public.profiles set aktif = p_aktif where id = p_user_id;
  perform set_config('app.audit_reason', '', true);
end;
$$;

-- Staf: catat aktivitas sisi klien (mis. ekspor data). Daftar aksi dibatasi.
create or replace function public.log_activity(p_aksi text, p_entitas text, p_meta jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_role('owner', 'admin');
  if p_aksi not in ('ekspor_data') then
    raise exception 'Aksi log tidak diizinkan' using errcode = '22023';
  end if;
  if p_entitas !~ '^[a-z_]{1,40}$' then
    raise exception 'Entitas tidak valid' using errcode = '22023';
  end if;
  perform private.write_audit(p_entitas || '.' || p_aksi, p_entitas, null, null, null, null, p_meta);
end;
$$;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.profiles          enable row level security;
alter table public.staff_invitations enable row level security;
alter table public.customers         enable row level security;
alter table public.addresses         enable row level security;
alter table public.app_settings      enable row level security;
alter table public.audit_logs        enable row level security;
alter table private.rate_limits      enable row level security;

-- profiles
create policy profiles_select_self_or_owner on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select private.has_role('owner')));
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- staff_invitations (tulis hanya lewat RPC)
create policy staff_invitations_select_owner on public.staff_invitations
  for select to authenticated
  using ((select private.has_role('owner')));

-- customers: Owner & Admin (kontak), member melihat dirinya sendiri
create policy customers_select on public.customers
  for select to authenticated
  using ((select private.has_role('owner', 'admin')) or user_id = (select auth.uid()));
create policy customers_insert_staff on public.customers
  for insert to authenticated
  with check ((select private.has_role('owner', 'admin')));
create policy customers_update_staff on public.customers
  for update to authenticated
  using ((select private.has_role('owner', 'admin')))
  with check ((select private.has_role('owner', 'admin')));

-- addresses: milik sendiri; Owner boleh melihat
create policy addresses_select on public.addresses
  for select to authenticated
  using (user_id = (select auth.uid()) or (select private.has_role('owner')));
create policy addresses_insert_self on public.addresses
  for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy addresses_update_self on public.addresses
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy addresses_delete_self on public.addresses
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- app_settings: publik membaca yang is_public; staf membaca semua; Owner mengubah
create policy app_settings_select on public.app_settings
  for select to anon, authenticated
  using (is_public or (select private.is_staff()));
create policy app_settings_update_owner on public.app_settings
  for update to authenticated
  using ((select private.has_role('owner')))
  with check ((select private.has_role('owner')));

-- audit_logs: Owner saja yang membaca; tulis hanya lewat fungsi server
create policy audit_logs_select_owner on public.audit_logs
  for select to authenticated
  using ((select private.has_role('owner')));

-- rate_limits: tanpa kebijakan = tidak bisa diakses klien.

-- ---------------------------------------------------------------------
-- Hak akses (lapis kedua di atas RLS)
-- ---------------------------------------------------------------------
revoke all on public.profiles, public.staff_invitations, public.customers, public.addresses,
              public.app_settings, public.audit_logs from anon, authenticated;
revoke all on private.rate_limits from anon, authenticated;

grant select on public.profiles to authenticated;
grant update (nama, no_hp) on public.profiles to authenticated;

grant select on public.staff_invitations to authenticated;

grant select on public.customers to authenticated;
grant insert (nama, phone_normalized, is_vip) on public.customers to authenticated;
grant update (nama, phone_normalized, is_vip) on public.customers to authenticated;

grant select, delete on public.addresses to authenticated;
grant insert (label, penerima, no_hp, alamat, catatan, is_default) on public.addresses to authenticated;
grant update (label, penerima, no_hp, alamat, catatan, is_default) on public.addresses to authenticated;

grant select on public.app_settings to anon, authenticated;
grant update (value) on public.app_settings to authenticated;

grant select on public.audit_logs to authenticated;

-- Fungsi: cabut EXECUTE default dari PUBLIC/anon, beri seperlunya.
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function
  private.jwt_aal(),
  private.current_app_role(),
  private.has_role(public.app_role[]),
  private.is_staff()
to anon, authenticated;
-- Dipanggil oleh trigger yang berjalan sebagai pengguna (SECURITY INVOKER).
grant execute on function
  private.touch_updated_at(),
  private.profiles_before_write(),
  private.customers_before_write(),
  private.addresses_before_write(),
  private.app_settings_validate(),
  private.audit_logs_immutable(),
  private.audit_row_change()
to authenticated;

revoke execute on function
  public.create_staff_invitation(text, public.app_role, text),
  public.cancel_staff_invitation(uuid),
  public.set_user_role(uuid, public.app_role, text),
  public.set_user_active(uuid, boolean, text),
  public.log_activity(text, text, jsonb)
from public, anon;
grant execute on function
  public.create_staff_invitation(text, public.app_role, text),
  public.cancel_staff_invitation(uuid),
  public.set_user_role(uuid, public.app_role, text),
  public.set_user_active(uuid, boolean, text),
  public.log_activity(text, text, jsonb)
to authenticated;
grant execute on function public.normalize_phone(text) to anon, authenticated;

-- Server Auth (supabase_auth_admin) memicu trigger di auth.users.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant usage on schema private to supabase_auth_admin;
    grant execute on function private.handle_new_auth_user(), private.handle_updated_auth_user()
      to supabase_auth_admin;
  end if;
end;
$$;
