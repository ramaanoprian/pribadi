-- =====================================================================
-- FASE 5 — LOYALTI
-- Stamp (1 pesanan selesai = 1 stamp, khusus member), kartu penuh ->
-- hadiah terbuka -> kartu baru, lencana per jumlah pesanan, hadiah dipakai
-- di pesanan berikutnya (diverifikasi Admin), OTP WhatsApp untuk verifikasi
-- nomor, klaim pesanan tamu lama sebagai stamp.
--
-- Stamp hanya diubah oleh fungsi server. Satu pesanan maksimal satu stamp
-- (UNIQUE order_id).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Aturan & definisi
-- ---------------------------------------------------------------------
create table public.rewards (
  id           uuid primary key default gen_random_uuid(),
  nama         text not null check (char_length(btrim(nama)) between 1 and 80),
  jenis        text not null check (jenis in ('diskon_nominal', 'diskon_persen', 'produk_gratis', 'gratis_ongkir')),
  nilai        numeric(14, 2) not null default 0 check (nilai >= 0),
  maks_diskon  bigint check (maks_diskon is null or maks_diskon > 0),
  product_id   uuid references public.products (id) on delete set null,
  updated_at   timestamptz not null default now(),
  check (jenis <> 'diskon_persen' or (nilai > 0 and nilai <= 100)),
  check (jenis <> 'diskon_nominal' or nilai > 0),
  check (jenis <> 'produk_gratis' or product_id is not null)
);

create table public.stamp_rules (
  id                     int primary key default 1 check (id = 1),
  aktif                  boolean not null default true,
  stamps_per_reward      int not null default 10 check (stamps_per_reward between 2 and 50),
  min_belanja_per_stamp  bigint not null default 0 check (min_belanja_per_stamp >= 0),
  reward_id              uuid not null references public.rewards (id),
  masa_berlaku_hari      int not null default 180 check (masa_berlaku_hari between 7 and 730),
  updated_by             uuid references public.profiles (id) on delete set null,
  updated_at             timestamptz not null default now()
);

create table public.badges (
  id         uuid primary key default gen_random_uuid(),
  kode       text not null unique check (kode ~ '^[a-z0-9_]+$'),
  nama       text not null check (char_length(btrim(nama)) between 1 and 60),
  deskripsi  text not null default '',
  ambang     int not null unique check (ambang between 1 and 1000),
  ikon       text not null default 'Award',
  aktif      boolean not null default true
);

with r as (
  insert into public.rewards (nama, jenis, nilai, maks_diskon)
  values ('Diskon Rp25.000', 'diskon_nominal', 25000, null)
  returning id
)
insert into public.stamp_rules (id, reward_id) select 1, id from r;

insert into public.badges (kode, nama, deskripsi, ambang, ikon) values
  ('pertama', 'Gigitan Pertama', 'Menyelesaikan pesanan pertama', 1, 'Cookie'),
  ('setia', 'Pelanggan Setia', '5 pesanan selesai', 5, 'Heart'),
  ('sahabat', 'Sahabat GutVibes', '10 pesanan selesai', 10, 'Star'),
  ('legenda', 'Legenda Dapur', '25 pesanan selesai', 25, 'Crown');

create trigger stamp_rules_audit after update on public.stamp_rules
for each row execute function private.audit_row_change('aturan_stamp');
create trigger rewards_audit after update on public.rewards
for each row execute function private.audit_row_change('hadiah');
create trigger badges_audit after insert or update or delete on public.badges
for each row execute function private.audit_row_change('lencana');

create or replace function private.stamp_rules_before_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.id := 1;
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;
create trigger stamp_rules_before_update before update on public.stamp_rules
for each row execute function private.stamp_rules_before_update();
create trigger rewards_touch before update on public.rewards
for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------
-- Data per pelanggan
-- ---------------------------------------------------------------------
create table public.stamps (
  id           bigint generated always as identity primary key,
  customer_id  uuid not null references public.customers (id) on delete cascade,
  order_id     uuid references public.orders (id) on delete set null,
  tipe         text not null check (tipe in ('earn', 'adjust', 'kartu_penuh')),
  qty          int not null check (qty <> 0),
  alasan       text,
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now()
);
-- Satu pesanan = maksimal satu stamp (mencegah stamp ganda).
create unique index stamps_order_uq on public.stamps (order_id) where order_id is not null;
create index stamps_customer_idx on public.stamps (customer_id, created_at desc);

create table public.customer_badges (
  customer_id  uuid not null references public.customers (id) on delete cascade,
  badge_id     uuid not null references public.badges (id) on delete cascade,
  earned_at    timestamptz not null default now(),
  primary key (customer_id, badge_id)
);

create table public.reward_redemptions (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references public.customers (id) on delete cascade,
  reward_id    uuid references public.rewards (id) on delete set null,
  kode         text not null unique,
  nama         text not null,
  jenis        text not null,
  nilai        numeric(14, 2) not null default 0,
  maks_diskon  bigint,
  product_id   uuid references public.products (id) on delete set null,
  status       text not null default 'tersedia' check (status in ('tersedia', 'dipakai', 'kedaluwarsa', 'dibatalkan')),
  expires_at   timestamptz not null,
  order_id     uuid references public.orders (id) on delete set null,
  used_at      timestamptz,
  verified_by  uuid references public.profiles (id) on delete set null,
  verified_at  timestamptz,
  catatan      text,
  created_at   timestamptz not null default now()
);
create index reward_redemptions_customer_idx on public.reward_redemptions (customer_id, created_at desc);
create index reward_redemptions_status_idx on public.reward_redemptions (status, expires_at);
create trigger reward_redemptions_audit after update on public.reward_redemptions
for each row execute function private.audit_row_change('hadiah_member', 'status', 'verified_at');

alter table public.orders
  add column reward_redemption_id uuid references public.reward_redemptions (id) on delete set null,
  add column reward_diskon bigint not null default 0 check (reward_diskon >= 0),
  add column reward_gratis_ongkir boolean not null default false,
  add column reward_verified_at timestamptz,
  add column reward_verified_by uuid references public.profiles (id) on delete set null;

-- Verifikasi nomor HP (OTP via WhatsApp)
alter table public.profiles add column phone_verified_at timestamptz;

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
    -- Nomor berubah tanpa verifikasi baru -> status verifikasi dicabut.
    if new.no_hp is distinct from old.no_hp and new.phone_verified_at is not distinct from old.phone_verified_at then
      new.phone_verified_at := null;
    end if;
  end if;
  return new;
