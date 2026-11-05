-- =====================================================================
-- FASE 2 — KATALOG & PESANAN
-- Kategori, produk (ready_stock | preorder), promo, pesanan & item,
-- pergerakan stok, konten web, view katalog publik, RPC pesanan & lacak.
--
-- Aturan penting:
--  * Harga SELALU dihitung ulang di server (create_order tidak menerima harga).
--  * Produk ready_stock mengurangi stok saat pembayaran dikonfirmasi dan
--    mengembalikannya bila pesanan dibatalkan. Preorder tidak memengaruhi stok.
--  * Anon hanya membaca VIEW publik dan memanggil create_order, check_promo,
--    track_order, track_order_by_token.
--  * HPP (cost_per_unit, cost_snapshot) tidak bisa dibaca Admin.
-- =====================================================================

create type public.sale_mode as enum ('ready_stock', 'preorder');
create type public.order_status as enum ('menunggu_konfirmasi', 'dikonfirmasi', 'siap', 'selesai', 'dibatalkan');
create type public.fulfillment as enum ('ambil', 'antar');
create type public.payment_status as enum ('belum_bayar', 'lunas');

-- ---------------------------------------------------------------------
-- Kategori & produk
-- ---------------------------------------------------------------------
create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  nama        text not null check (char_length(btrim(nama)) between 1 and 60),
  slug        text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  urutan      int not null default 0,
  aktif       boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.products (
  id             uuid primary key default gen_random_uuid(),
  category_id    uuid references public.categories (id) on delete set null,
  nama           text not null check (char_length(btrim(nama)) between 1 and 100),
  slug           text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  deskripsi      text not null default '' check (char_length(deskripsi) <= 2000),
  harga          bigint not null check (harga >= 0 and harga <= 100000000),
  satuan         text not null default 'pcs' check (char_length(satuan) between 1 and 20),
  sale_mode      public.sale_mode not null default 'ready_stock',
  stok           int not null default 0 check (stok >= 0),
  cost_per_unit  numeric(14, 2) not null default 0 check (cost_per_unit >= 0),
  gambar_path    text,
  aktif          boolean not null default true,
  urutan         int not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
comment on column public.products.stok is 'Stok produk jadi (hanya bermakna untuk ready_stock). Diubah lewat RPC, tidak langsung.';
comment on column public.products.cost_per_unit is 'HPP per unit (rata-rata bergerak dari produksi, Fase 4). Hanya Owner.';
create index products_category_idx on public.products (category_id);

create trigger categories_touch before update on public.categories
for each row execute function private.touch_updated_at();
create trigger products_touch before update on public.products
for each row execute function private.touch_updated_at();

create trigger products_audit
after insert or update on public.products
for each row execute function private.audit_row_change('produk', 'nama', 'harga', 'stok', 'sale_mode', 'aktif');

-- ---------------------------------------------------------------------
-- Pergerakan stok (produk; bahan baku ditambahkan di Fase 4)
-- ---------------------------------------------------------------------
create table public.stock_movements (
  id            bigint generated always as identity primary key,
  product_id    uuid references public.products (id) on delete cascade,
  qty           numeric(14, 3) not null check (qty <> 0),
  stok_sesudah  numeric(14, 3) not null,
  jenis         text not null check (jenis in ('pesanan', 'batal_pesanan', 'koreksi', 'produksi', 'batal_produksi', 'belanja')),
  ref_tabel     text,
  ref_id        text,
  alasan        text,
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now()
);
create index stock_movements_product_idx on public.stock_movements (product_id, created_at desc);

-- ---------------------------------------------------------------------
-- Promo
-- ---------------------------------------------------------------------
create table public.promos (
  id           uuid primary key default gen_random_uuid(),
  kode         text not null unique check (kode ~ '^[A-Z0-9]{3,20}$'),
  nama         text not null check (char_length(btrim(nama)) between 1 and 80),
  tipe         text not null check (tipe in ('persen', 'nominal')),
  nilai        numeric(14, 2) not null check (nilai > 0),
  min_belanja  bigint not null default 0 check (min_belanja >= 0),
  maks_diskon  bigint check (maks_diskon is null or maks_diskon > 0),
  mulai        timestamptz,
  selesai      timestamptz,
  kuota        int check (kuota is null or kuota > 0),
  aktif        boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (tipe <> 'persen' or nilai <= 100),
  check (selesai is null or mulai is null or selesai > mulai)
);

create or replace function private.promos_before_write()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.kode := upper(btrim(new.kode));
  if tg_op = 'UPDATE' then new.updated_at := now(); end if;
  return new;
end;
$$;
create trigger promos_before_write before insert or update on public.promos
for each row execute function private.promos_before_write();
create trigger promos_audit after insert or update or delete on public.promos
for each row execute function private.audit_row_change('promo');

-- ---------------------------------------------------------------------
-- Pesanan
-- ---------------------------------------------------------------------
create table public.orders (
  id                   uuid primary key default gen_random_uuid(),
  kode                 text not null unique,
  tracking_code        text not null unique default replace(gen_random_uuid()::text, '-', ''),
  customer_id          uuid not null references public.customers (id),
  user_id              uuid references public.profiles (id) on delete set null,
  nama_pemesan         text not null,
  no_hp                text not null check (no_hp ~ '^628[0-9]{7,12}$'),
  status               public.order_status not null default 'menunggu_konfirmasi',
  fulfillment          public.fulfillment not null,
  jadwal               timestamptz not null,
  alamat_antar         text,
  catatan              text check (catatan is null or char_length(catatan) <= 500),
  subtotal             bigint not null check (subtotal >= 0),
  diskon               bigint not null default 0 check (diskon >= 0),
  promo_id             uuid references public.promos (id) on delete set null,
  promo_kode           text,
  shipping_cost        bigint not null default 0 check (shipping_cost >= 0),
  ongkir_diset         boolean not null default false,
  gratis_ongkir        boolean not null default false,
  courier_name         text check (courier_name is null or char_length(courier_name) <= 60),
  total                bigint generated always as (subtotal - diskon + shipping_cost) stored,
  payment_status       public.payment_status not null default 'belum_bayar',
  bukti_transfer_path  text,
  persetujuan_wa       boolean not null default true,
  stok_dipotong        boolean not null default false,
  confirmed_at         timestamptz,
  confirmed_by         uuid references public.profiles (id) on delete set null,
  ready_at             timestamptz,
  completed_at         timestamptz,
  cancelled_at         timestamptz,
  cancelled_by         uuid references public.profiles (id) on delete set null,
  alasan_batal         text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check (diskon <= subtotal),
  check (fulfillment = 'ambil' or alamat_antar is not null)
);
create index orders_status_idx on public.orders (status, created_at desc);
create index orders_customer_idx on public.orders (customer_id, created_at desc);
create index orders_user_idx on public.orders (user_id, created_at desc);
create index orders_jadwal_idx on public.orders (jadwal);
create index orders_no_hp_idx on public.orders (no_hp);

create trigger orders_touch before update on public.orders
for each row execute function private.touch_updated_at();
create trigger orders_audit after update on public.orders
for each row execute function private.audit_row_change('pesanan', 'status', 'payment_status', 'shipping_cost', 'courier_name');

create table public.order_items (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references public.orders (id) on delete cascade,
  product_id     uuid references public.products (id) on delete set null,
  nama_produk    text not null,
  satuan         text not null default 'pcs',
  sale_mode      public.sale_mode not null,
  harga          bigint not null check (harga >= 0),
  qty            int not null check (qty between 1 and 999),
  subtotal       bigint generated always as (harga * qty) stored,
  cost_snapshot  numeric(14, 2) not null default 0
);
create index order_items_order_idx on public.order_items (order_id);
create index order_items_product_idx on public.order_items (product_id);

-- ---------------------------------------------------------------------
-- Konten web
-- ---------------------------------------------------------------------
create table public.site_content (
  key         text primary key check (key ~ '^[a-z0-9_.]+$'),
  label       text not null,
  tipe        text not null default 'teks' check (tipe in ('teks', 'paragraf', 'url')),
  value       text not null default '' check (char_length(value) <= 5000),
  grup        text not null default 'Umum',
  urutan      int not null default 0,
  updated_by  uuid references public.profiles (id) on delete set null,
  updated_at  timestamptz not null default now()
);

create or replace function private.site_content_before_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.value := btrim(new.value);
  if new.tipe = 'url' and new.value <> '' and new.value !~ '^https://' then
    raise exception '"%" harus berupa tautan https://', new.label using errcode = '22023';
  end if;
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;
create trigger site_content_before_update before update on public.site_content
for each row execute function private.site_content_before_update();
create trigger site_content_audit after update on public.site_content
for each row execute function private.audit_row_change('konten_web', 'value');

insert into public.site_content (key, label, tipe, value, grup, urutan) values
  ('beranda.hero_judul', 'Judul utama', 'teks', 'Kue & roti rumahan dengan good vibes.', 'Beranda', 10),
  ('beranda.hero_sub', 'Subjudul', 'paragraf', 'Pesan online, pilih ambil sendiri atau diantar, dan kumpulkan stamp di setiap pesanan.', 'Beranda', 20),
  ('cerita.judul', 'Judul', 'teks', 'Cerita Kami', 'Cerita Kami', 10),
  ('cerita.isi', 'Isi cerita', 'paragraf', 'Kami memanggang dalam jumlah kecil setiap hari dengan bahan pilihan.', 'Cerita Kami', 20),
  ('lokasi.alamat', 'Alamat toko', 'paragraf', '', 'Lokasi & Kontak', 10),
  ('lokasi.jam_buka', 'Jam buka', 'paragraf', '', 'Lokasi & Kontak', 20),
  ('lokasi.maps_url', 'Tautan Google Maps', 'url', '', 'Lokasi & Kontak', 30),
  ('kontak.whatsapp', 'Nomor WhatsApp toko', 'teks', '', 'Lokasi & Kontak', 40),
  ('kontak.instagram', 'Instagram (tanpa @)', 'teks', '', 'Lokasi & Kontak', 50),
  ('kontak.email', 'Email', 'teks', '', 'Lokasi & Kontak', 60),
  ('pembayaran.instruksi', 'Instruksi pembayaran', 'paragraf', 'Transfer ke rekening toko, lalu kirim bukti transfer via WhatsApp.', 'Pesanan', 10),
  ('pesanan.catatan_ongkir', 'Catatan ongkir', 'paragraf', 'Ongkir dihitung sesuai jarak dan dikonfirmasi admin via WhatsApp.', 'Pesanan', 20);

-- Kontak & alamat pindah ke Konten Web (bisa diubah Admin).
delete from public.app_settings where key in ('toko.whatsapp', 'toko.alamat');
update public.app_settings set label = 'Batas pesanan per nomor HP' where key = 'batas.pesanan_per_jam';
insert into public.app_settings (key, value, tipe, opsi, label, deskripsi, kategori, urutan, is_public) values
  ('batas.pesanan_per_jam_ip', '20', 'angka', '{"min": 1, "max": 500, "bulat": true, "satuan": "pesanan/jam"}',
   'Batas pesanan per IP', 'Lebih longgar dari batas per nomor karena banyak pelanggan bisa berbagi IP operator.', 'Keamanan', 15, false);

-- ---------------------------------------------------------------------
-- View publik (dibaca anon). Hanya kolom aman, tanpa HPP.
-- ---------------------------------------------------------------------
create view public.katalog_kategori as
  select c.id, c.nama, c.slug, c.urutan
  from public.categories c
  where c.aktif;

create view public.katalog_produk as
  select p.id, p.nama, p.slug, p.deskripsi, p.harga, p.satuan, p.sale_mode,
         case when p.sale_mode = 'ready_stock' then p.stok end as stok,
         p.gambar_path, p.urutan,
         c.id as category_id, c.nama as kategori_nama, c.slug as kategori_slug
  from public.products p
  left join public.categories c on c.id = p.category_id
  where p.aktif and (c.id is null or c.aktif);

create view public.konten_publik as
  select key, value from public.site_content;

create view public.pengaturan_publik as
  select key, value from public.app_settings where is_public;

-- HPP produk: khusus Owner (dengan 2FA).
create view public.biaya_produk as
  select p.id, p.cost_per_unit
  from public.products p
  where (select private.has_role('owner'));

-- ---------------------------------------------------------------------
-- Helper
-- ---------------------------------------------------------------------

-- Stub notifikasi WhatsApp. Fase 3 mengganti isinya dengan antrean
-- whatsapp_messages. Dipanggil dari semua perubahan tahap pesanan.
create or replace function private.notify_order(p_order_id uuid, p_tahap text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  -- sengaja kosong (Fase 3)
  perform p_order_id, p_tahap;
end;
$$;

create or replace function private.random_code(p_len int)
returns text language sql volatile set search_path = '' as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
  from generate_series(1, p_len);
$$;

create or replace function private.rupiah(p_n bigint)
returns text language sql immutable set search_path = '' as $$
  select 'Rp' || replace(to_char(p_n, 'FM999G999G999G990'), ',', '.');
$$;

-- Hitung diskon promo; RAISE dengan pesan ramah bila tidak berlaku.
create or replace function private.promo_discount(p_promo public.promos, p_subtotal bigint)
returns bigint language plpgsql stable security definer set search_path = '' as $$
declare
  v_used int;
  v_diskon bigint;
begin
  if not p_promo.aktif
     or (p_promo.mulai is not null and p_promo.mulai > now())
     or (p_promo.selesai is not null and p_promo.selesai < now()) then
    raise exception 'Kode promo tidak berlaku' using errcode = '22023';
  end if;
  if p_promo.kuota is not null then
    select count(*) into v_used from public.orders
     where promo_id = p_promo.id and status <> 'dibatalkan';
    if v_used >= p_promo.kuota then
      raise exception 'Kuota promo sudah habis' using errcode = '22023';
    end if;
  end if;
  if p_subtotal < p_promo.min_belanja then
    raise exception 'Promo berlaku untuk belanja minimal %', private.rupiah(p_promo.min_belanja) using errcode = '22023';
  end if;
  v_diskon := case p_promo.tipe
                when 'persen' then floor(p_subtotal * p_promo.nilai / 100)
                else floor(p_promo.nilai)
              end;
  if p_promo.maks_diskon is not null then v_diskon := least(v_diskon, p_promo.maks_diskon); end if;
  return least(v_diskon, p_subtotal);
end;
$$;

-- JSON pesanan untuk pelanggan (lacak). Tanpa id internal & HPP.
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
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'product_id', i.product_id, 'nama', i.nama_produk, 'satuan', i.satuan,
               'sale_mode', i.sale_mode, 'harga', i.harga, 'qty', i.qty, 'subtotal', i.subtotal)
             order by i.nama_produk)
      from public.order_items i where i.order_id = o.id), '[]'::jsonb)
  )
  from public.orders o where o.id = p_order_id;