end;
$$;

create table public.phone_verifications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  phone        text not null,
  code_hash    text not null,
  attempts     int not null default 0,
  expires_at   timestamptz not null,
  verified_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index phone_verifications_user_idx on public.phone_verifications (user_id, created_at desc);

insert into public.app_settings (key, value, tipe, opsi, label, deskripsi, kategori, urutan, is_public) values
  ('loyalti.otp_berlaku_menit', '10', 'angka', '{"min": 3, "max": 60, "bulat": true, "satuan": "menit"}', 'Kode OTP berlaku',
   null, 'Loyalti', 20, false);

-- ---------------------------------------------------------------------
-- Template WhatsApp loyalti
-- ---------------------------------------------------------------------
create or replace function private.wa_allowed_vars()
returns text[] language sql immutable set search_path = '' as $$
  select array['nama', 'toko', 'kode', 'item', 'total', 'jadwal', 'metode', 'tautan_lacak', 'kurir', 'alasan',
               'stamp', 'target_stamp', 'hadiah', 'kode_hadiah', 'berlaku_hingga'];
$$;

insert into public.whatsapp_templates (tahap, judul, urutan, isi) values
('stamp_bertambah', 'Stamp bertambah (member)', 60,
$t$Yay {nama}! Pesanan *{kode}* menambah 1 stamp di kartu {toko} kamu. ⭐
Stamp: {stamp}/{target_stamp}$t$),
('hadiah_terbuka', 'Hadiah terbuka (member)', 70,
$t$Selamat {nama}! 🎁 Kartu stamp kamu penuh dan hadiah terbuka:
*{hadiah}*
Kode hadiah: {kode_hadiah}
Berlaku hingga {berlaku_hingga}. Pakai di pesanan berikutnya ya!$t$);

-- Kirim pesan loyalti ke member (tanpa data sensitif).
create or replace function private.notify_member(p_customer_id uuid, p_order_id uuid, p_tahap text, p_extra jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_tpl public.whatsapp_templates;
  v_phone text;
  v_nama text;
  v_vars jsonb;
begin
  if not coalesce((private.setting('whatsapp.aktif') #>> '{}')::boolean, true) then
    return;
  end if;
  select * into v_tpl from public.whatsapp_templates where tahap = p_tahap and aktif;
  if not found then return; end if;
  if p_order_id is not null then
    select o.no_hp, o.nama_pemesan into v_phone, v_nama from public.orders o where o.id = p_order_id;
    v_vars := private.order_template_vars(p_order_id);
  end if;
  select coalesce(p.no_hp, v_phone), coalesce(nullif(p.nama, ''), v_nama, c.nama)
    into v_phone, v_nama
    from public.customers c left join public.profiles p on p.id = c.user_id
   where c.id = p_customer_id;
  if v_phone is null then return; end if;
  v_vars := coalesce(v_vars, '{}'::jsonb)
            || jsonb_build_object('nama', v_nama, 'toko', coalesce(private.setting('toko.nama') #>> '{}', 'GutVibes'))
            || coalesce(p_extra, '{}'::jsonb);
  insert into public.whatsapp_messages (order_id, customer_id, tahap, to_phone, body)
  values (case when p_tahap = 'stamp_bertambah' then p_order_id end, p_customer_id, p_tahap, v_phone,
          private.render_template(v_tpl.isi, v_vars))
  on conflict (order_id, tahap) where order_id is not null do nothing;
exception when others then
  raise warning 'notify_member(%): %', p_tahap, sqlerrm;
end;
$$;

-- ---------------------------------------------------------------------
-- Inti loyalti
-- ---------------------------------------------------------------------
create or replace function private.stamp_balance(p_customer_id uuid)
returns int language sql stable security definer set search_path = '' as $$
  select coalesce(sum(qty), 0)::int from public.stamps where customer_id = p_customer_id;
$$;

create or replace function private.reward_label(p_jenis text, p_nilai numeric, p_product_id uuid, p_maks bigint)
returns text language sql stable security definer set search_path = '' as $$
  select case p_jenis
    when 'diskon_nominal' then 'Diskon ' || private.rupiah(p_nilai::bigint)
    when 'diskon_persen' then 'Diskon ' || trim(to_char(p_nilai, 'FM990.##')) || '%'
                               || coalesce(' (maks. ' || private.rupiah(p_maks) || ')', '')
    when 'produk_gratis' then 'Gratis 1 ' || coalesce((select nama from public.products where id = p_product_id), 'produk')
    when 'gratis_ongkir' then 'Gratis ongkir'
  end;
$$;

-- Kartu penuh -> buat hadiah, kurangi saldo stamp (kartu baru).
create or replace function private.process_full_cards(p_customer_id uuid, p_order_id uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_rules public.stamp_rules;
  v_reward public.rewards;
  v_kode text;
  v_n int := 0;
  v_red public.reward_redemptions;
begin
  select * into v_rules from public.stamp_rules where id = 1;
  select * into v_reward from public.rewards where id = v_rules.reward_id;
  while private.stamp_balance(p_customer_id) >= v_rules.stamps_per_reward loop
    insert into public.stamps (customer_id, tipe, qty, alasan)
    values (p_customer_id, 'kartu_penuh', -v_rules.stamps_per_reward, 'Kartu penuh ditukar hadiah');
    loop
      v_kode := 'HD-' || private.random_code(6);
      exit when not exists (select 1 from public.reward_redemptions where kode = v_kode);
    end loop;
    insert into public.reward_redemptions (customer_id, reward_id, kode, nama, jenis, nilai, maks_diskon, product_id, expires_at)
    values (p_customer_id, v_reward.id, v_kode,
            private.reward_label(v_reward.jenis, v_reward.nilai, v_reward.product_id, v_reward.maks_diskon),
            v_reward.jenis, v_reward.nilai, v_reward.maks_diskon, v_reward.product_id,
            now() + make_interval(days => v_rules.masa_berlaku_hari))
    returning * into v_red;
    perform private.notify_member(p_customer_id, p_order_id, 'hadiah_terbuka', jsonb_build_object(
      'hadiah', v_red.nama, 'kode_hadiah', v_red.kode,
      'berlaku_hingga', to_char(v_red.expires_at at time zone 'Asia/Jakarta', 'DD-MM-YYYY')));
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

-- Lencana berdasarkan jumlah pesanan selesai milik member.
create or replace function private.refresh_badges(p_customer_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
  v_count int;
begin
  select user_id into v_user from public.customers where id = p_customer_id;
  select count(*) into v_count from public.orders
   where status = 'selesai' and (user_id = v_user or (v_user is null and customer_id = p_customer_id));
  insert into public.customer_badges (customer_id, badge_id)
  select p_customer_id, b.id from public.badges b
   where b.aktif and b.ambang <= v_count
  on conflict do nothing;
end;
$$;

-- Pelanggan (kartu stamp) milik member.
create or replace function private.member_customer(p_user_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.customers where user_id = p_user_id;
$$;

-- Beri stamp untuk pesanan selesai (idempoten lewat UNIQUE order_id).
create or replace function private.award_stamp(p_order_id uuid, p_alasan text default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_order public.orders;
  v_rules public.stamp_rules;
  v_customer uuid;
  v_inserted int;
begin
  select * into v_order from public.orders where id = p_order_id;
  if not found or v_order.status <> 'selesai' or v_order.user_id is null then
    return false;
  end if;
  select * into v_rules from public.stamp_rules where id = 1;
  if not v_rules.aktif then return false; end if;
  if v_rules.min_belanja_per_stamp > 0 and (v_order.subtotal - v_order.diskon) < v_rules.min_belanja_per_stamp then
    return false;
  end if;
  v_customer := coalesce(private.member_customer(v_order.user_id), v_order.customer_id);
  -- Serialisasi per pelanggan agar kartu penuh tidak diproses ganda.
  perform 1 from public.customers where id = v_customer for update;
  insert into public.stamps (customer_id, order_id, tipe, qty, alasan)
  values (v_customer, p_order_id, 'earn', 1, p_alasan)
  on conflict (order_id) where order_id is not null do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then return false; end if;

  perform private.refresh_badges(v_customer);
  perform private.notify_member(v_customer, p_order_id, 'stamp_bertambah', jsonb_build_object(
    'stamp', least(private.stamp_balance(v_customer), v_rules.stamps_per_reward),
    'target_stamp', v_rules.stamps_per_reward));
  perform private.process_full_cards(v_customer, p_order_id);
  return true;
end;
$$;

-- Diskon dari hadiah member untuk subtotal tertentu.
create or replace function private.reward_discount(p_red public.reward_redemptions, p_subtotal bigint, p_lines jsonb)
returns bigint language plpgsql stable security definer set search_path = '' as $$
declare
  v bigint := 0;
  v_harga bigint;
begin
  case p_red.jenis
    when 'diskon_nominal' then v := floor(p_red.nilai);
    when 'diskon_persen' then
      v := floor(p_subtotal * p_red.nilai / 100);
      if p_red.maks_diskon is not null then v := least(v, p_red.maks_diskon); end if;
    when 'produk_gratis' then
      select (e ->> 'harga')::bigint into v_harga from jsonb_array_elements(p_lines) e
       where (e ->> 'product_id')::uuid = p_red.product_id;
      if v_harga is null then
        raise exception 'Tambahkan "%" ke keranjang untuk memakai hadiah ini', p_red.nama using errcode = '22023';
      end if;
      v := v_harga;
    else v := 0;
  end case;
  return least(v, p_subtotal);
end;
$$;

-- ---------------------------------------------------------------------
-- create_order (versi Fase 5: + hadiah member)
-- ---------------------------------------------------------------------
drop function public.create_order(text, text, public.fulfillment, timestamptz, jsonb, text, text, text, boolean);

create or replace function public.create_order(
  p_nama text,
  p_no_hp text,
  p_fulfillment public.fulfillment,
  p_jadwal timestamptz,
  p_items jsonb,
  p_alamat text default null,
  p_catatan text default null,
  p_kode_promo text default null,
  p_persetujuan_wa boolean default true,
  p_kode_hadiah text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_role public.app_role := private.current_app_role();
  v_phone text := public.normalize_phone(p_no_hp);
  v_nama text := btrim(coalesce(p_nama, ''));
  v_alamat text := nullif(btrim(coalesce(p_alamat, '')), '');
  v_catatan text := nullif(btrim(coalesce(p_catatan, '')), '');
  v_item record;
  v_lines int;
  v_subtotal bigint := 0;
  v_diskon bigint := 0;
  v_promo public.promos;
  v_red public.reward_redemptions;
  v_reward_diskon bigint := 0;
  v_reward_ongkir boolean := false;
  v_threshold bigint;
  v_gratis boolean := false;
  v_customer public.customers;
  v_order_id uuid;
  v_kode text;
  v_try int := 0;
begin
  if char_length(v_nama) < 2 or char_length(v_nama) > 120 then
    raise exception 'Nama wajib diisi (2–120 karakter)' using errcode = '22023';
  end if;
  if v_phone is null then
    raise exception 'Nomor HP tidak valid' using errcode = '22023';
  end if;
  if p_fulfillment is null then
    raise exception 'Pilih ambil sendiri atau diantar' using errcode = '22023';
  end if;
  if p_jadwal is null or p_jadwal < now() + interval '30 minutes' or p_jadwal > now() + interval '90 days' then
    raise exception 'Jadwal harus antara 30 menit dari sekarang hingga 90 hari ke depan' using errcode = '22023';
  end if;
  if p_fulfillment = 'antar' and (v_alamat is null or char_length(v_alamat) < 10) then
    raise exception 'Alamat pengantaran wajib diisi lengkap' using errcode = '22023';
  end if;
  if v_alamat is not null and char_length(v_alamat) > 500 then
    raise exception 'Alamat terlalu panjang' using errcode = '22023';
  end if;
  if v_catatan is not null and char_length(v_catatan) > 500 then
    raise exception 'Catatan terlalu panjang' using errcode = '22023';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Keranjang kosong' using errcode = '22023';
  end if;
  v_lines := jsonb_array_length(p_items);
  if v_lines = 0 then
    raise exception 'Keranjang kosong' using errcode = '22023';
  end if;
  if v_lines > 30 then
    raise exception 'Terlalu banyak jenis produk dalam satu pesanan' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_kode_promo, '')), '') is not null and nullif(btrim(coalesce(p_kode_hadiah, '')), '') is not null then
    raise exception 'Promo dan hadiah tidak bisa dipakai bersamaan' using errcode = '22023';
  end if;

  if not private.hit_rate_limit('order:hp:' || v_phone,
           coalesce((private.setting('batas.pesanan_per_jam') #>> '{}')::int, 5), interval '1 hour')
     or not private.hit_rate_limit('order:ip:' || private.client_ip(),
           coalesce((private.setting('batas.pesanan_per_jam_ip') #>> '{}')::int, 20), interval '1 hour') then
    raise exception 'Terlalu banyak pesanan dalam waktu singkat. Coba lagi nanti atau hubungi kami via WhatsApp.' using errcode = '54000';
  end if;

  if to_regclass('pg_temp._order_lines') is null then
    create temporary table _order_lines (
      product_id uuid primary key, qty int, nama text, satuan text, sale_mode public.sale_mode, harga bigint, cost numeric
    ) on commit drop;
  end if;
  truncate pg_temp._order_lines;

  for v_item in
    select (e ->> 'product_id')::uuid as product_id, sum((e ->> 'qty')::int) as qty
    from jsonb_array_elements(p_items) e
    group by 1
  loop
    if v_item.product_id is null or v_item.qty is null or v_item.qty < 1 or v_item.qty > 999 then
      raise exception 'Jumlah produk tidak valid' using errcode = '22023';
    end if;
    insert into pg_temp._order_lines
    select p.id, v_item.qty, p.nama, p.satuan, p.sale_mode, p.harga, p.cost_per_unit
    from public.products p
    left join public.categories c on c.id = p.category_id
    where p.id = v_item.product_id and p.aktif and (c.id is null or c.aktif);
    if not found then
      raise exception 'Ada produk yang sudah tidak tersedia. Muat ulang keranjang Anda.' using errcode = '22023';
    end if;
  end loop;

  select l.nama, p.stok into v_item
  from pg_temp._order_lines l join public.products p on p.id = l.product_id
  where l.sale_mode = 'ready_stock' and p.stok < l.qty
  limit 1;
  if found then
    raise exception 'Stok "%" tinggal %', v_item.nama, v_item.stok using errcode = '23514';
  end if;

  select sum(harga * qty) into v_subtotal from pg_temp._order_lines;

  if nullif(btrim(coalesce(p_kode_promo, '')), '') is not null then
    select * into v_promo from public.promos where kode = upper(btrim(p_kode_promo)) for update;
    if not found then
      raise exception 'Kode promo tidak ditemukan' using errcode = '22023';
    end if;
    v_diskon := private.promo_discount(v_promo, v_subtotal);
  end if;

  -- Hadiah member (stamp)
  if nullif(btrim(coalesce(p_kode_hadiah, '')), '') is not null then
    if v_role is distinct from 'member' then
      raise exception 'Hadiah hanya bisa dipakai oleh member yang masuk' using errcode = '42501';
    end if;
    select r.* into v_red from public.reward_redemptions r
     where r.kode = upper(btrim(p_kode_hadiah)) and r.customer_id = private.member_customer(v_uid)
     for update;
    if not found then
      raise exception 'Kode hadiah tidak ditemukan di akun Anda' using errcode = '22023';
    end if;
    if v_red.status <> 'tersedia' or v_red.expires_at < now() then
      raise exception 'Hadiah sudah dipakai atau kedaluwarsa' using errcode = '22023';
    end if;
    if v_red.jenis = 'gratis_ongkir' then
      if p_fulfillment <> 'antar' then
        raise exception 'Hadiah gratis ongkir hanya untuk pesanan diantar' using errcode = '22023';
      end if;
      v_reward_ongkir := true;
    else
      v_reward_diskon := private.reward_discount(v_red, v_subtotal,
        (select jsonb_agg(jsonb_build_object('product_id', product_id, 'harga', harga)) from pg_temp._order_lines));
    end if;
    v_diskon := v_diskon + v_reward_diskon;
  end if;

  v_threshold := coalesce((private.setting('pesanan.gratis_ongkir_min') #>> '{}')::bigint, 0);
  v_gratis := v_reward_ongkir or (p_fulfillment = 'antar' and v_threshold > 0 and v_subtotal - v_diskon >= v_threshold);

  select * into v_customer from public.customers where phone_normalized = v_phone for update;
  if not found then
    insert into public.customers (user_id, nama, phone_normalized)
    values (case when v_role = 'member'
                  and not exists (select 1 from public.customers where user_id = v_uid) then v_uid end,
            v_nama, v_phone)
    returning * into v_customer;
  elsif v_customer.user_id is null and v_role = 'member'
        and not exists (select 1 from public.customers where user_id = v_uid) then
    update public.customers set user_id = v_uid where id = v_customer.id;
  end if;

  loop
    v_kode := 'GV-' || to_char(now() at time zone 'Asia/Jakarta', 'YYMMDD') || '-' || private.random_code(4);
    exit when not exists (select 1 from public.orders where kode = v_kode);
    v_try := v_try + 1;
    if v_try > 20 then raise exception 'Gagal membuat kode pesanan, coba lagi'; end if;
  end loop;

  insert into public.orders (kode, customer_id, user_id, nama_pemesan, no_hp, fulfillment, jadwal,
                             alamat_antar, catatan, subtotal, diskon, promo_id, promo_kode,
                             gratis_ongkir, ongkir_diset, persetujuan_wa,
                             reward_redemption_id, reward_diskon, reward_gratis_ongkir)
  values (v_kode, v_customer.id, case when v_role = 'member' then v_uid end, v_nama, v_phone, p_fulfillment, p_jadwal,
          case when p_fulfillment = 'antar' then v_alamat end, v_catatan, v_subtotal, v_diskon,
          v_promo.id, v_promo.kode, v_gratis, v_gratis or p_fulfillment = 'ambil', coalesce(p_persetujuan_wa, true),
          v_red.id, v_reward_diskon, v_reward_ongkir)
  returning id into v_order_id;

  insert into public.order_items (order_id, product_id, nama_produk, satuan, sale_mode, harga, qty, cost_snapshot)
  select v_order_id, product_id, nama, satuan, sale_mode, harga, qty, cost from pg_temp._order_lines;

  if v_red.id is not null then
    update public.reward_redemptions set status = 'dipakai', order_id = v_order_id, used_at = now() where id = v_red.id;
  end if;

  perform private.notify_order(v_order_id, 'diterima');
  return private.order_public_json(v_order_id);
end;
$$;

-- ---------------------------------------------------------------------
-- Verifikasi / tolak hadiah pada pesanan (Owner/Admin)
-- ---------------------------------------------------------------------
create or replace function public.verify_order_reward(p_order_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v public.orders;
begin
  perform private.require_role('owner', 'admin');
  v := private.lock_order(p_order_id);
  if v.reward_redemption_id is null then
    raise exception 'Pesanan ini tidak memakai hadiah' using errcode = '22023';
  end if;
  update public.orders set reward_verified_at = now(), reward_verified_by = auth.uid() where id = p_order_id;
  update public.reward_redemptions set verified_at = now(), verified_by = auth.uid() where id = v.reward_redemption_id;
end;
$$;

create or replace function public.reject_order_reward(p_order_id uuid, p_alasan text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v public.orders;
  v_alasan text := btrim(coalesce(p_alasan, ''));
begin
  perform private.require_role('owner', 'admin');
  if char_length(v_alasan) < 3 then
    raise exception 'Alasan wajib diisi' using errcode = '22023';
  end if;
  v := private.lock_order(p_order_id);
  if v.reward_redemption_id is null then
    raise exception 'Pesanan ini tidak memakai hadiah' using errcode = '22023';
  end if;
  if v.status <> 'menunggu_konfirmasi' then
    raise exception 'Hadiah hanya bisa ditolak sebelum pembayaran dikonfirmasi' using errcode = '22023';
  end if;
  perform set_config('app.audit_reason', v_alasan, true);
  update public.reward_redemptions
     set status = 'tersedia', order_id = null, used_at = null, catatan = 'Ditolak di ' || v.kode || ': ' || v_alasan
   where id = v.reward_redemption_id;
  update public.orders
     set diskon = diskon - reward_diskon,
         gratis_ongkir = case when reward_gratis_ongkir then false else gratis_ongkir end,
         ongkir_diset = case when reward_gratis_ongkir and fulfillment = 'antar' then false else ongkir_diset end,
         reward_redemption_id = null, reward_diskon = 0, reward_gratis_ongkir = false,
         reward_verified_at = null, reward_verified_by = null
   where id = p_order_id;
  perform set_config('app.audit_reason', '', true);
end;
$$;

-- confirm_order_payment: hadiah wajib diverifikasi dulu.
create or replace function public.confirm_order_payment(p_id uuid, p_bukti_path text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v public.orders;
  r record;
begin
  perform private.require_role('owner', 'admin');
  v := private.lock_order(p_id);
  if v.status <> 'menunggu_konfirmasi' then
    raise exception 'Hanya pesanan yang menunggu konfirmasi yang bisa dikonfirmasi' using errcode = '22023';
  end if;
  if not v.ongkir_diset then
    raise exception 'Isi ongkir terlebih dahulu sebelum mengonfirmasi pembayaran' using errcode = '22023';
  end if;
  if v.reward_redemption_id is not null and v.reward_verified_at is null then
    raise exception 'Verifikasi hadiah member terlebih dahulu' using errcode = '22023';
  end if;

  perform 1 from public.products
   where id in (select product_id from public.order_items where order_id = p_id and sale_mode = 'ready_stock')
   order by id for update;
  for r in
    select product_id, sum(qty)::int as qty from public.order_items
     where order_id = p_id and sale_mode = 'ready_stock' and product_id is not null
     group by product_id order by product_id
  loop
    perform private.move_product_stock(r.product_id, -r.qty, 'pesanan', 'orders', v.kode);
  end loop;

  update public.orders
     set status = 'dikonfirmasi', payment_status = 'lunas',
         confirmed_at = now(), confirmed_by = auth.uid(),
         stok_dipotong = true,
         bukti_transfer_path = coalesce(nullif(btrim(p_bukti_path), ''), bukti_transfer_path)
   where id = p_id;
  perform private.notify_order(p_id, 'dikonfirmasi');
end;
$$;

-- complete_order: + stamp, lencana, hadiah.
create or replace function public.complete_order(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v public.orders;
begin
  perform private.require_role('owner', 'admin');
  v := private.lock_order(p_id);
  if v.status <> 'siap' then
    raise exception 'Pesanan harus berstatus siap' using errcode = '22023';
  end if;
  update public.order_items i
     set cost_snapshot = p.cost_per_unit
    from public.products p
   where i.order_id = p_id and p.id = i.product_id;
  update public.orders set status = 'selesai', completed_at = now() where id = p_id;
  perform private.notify_order(p_id, 'selesai');
  perform private.award_stamp(p_id);
end;
$$;

-- cancel_order: + kembalikan hadiah yang dipakai.
create or replace function public.cancel_order(p_id uuid, p_alasan text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v public.orders;
  r record;
  v_alasan text := btrim(coalesce(p_alasan, ''));
begin
  perform private.require_role('owner', 'admin');
  if char_length(v_alasan) < 3 then
    raise exception 'Alasan pembatalan wajib diisi' using errcode = '22023';
  end if;
  v := private.lock_order(p_id);
  if v.status in ('selesai', 'dibatalkan') then
    raise exception 'Pesanan sudah % dan tidak bisa dibatalkan', v.status using errcode = '22023';
  end if;
  perform set_config('app.audit_reason', v_alasan, true);
  if v.stok_dipotong then
    perform 1 from public.products
     where id in (select product_id from public.order_items where order_id = p_id and sale_mode = 'ready_stock')
     order by id for update;
    for r in
      select product_id, sum(qty)::int as qty from public.order_items
       where order_id = p_id and sale_mode = 'ready_stock' and product_id is not null
       group by product_id order by product_id
    loop
      perform private.move_product_stock(r.product_id, r.qty, 'batal_pesanan', 'orders', v.kode, v_alasan);
    end loop;
  end if;
  if v.reward_redemption_id is not null then
    update public.reward_redemptions
       set status = case when expires_at > now() then 'tersedia' else 'kedaluwarsa' end,
           order_id = null, used_at = null, verified_at = null, verified_by = null,
           catatan = 'Dikembalikan: pesanan ' || v.kode || ' dibatalkan'
     where id = v.reward_redemption_id;
  end if;
  update public.orders
     set status = 'dibatalkan', cancelled_at = now(), cancelled_by = auth.uid(),
         alasan_batal = v_alasan, stok_dipotong = false
   where id = p_id;
  perform set_config('app.audit_reason', '', true);
  perform private.notify_order(p_id, 'dibatalkan');
end;
$$;

-- ---------------------------------------------------------------------
-- Koreksi stamp & penukaran hadiah manual (Owner/Admin)
-- ---------------------------------------------------------------------
create or replace function public.adjust_stamps(p_customer_id uuid, p_qty int, p_alasan text)
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_alasan text := btrim(coalesce(p_alasan, ''));
  v_balance int;
begin
  perform private.require_role('owner', 'admin');
  if p_qty is null or p_qty = 0 or abs(p_qty) > 50 then
    raise exception 'Jumlah koreksi harus antara -50 dan 50 (bukan 0)' using errcode = '22023';
  end if;
  if char_length(v_alasan) < 3 then
    raise exception 'Alasan koreksi stamp wajib diisi' using errcode = '22023';
  end if;
  perform 1 from public.customers where id = p_customer_id and user_id is not null for update;
  if not found then
    raise exception 'Stamp hanya untuk pelanggan member' using errcode = '22023';
  end if;
  v_balance := private.stamp_balance(p_customer_id);
  if v_balance + p_qty < 0 then
    raise exception 'Stamp tidak bisa kurang dari 0 (saat ini %)', v_balance using errcode = '23514';
  end if;
  insert into public.stamps (customer_id, tipe, qty, alasan) values (p_customer_id, 'adjust', p_qty, v_alasan);
  perform private.write_audit('stamp.koreksi', 'stamp', p_customer_id::text,
    jsonb_build_object('saldo', v_balance), jsonb_build_object('saldo', v_balance + p_qty, 'qty', p_qty), v_alasan);
  if p_qty > 0 then
    perform private.process_full_cards(p_customer_id, null);
  end if;
  return private.stamp_balance(p_customer_id);
end;
$$;

-- Penukaran di toko (tanpa pesanan online).
create or replace function public.redeem_reward_manual(p_kode text, p_catatan text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v public.reward_redemptions;
  v_catatan text := btrim(coalesce(p_catatan, ''));
begin
  perform private.require_role('owner', 'admin');
  if char_length(v_catatan) < 3 then
    raise exception 'Catatan penukaran wajib diisi' using errcode = '22023';
  end if;
  select * into v from public.reward_redemptions where kode = upper(btrim(coalesce(p_kode, ''))) for update;
  if not found then
    raise exception 'Kode hadiah tidak ditemukan' using errcode = 'P0002';
  end if;
  if v.status <> 'tersedia' or v.expires_at < now() then
    raise exception 'Hadiah sudah dipakai atau kedaluwarsa' using errcode = '22023';
  end if;
  perform set_config('app.audit_reason', v_catatan, true);
  update public.reward_redemptions
     set status = 'dipakai', used_at = now(), verified_at = now(), verified_by = auth.uid(), catatan = v_catatan
   where id = v.id;
  perform set_config('app.audit_reason', '', true);
end;
$$;

create or replace function private.expire_rewards()
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_n int;
begin
  update public.reward_redemptions set status = 'kedaluwarsa' where status = 'tersedia' and expires_at < now();
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- ---------------------------------------------------------------------
-- OTP WhatsApp & klaim pesanan tamu (member)
-- ---------------------------------------------------------------------
create or replace function public.request_phone_otp(p_phone text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_phone text := public.normalize_phone(p_phone);
  v_code text;
  v_menit int := coalesce((private.setting('loyalti.otp_berlaku_menit') #>> '{}')::int, 10);
  v_expires timestamptz := now() + make_interval(mins => v_menit);
begin
  perform private.require_role('member');
  if v_phone is null then
    raise exception 'Nomor HP tidak valid' using errcode = '22023';
  end if;
  if exists (select 1 from public.profiles where no_hp = v_phone and phone_verified_at is not null and id <> v_uid) then
    raise exception 'Nomor ini sudah terverifikasi di akun lain' using errcode = '23505';
  end if;
  if not private.hit_rate_limit('otp:hp:' || v_phone, coalesce((private.setting('batas.otp_per_jam') #>> '{}')::int, 3), interval '1 hour')
     or not private.hit_rate_limit('otp:user:' || v_uid, 5, interval '1 hour') then
    raise exception 'Terlalu banyak permintaan kode. Coba lagi dalam 1 jam.' using errcode = '54000';
  end if;
  v_code := lpad((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint % 1000000)::text, 6, '0');
  update public.phone_verifications set expires_at = now() where user_id = v_uid and verified_at is null and expires_at > now();
  insert into public.phone_verifications (user_id, phone, code_hash, expires_at)
  values (v_uid, v_phone, extensions.crypt(v_code, extensions.gen_salt('bf', 8)), v_expires);
  -- OTP tetap dikirim walau notifikasi otomatis dimatikan.
  insert into public.whatsapp_messages (customer_id, tahap, to_phone, body, max_attempts)
  values (null, 'kode_otp', v_phone,
          'Kode verifikasi ' || coalesce(private.setting('toko.nama') #>> '{}', 'GutVibes') || ': ' || v_code
          || E'\nBerlaku ' || v_menit || ' menit. Jangan berikan kode ini kepada siapa pun.', 2);
  return jsonb_build_object('phone', v_phone, 'expires_at', v_expires);
end;
$$;

-- Klaim pesanan tamu dengan nomor terverifikasi -> milik member + stamp.
create or replace function private.claim_guest_orders(p_user_id uuid, p_phone text)
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_ids uuid[];
  v_id uuid;
  v_n int := 0;
  v_guest public.customers;
begin
  select * into v_guest from public.customers where phone_normalized = p_phone for update;
  if found and v_guest.user_id is null and private.member_customer(p_user_id) is null then
    update public.customers set user_id = p_user_id where id = v_guest.id;
  end if;
  if not coalesce((private.setting('loyalti.klaim_pesanan_tamu') #>> '{}')::boolean, true) then
    return 0;
  end if;
  with claimed as (
    update public.orders set user_id = p_user_id
     where no_hp = p_phone and user_id is null
    returning id, status, completed_at
  )
  select array_agg(id order by completed_at) filter (where status = 'selesai') into v_ids from claimed;
  if v_ids is not null then
    foreach v_id in array v_ids loop
      if private.award_stamp(v_id, 'Klaim pesanan tamu') then v_n := v_n + 1; end if;
    end loop;
  end if;
  return v_n;
end;
$$;

create or replace function public.verify_phone_otp(p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v public.phone_verifications;
  v_klaim int;
begin
  perform private.require_role('member');
  select * into v from public.phone_verifications
   where user_id = v_uid and verified_at is null and expires_at > now()
   order by created_at desc limit 1 for update;
  if not found then
    raise exception 'Kode sudah kedaluwarsa. Minta kode baru.' using errcode = '22023';
  end if;
  if v.attempts >= 5 then
    raise exception 'Terlalu banyak percobaan. Minta kode baru.' using errcode = '54000';
  end if;
  if v.code_hash <> extensions.crypt(btrim(coalesce(p_code, '')), v.code_hash) then
    update public.phone_verifications set attempts = attempts + 1 where id = v.id;
    -- Simpan percobaan meski gagal: kembalikan galat lewat hasil, bukan exception.
    return jsonb_build_object('ok', false, 'pesan', 'Kode salah', 'sisa_percobaan', 4 - v.attempts);
  end if;
  update public.phone_verifications set verified_at = now() where id = v.id;
  update public.profiles set no_hp = v.phone, phone_verified_at = now() where id = v_uid;
  v_klaim := private.claim_guest_orders(v_uid, v.phone);
  perform private.write_audit('akun.verifikasi_hp', 'akun', v_uid::text, null, jsonb_build_object('no_hp', v.phone, 'klaim_stamp', v_klaim));
  return jsonb_build_object('ok', true, 'phone', v.phone, 'stamp_diklaim', v_klaim);
end;
$$;

-- Ringkasan loyalti untuk member yang masuk.
create or replace function public.my_loyalty()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_cust uuid := private.member_customer(v_uid);
  v_rules public.stamp_rules;
  v_reward public.rewards;
begin
  if v_uid is null then
    raise exception 'Harus masuk' using errcode = '42501';
  end if;
  select * into v_rules from public.stamp_rules where id = 1;
  select * into v_reward from public.rewards where id = v_rules.reward_id;
  return jsonb_build_object(
    'aktif', v_rules.aktif,
    'target', v_rules.stamps_per_reward,
    'min_belanja', v_rules.min_belanja_per_stamp,
    'hadiah', private.reward_label(v_reward.jenis, v_reward.nilai, v_reward.product_id, v_reward.maks_diskon),
    'masa_berlaku_hari', v_rules.masa_berlaku_hari,
    'stamp', case when v_cust is null then 0 else private.stamp_balance(v_cust) end,
    'pesanan_selesai', (select count(*) from public.orders where user_id = v_uid and status = 'selesai'),
    'phone_verified', (select phone_verified_at is not null from public.profiles where id = v_uid),
    'no_hp', (select no_hp from public.profiles where id = v_uid),
    'lencana', coalesce((select jsonb_agg(jsonb_build_object('kode', b.kode, 'nama', b.nama, 'deskripsi', b.deskripsi,
                                  'ambang', b.ambang, 'ikon', b.ikon, 'earned_at', cb.earned_at) order by b.ambang)
                         from public.badges b
                         left join public.customer_badges cb on cb.badge_id = b.id and cb.customer_id = v_cust
                         where b.aktif), '[]'::jsonb),
    'hadiah_saya', coalesce((select jsonb_agg(jsonb_build_object('kode', r.kode, 'nama', r.nama, 'jenis', r.jenis,
                                  'status', case when r.status = 'tersedia' and r.expires_at < now() then 'kedaluwarsa' else r.status end,
                                  'expires_at', r.expires_at, 'used_at', r.used_at) order by r.created_at desc)
                             from public.reward_redemptions r where r.customer_id = v_cust), '[]'::jsonb),
    'riwayat_stamp', coalesce((select jsonb_agg(x order by (x ->> 'created_at') desc) from (
                                 select jsonb_build_object('tipe', s.tipe, 'qty', s.qty, 'alasan', s.alasan, 'created_at', s.created_at,
                                                           'kode', (select kode from public.orders where id = s.order_id)) x
                                 from public.stamps s where s.customer_id = v_cust order by s.created_at desc limit 20) t), '[]'::jsonb)
  );
end;
$$;

-- Ringkasan loyalti pelanggan untuk staf (Owner/Admin).
create or replace function public.customer_loyalty(p_customer_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_role('owner', 'admin');
  return jsonb_build_object(
    'stamp', private.stamp_balance(p_customer_id),
    'target', (select stamps_per_reward from public.stamp_rules where id = 1),
    'lencana', coalesce((select jsonb_agg(b.nama order by b.ambang) from public.customer_badges cb join public.badges b on b.id = cb.badge_id
                         where cb.customer_id = p_customer_id), '[]'::jsonb),
    'riwayat', coalesce((select jsonb_agg(jsonb_build_object('tipe', s.tipe, 'qty', s.qty, 'alasan', s.alasan, 'created_at', s.created_at))
                         from (select * from public.stamps where customer_id = p_customer_id order by created_at desc limit 30) s), '[]'::jsonb)
  );
end;
$$;

-- order_public_json: sertakan info hadiah.
create or replace function private.order_public_json(p_order_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'kode', o.kode,
    'tracking_code', o.tracking_code,
    'status', o.status,
    'payment_status', o.payment_status,
    'fulfillment', o.fulfillment,
    'jadwal', o.jadwal,
    'nama_pemesan', o.nama_pemesan,
    'no_hp', o.no_hp,
    'alamat_antar', o.alamat_antar,
    'catatan', o.catatan,
    'subtotal', o.subtotal,
    'diskon', o.diskon,
    'promo_kode', o.promo_kode,
    'hadiah', (select r.nama from public.reward_redemptions r where r.id = o.reward_redemption_id),
    'shipping_cost', o.shipping_cost,
    'ongkir_diset', o.ongkir_diset,
    'gratis_ongkir', o.gratis_ongkir,
    'courier_name', o.courier_name,
    'total', o.total,
    'created_at', o.created_at,
    'confirmed_at', o.confirmed_at,
    'ready_at', o.ready_at,
    'completed_at', o.completed_at,
    'cancelled_at', o.cancelled_at,
    'alasan_batal', o.alasan_batal,
    'notif_wa', (select case when m.status = 'pending' and m.attempts > 0 then 'gagal' else m.status end
                  from public.whatsapp_messages m
                  where m.order_id = o.id and m.tahap = 'pesanan_diterima'),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'product_id', i.product_id, 'nama', i.nama_produk, 'satuan', i.satuan,
               'sale_mode', i.sale_mode, 'harga', i.harga, 'qty', i.qty, 'subtotal', i.subtotal)
             order by i.nama_produk)
      from public.order_items i where i.order_id = o.id), '[]'::jsonb)
  )
  from public.orders o where o.id = p_order_id;
$$;

-- ---------------------------------------------------------------------
-- RLS & hak akses
-- ---------------------------------------------------------------------
alter table public.rewards              enable row level security;
alter table public.stamp_rules          enable row level security;
alter table public.badges               enable row level security;
alter table public.stamps               enable row level security;
alter table public.customer_badges      enable row level security;
alter table public.reward_redemptions   enable row level security;
alter table public.phone_verifications  enable row level security;

-- Aturan dibaca semua pengguna masuk; diubah Owner.
create policy rewards_select on public.rewards for select to authenticated using (true);
create policy rewards_update on public.rewards for update to authenticated
  using ((select private.has_role('owner'))) with check ((select private.has_role('owner')));
create policy stamp_rules_select on public.stamp_rules for select to authenticated using (true);
create policy stamp_rules_update on public.stamp_rules for update to authenticated
  using ((select private.has_role('owner'))) with check ((select private.has_role('owner')));
create policy badges_select on public.badges for select to authenticated using (true);
create policy badges_write on public.badges for all to authenticated
  using ((select private.has_role('owner'))) with check ((select private.has_role('owner')));

-- Data member: pemilik atau Owner/Admin.
create policy stamps_select on public.stamps for select to authenticated
  using ((select private.has_role('owner', 'admin'))
         or customer_id in (select id from public.customers where user_id = (select auth.uid())));
create policy customer_badges_select on public.customer_badges for select to authenticated
  using ((select private.has_role('owner', 'admin'))
         or customer_id in (select id from public.customers where user_id = (select auth.uid())));
create policy reward_redemptions_select on public.reward_redemptions for select to authenticated
  using ((select private.has_role('owner', 'admin'))
         or customer_id in (select id from public.customers where user_id = (select auth.uid())));
-- phone_verifications: tanpa kebijakan = tidak bisa diakses klien.

revoke all on public.rewards, public.stamp_rules, public.badges, public.stamps, public.customer_badges,
              public.reward_redemptions, public.phone_verifications from anon, authenticated;
grant select on public.rewards, public.stamp_rules, public.badges, public.stamps, public.customer_badges,
               public.reward_redemptions to authenticated;
grant update (nama, jenis, nilai, maks_diskon, product_id) on public.rewards to authenticated;
grant update (aktif, stamps_per_reward, min_belanja_per_stamp, masa_berlaku_hari) on public.stamp_rules to authenticated;
grant insert (kode, nama, deskripsi, ambang, ikon, aktif), update (nama, deskripsi, ambang, ikon, aktif), delete
  on public.badges to authenticated;

revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function
  private.jwt_aal(), private.current_app_role(), private.has_role(public.app_role[]), private.is_staff()
to anon, authenticated;

revoke execute on function
  public.create_order(text, text, public.fulfillment, timestamptz, jsonb, text, text, text, boolean, text),
  public.verify_order_reward(uuid), public.reject_order_reward(uuid, text),
  public.confirm_order_payment(uuid, text), public.complete_order(uuid), public.cancel_order(uuid, text),
  public.adjust_stamps(uuid, int, text), public.redeem_reward_manual(text, text),
  public.request_phone_otp(text), public.verify_phone_otp(text), public.my_loyalty(), public.customer_loyalty(uuid)
from public, anon, authenticated;
grant execute on function
  public.create_order(text, text, public.fulfillment, timestamptz, jsonb, text, text, text, boolean, text)
to anon, authenticated;
grant execute on function
  public.verify_order_reward(uuid), public.reject_order_reward(uuid, text),
  public.confirm_order_payment(uuid, text), public.complete_order(uuid), public.cancel_order(uuid, text),
  public.adjust_stamps(uuid, int, text), public.redeem_reward_manual(text, text),
  public.request_phone_otp(text), public.verify_phone_otp(text), public.my_loyalty(), public.customer_loyalty(uuid)
to authenticated;

-- Hadiah kedaluwarsa ditandai tiap hari (bila pg_cron tersedia).
do $$
begin
  if to_regnamespace('cron') is not null then
    perform cron.schedule('expire-rewards', '7 17 * * *', 'select private.expire_rewards()');
  end if;
end;
$$;

-- Daftar member + saldo stamp (Owner/Admin), dengan pencarian & paginasi.
create or replace function public.loyalty_members(p_search text default null, p_limit int default 20, p_offset int default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_q text := nullif(btrim(coalesce(p_search, '')), '');
  v_digits text := regexp_replace(coalesce(p_search, ''), '\D', '', 'g');
begin
  perform private.require_role('owner', 'admin');
  return (
    with base as (
      select c.id, c.nama, c.phone_normalized,
             coalesce((select sum(qty) from public.stamps s where s.customer_id = c.id), 0)::int as stamp,
             (select count(*) from public.customer_badges b where b.customer_id = c.id)::int as lencana,
             (select count(*) from public.reward_redemptions r where r.customer_id = c.id and r.status = 'tersedia' and r.expires_at > now())::int as hadiah
      from public.customers c
      where c.user_id is not null
        and (v_q is null or c.nama ilike '%' || v_q || '%'
             or (length(v_digits) >= 4 and c.phone_normalized like '%' || regexp_replace(v_digits, '^0', '62') || '%'))
    )
    select jsonb_build_object(
      'total', (select count(*) from base),
      'rows', coalesce((select jsonb_agg(to_jsonb(b) order by b.stamp desc, b.nama)
                        from (select * from base order by stamp desc, nama limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0)) b), '[]'::jsonb))
  );
end;
$$;
revoke execute on function public.loyalty_members(text, int, int) from public, anon;
grant execute on function public.loyalty_members(text, int, int) to authenticated;