$$;

-- Ubah stok produk + catat pergerakan. Pemanggil wajib sudah mengunci baris produk.
create or replace function private.move_product_stock(
  p_product_id uuid, p_delta int, p_jenis text, p_ref_tabel text, p_ref_id text, p_alasan text default null)
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_stok int;
  v_nama text;
begin
  select stok, nama into v_stok, v_nama from public.products where id = p_product_id for update;
  if not found then
    raise exception 'Produk tidak ditemukan' using errcode = 'P0002';
  end if;
  if v_stok + p_delta < 0 then
    raise exception 'Stok "%" tidak cukup (tersedia %, dibutuhkan %)', v_nama, v_stok, -p_delta using errcode = '23514';
  end if;
  update public.products set stok = stok + p_delta where id = p_product_id returning stok into v_stok;
  insert into public.stock_movements (product_id, qty, stok_sesudah, jenis, ref_tabel, ref_id, alasan)
  values (p_product_id, p_delta, v_stok, p_jenis, p_ref_tabel, p_ref_id, p_alasan);
  return v_stok;
end;
$$;

-- ---------------------------------------------------------------------
-- RPC publik: promo & pesanan
-- ---------------------------------------------------------------------
create or replace function public.check_promo(p_kode text, p_subtotal bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_promo public.promos;
begin
  if not private.hit_rate_limit('promo:ip:' || private.client_ip(), 30, interval '15 minutes') then
    raise exception 'Terlalu banyak percobaan. Coba lagi nanti.' using errcode = '54000';
  end if;
  select * into v_promo from public.promos where kode = upper(btrim(coalesce(p_kode, '')));
  if not found then
    return jsonb_build_object('valid', false, 'pesan', 'Kode promo tidak ditemukan');
  end if;
  begin
    return jsonb_build_object('valid', true, 'kode', v_promo.kode, 'nama', v_promo.nama,
                              'diskon', private.promo_discount(v_promo, greatest(coalesce(p_subtotal, 0), 0)));
  exception when sqlstate '22023' then
    return jsonb_build_object('valid', false, 'pesan', sqlerrm);
  end;
end;
$$;

create or replace function public.create_order(
  p_nama text,
  p_no_hp text,
  p_fulfillment public.fulfillment,
  p_jadwal timestamptz,
  p_items jsonb,
  p_alamat text default null,
  p_catatan text default null,
  p_kode_promo text default null,
  p_persetujuan_wa boolean default true
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
  v_threshold bigint;
  v_gratis boolean := false;
  v_customer public.customers;
  v_order_id uuid;
  v_kode text;
  v_try int := 0;
begin
  -- Validasi input
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

  -- Batas laju (anti-spam)
  if not private.hit_rate_limit('order:hp:' || v_phone,
           coalesce((private.setting('batas.pesanan_per_jam') #>> '{}')::int, 5), interval '1 hour')
     or not private.hit_rate_limit('order:ip:' || private.client_ip(),
           coalesce((private.setting('batas.pesanan_per_jam_ip') #>> '{}')::int, 20), interval '1 hour') then
    raise exception 'Terlalu banyak pesanan dalam waktu singkat. Coba lagi nanti atau hubungi kami via WhatsApp.' using errcode = '54000';
  end if;

  -- Hitung ulang harga dari database (harga dari klien tidak dipakai)
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

  -- Promo
  if nullif(btrim(coalesce(p_kode_promo, '')), '') is not null then
    select * into v_promo from public.promos where kode = upper(btrim(p_kode_promo)) for update;
    if not found then
      raise exception 'Kode promo tidak ditemukan' using errcode = '22023';
    end if;
    v_diskon := private.promo_discount(v_promo, v_subtotal);
  end if;

  -- Gratis ongkir
  v_threshold := coalesce((private.setting('pesanan.gratis_ongkir_min') #>> '{}')::bigint, 0);
  v_gratis := p_fulfillment = 'antar' and v_threshold > 0 and v_subtotal - v_diskon >= v_threshold;

  -- Pelanggan digabung per nomor HP
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

  -- Kode pesanan unik: GV-YYMMDD-XXXX
  loop
    v_kode := 'GV-' || to_char(now() at time zone 'Asia/Jakarta', 'YYMMDD') || '-' || private.random_code(4);
    exit when not exists (select 1 from public.orders where kode = v_kode);
    v_try := v_try + 1;
    if v_try > 20 then raise exception 'Gagal membuat kode pesanan, coba lagi'; end if;
  end loop;

  insert into public.orders (kode, customer_id, user_id, nama_pemesan, no_hp, fulfillment, jadwal,
                             alamat_antar, catatan, subtotal, diskon, promo_id, promo_kode,
                             gratis_ongkir, ongkir_diset, persetujuan_wa)
  values (v_kode, v_customer.id, case when v_role = 'member' then v_uid end, v_nama, v_phone, p_fulfillment, p_jadwal,
          case when p_fulfillment = 'antar' then v_alamat end, v_catatan, v_subtotal, v_diskon,
          v_promo.id, v_promo.kode, v_gratis, v_gratis or p_fulfillment = 'ambil', coalesce(p_persetujuan_wa, true))
  returning id into v_order_id;

  insert into public.order_items (order_id, product_id, nama_produk, satuan, sale_mode, harga, qty, cost_snapshot)
  select v_order_id, product_id, nama, satuan, sale_mode, harga, qty, cost from pg_temp._order_lines;

  perform private.notify_order(v_order_id, 'diterima');
  return private.order_public_json(v_order_id);
end;
$$;

-- Lacak pesanan: kode + nomor HP. Jawaban sama (NULL) untuk kode salah
-- maupun nomor salah agar tidak membocorkan keberadaan pesanan.
create or replace function public.track_order(p_kode text, p_no_hp text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if not private.hit_rate_limit('track:ip:' || private.client_ip(),
           coalesce((private.setting('batas.lacak_per_15_menit') #>> '{}')::int, 10), interval '15 minutes') then
    raise exception 'Terlalu banyak percobaan. Coba lagi dalam 15 menit.' using errcode = '54000';
  end if;
  select id into v_id from public.orders
   where kode = upper(btrim(coalesce(p_kode, ''))) and no_hp = public.normalize_phone(p_no_hp);
  if v_id is null then return null; end if;
  return private.order_public_json(v_id);
end;
$$;

-- Lacak lewat tautan rahasia (tracking_code 128-bit).
create or replace function public.track_order_by_token(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if not private.hit_rate_limit('track:ip:' || private.client_ip(),
           coalesce((private.setting('batas.lacak_per_15_menit') #>> '{}')::int, 10) * 3, interval '15 minutes') then
    raise exception 'Terlalu banyak percobaan. Coba lagi dalam 15 menit.' using errcode = '54000';
  end if;
  select id into v_id from public.orders where tracking_code = lower(btrim(coalesce(p_token, '')));
  if v_id is null then return null; end if;
  return private.order_public_json(v_id);
end;
$$;

-- ---------------------------------------------------------------------
-- RPC staf: kelola pesanan (Owner & Admin)
-- ---------------------------------------------------------------------
create or replace function private.lock_order(p_id uuid)
returns public.orders language plpgsql security definer set search_path = '' as $$
declare
  v public.orders;
begin
  select * into v from public.orders where id = p_id for update;
  if not found then
    raise exception 'Pesanan tidak ditemukan' using errcode = 'P0002';
  end if;
  return v;
end;
$$;

create or replace function public.set_order_shipping(p_id uuid, p_ongkir bigint default null, p_kurir text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v public.orders;
begin
  perform private.require_role('owner', 'admin');
  v := private.lock_order(p_id);
  if v.status in ('selesai', 'dibatalkan') then
    raise exception 'Pesanan sudah %', v.status using errcode = '22023';
  end if;
  if p_ongkir is not null then
    if v.fulfillment <> 'antar' then
      raise exception 'Ongkir hanya untuk pesanan diantar' using errcode = '22023';
    end if;
    if v.status <> 'menunggu_konfirmasi' then
      raise exception 'Ongkir tidak bisa diubah setelah pembayaran dikonfirmasi' using errcode = '22023';
    end if;
    if p_ongkir < 0 or p_ongkir > 10000000 then
      raise exception 'Ongkir tidak valid' using errcode = '22023';
    end if;
    update public.orders
       set shipping_cost = case when gratis_ongkir then 0 else p_ongkir end,
           ongkir_diset = true
     where id = p_id;
  end if;
  if p_kurir is not null then
    update public.orders set courier_name = nullif(left(btrim(p_kurir), 60), '') where id = p_id;
  end if;
end;
$$;

-- Konfirmasi pembayaran -> status dikonfirmasi; stok ready_stock dipotong.
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

  -- Kunci produk berurutan (hindari deadlock), lalu potong stok.
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

create or replace function public.mark_order_ready(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v public.orders;
begin
  perform private.require_role('owner', 'admin');
  v := private.lock_order(p_id);
  if v.status <> 'dikonfirmasi' then
    raise exception 'Pesanan harus berstatus dikonfirmasi' using errcode = '22023';
  end if;
  update public.orders set status = 'siap', ready_at = now() where id = p_id;
  perform private.notify_order(p_id, 'siap');
end;
$$;

-- Selesaikan pesanan: simpan snapshot HPP terbaru. (Stamp ditambahkan di Fase 5.)
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
end;
$$;

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
  update public.orders
     set status = 'dibatalkan', cancelled_at = now(), cancelled_by = auth.uid(),
         alasan_batal = v_alasan, stok_dipotong = false
   where id = p_id;
  perform set_config('app.audit_reason', '', true);
  perform private.notify_order(p_id, 'dibatalkan');
end;
$$;

-- Koreksi stok produk jadi (wajib alasan).
create or replace function public.adjust_product_stock(p_product_id uuid, p_delta int, p_alasan text)
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_alasan text := btrim(coalesce(p_alasan, ''));
  v_stok int;
begin
  perform private.require_role('owner', 'admin');
  if p_delta is null or p_delta = 0 then
    raise exception 'Jumlah koreksi tidak boleh 0' using errcode = '22023';
  end if;
  if char_length(v_alasan) < 3 then
    raise exception 'Alasan koreksi stok wajib diisi' using errcode = '22023';
  end if;
  perform 1 from public.products where id = p_product_id for update;
  perform set_config('app.audit_reason', v_alasan, true);
  v_stok := private.move_product_stock(p_product_id, p_delta, 'koreksi', 'products', p_product_id::text, v_alasan);
  perform set_config('app.audit_reason', '', true);
  return v_stok;
end;
$$;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.categories      enable row level security;
alter table public.products        enable row level security;
alter table public.stock_movements enable row level security;
alter table public.promos          enable row level security;
alter table public.orders          enable row level security;
alter table public.order_items     enable row level security;
alter table public.site_content    enable row level security;

create policy categories_select_staff on public.categories for select to authenticated
  using ((select private.is_staff()));
create policy categories_write on public.categories for all to authenticated
  using ((select private.has_role('owner', 'admin')))
  with check ((select private.has_role('owner', 'admin')));

create policy products_select_staff on public.products for select to authenticated
  using ((select private.is_staff()));
create policy products_insert on public.products for insert to authenticated
  with check ((select private.has_role('owner', 'admin')));
create policy products_update on public.products for update to authenticated
  using ((select private.has_role('owner', 'admin')))
  with check ((select private.has_role('owner', 'admin')));

create policy stock_movements_select on public.stock_movements for select to authenticated
  using ((select private.has_role('owner', 'admin')));

create policy promos_all on public.promos for all to authenticated
  using ((select private.has_role('owner', 'admin')))
  with check ((select private.has_role('owner', 'admin')));

create policy orders_select on public.orders for select to authenticated
  using ((select private.has_role('owner', 'admin')) or user_id = (select auth.uid()));

create policy order_items_select on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id
                 and ((select private.has_role('owner', 'admin')) or o.user_id = (select auth.uid()))));

create policy site_content_select_staff on public.site_content for select to authenticated
  using ((select private.has_role('owner', 'admin')));
create policy site_content_update on public.site_content for update to authenticated
  using ((select private.has_role('owner', 'admin')))
  with check ((select private.has_role('owner', 'admin')));

-- ---------------------------------------------------------------------
-- Hak akses
-- ---------------------------------------------------------------------
revoke all on public.categories, public.products, public.stock_movements, public.promos,
              public.orders, public.order_items, public.site_content,
              public.katalog_kategori, public.katalog_produk, public.konten_publik,
              public.pengaturan_publik, public.biaya_produk
  from anon, authenticated;

-- App settings: tamu membaca lewat view pengaturan_publik saja.
revoke select on public.app_settings from anon;

grant select on public.katalog_kategori, public.katalog_produk, public.konten_publik, public.pengaturan_publik
  to anon, authenticated;
grant select on public.biaya_produk to authenticated;

grant select, insert (nama, slug, urutan, aktif), update (nama, slug, urutan, aktif), delete
  on public.categories to authenticated;

-- Tanpa cost_per_unit (HPP khusus Owner via view biaya_produk) dan tanpa
-- menulis stok langsung (lewat RPC).
grant select (id, category_id, nama, slug, deskripsi, harga, satuan, sale_mode, stok, gambar_path,
              aktif, urutan, created_at, updated_at) on public.products to authenticated;
grant insert (category_id, nama, slug, deskripsi, harga, satuan, sale_mode, gambar_path, aktif, urutan)
  on public.products to authenticated;
grant update (category_id, nama, slug, deskripsi, harga, satuan, sale_mode, gambar_path, aktif, urutan)
  on public.products to authenticated;

grant select on public.stock_movements to authenticated;

grant select, delete on public.promos to authenticated;
grant insert (kode, nama, tipe, nilai, min_belanja, maks_diskon, mulai, selesai, kuota, aktif),
      update (kode, nama, tipe, nilai, min_belanja, maks_diskon, mulai, selesai, kuota, aktif)
  on public.promos to authenticated;

grant select on public.orders to authenticated;
grant select (id, order_id, product_id, nama_produk, satuan, sale_mode, harga, qty, subtotal)
  on public.order_items to authenticated;

grant select, update (value) on public.site_content to authenticated;

-- Fungsi
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function
  private.jwt_aal(), private.current_app_role(), private.has_role(public.app_role[]), private.is_staff()
to anon, authenticated;

revoke execute on function
  public.check_promo(text, bigint),
  public.create_order(text, text, public.fulfillment, timestamptz, jsonb, text, text, text, boolean),
  public.track_order(text, text),
  public.track_order_by_token(text),
  public.set_order_shipping(uuid, bigint, text),
  public.confirm_order_payment(uuid, text),
  public.mark_order_ready(uuid),
  public.complete_order(uuid),
  public.cancel_order(uuid, text),
  public.adjust_product_stock(uuid, int, text)
from public, anon, authenticated;

grant execute on function
  public.check_promo(text, bigint),
  public.create_order(text, text, public.fulfillment, timestamptz, jsonb, text, text, text, boolean),
  public.track_order(text, text),
  public.track_order_by_token(text)
to anon, authenticated;

grant execute on function
  public.set_order_shipping(uuid, bigint, text),
  public.confirm_order_payment(uuid, text),
  public.mark_order_ready(uuid),
  public.complete_order(uuid),
  public.cancel_order(uuid, text),
  public.adjust_product_stock(uuid, int, text)
to authenticated;

-- ---------------------------------------------------------------------
-- Storage: foto produk (publik) & bukti transfer (privat)
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage')
     and exists (select 1 from pg_tables where schemaname = 'storage' and tablename = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
      ('produk', 'produk', true, 2097152, array['image/jpeg', 'image/png', 'image/webp']),
      ('bukti-transfer', 'bukti-transfer', false, 3145728, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
    on conflict (id) do nothing;

    execute $p$create policy "produk: staf unggah" on storage.objects for insert to authenticated
      with check (bucket_id = 'produk' and (select private.has_role('owner', 'admin')))$p$;
    execute $p$create policy "produk: staf ubah" on storage.objects for update to authenticated
      using (bucket_id = 'produk' and (select private.has_role('owner', 'admin')))$p$;
    execute $p$create policy "produk: staf hapus" on storage.objects for delete to authenticated
      using (bucket_id = 'produk' and (select private.has_role('owner', 'admin')))$p$;
    execute $p$create policy "produk: staf lihat" on storage.objects for select to authenticated
      using (bucket_id = 'produk' and (select private.has_role('owner', 'admin')))$p$;

    execute $p$create policy "bukti: staf lihat" on storage.objects for select to authenticated
      using (bucket_id = 'bukti-transfer' and (select private.has_role('owner', 'admin')))$p$;
    execute $p$create policy "bukti: staf unggah" on storage.objects for insert to authenticated
      with check (bucket_id = 'bukti-transfer' and (select private.has_role('owner', 'admin')))$p$;
  end if;
end;
$$;
