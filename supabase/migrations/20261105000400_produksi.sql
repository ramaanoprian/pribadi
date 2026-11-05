-- =====================================================================
-- FASE 4 — PRODUKSI
-- Bahan baku, resep (hasil per batch), input produksi atomik, pembatalan,
-- belanja & koreksi stok bahan.
--
--  * record_production: satu transaksi + row lock; cek stok bahan
--    (mode peringatan/blokir = pengaturan); kurangi bahan; tambah stok
--    produk jadi (ready_stock); catat log, pergerakan stok; HPP rata-rata
--    bergerak.
--  * Admin Baking hanya bisa input (tidak bisa ubah/hapus). Pembatalan
--    oleh Owner/Admin dengan alasan, otomatis membalik stok.
--  * Resep & HPP bahan tidak bisa dibaca Admin Baking (hanya pratinjau
--    pemakaian lewat RPC).
-- =====================================================================

create table public.ingredients (
  id             uuid primary key default gen_random_uuid(),
  nama           text not null unique check (char_length(btrim(nama)) between 1 and 80),
  satuan         text not null check (char_length(btrim(satuan)) between 1 and 20),
  -- Boleh negatif bila produksi tetap dilanjutkan saat bahan kurang (mode peringatan),
  -- sebagai penanda selisih yang perlu dikoreksi.
  stok           numeric(14, 3) not null default 0,
  min_stock      numeric(14, 3) not null default 0 check (min_stock >= 0),
  cost_per_unit  numeric(14, 4) not null default 0 check (cost_per_unit >= 0),
  aktif          boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
comment on column public.ingredients.cost_per_unit is 'Harga rata-rata bergerak per satuan (dari belanja). Hanya Owner.';
create trigger ingredients_touch before update on public.ingredients
for each row execute function private.touch_updated_at();
create trigger ingredients_audit after insert or update on public.ingredients
for each row execute function private.audit_row_change('bahan', 'nama', 'satuan', 'min_stock', 'aktif');

create table public.recipes (
  id               uuid primary key default gen_random_uuid(),
  product_id       uuid not null unique references public.products (id) on delete cascade,
  yield_per_batch  numeric(12, 3) not null check (yield_per_batch > 0),
  catatan          text check (catatan is null or char_length(catatan) <= 1000),
  updated_at       timestamptz not null default now()
);
create trigger recipes_touch before update on public.recipes
for each row execute function private.touch_updated_at();
create trigger recipes_audit after insert or update on public.recipes
for each row execute function private.audit_row_change('resep', 'yield_per_batch');

create table public.recipe_items (
  id             uuid primary key default gen_random_uuid(),
  recipe_id      uuid not null references public.recipes (id) on delete cascade,
  ingredient_id  uuid not null references public.ingredients (id) on delete restrict,
  qty_per_batch  numeric(14, 3) not null check (qty_per_batch > 0),
  unique (recipe_id, ingredient_id)
);
create trigger recipe_items_audit after insert or update or delete on public.recipe_items
for each row execute function private.audit_row_change('resep_bahan', 'ingredient_id', 'qty_per_batch');

create table public.production_logs (
  id              uuid primary key default gen_random_uuid(),
  product_id      uuid not null references public.products (id),
  nama_produk     text not null,
  batches         int not null check (batches between 1 and 1000),
  total_output    numeric(14, 3) not null check (total_output > 0),
  hpp_snapshot    numeric(16, 2) not null default 0,
  hpp_per_unit    numeric(14, 4) not null default 0,
  bahan_snapshot  jsonb not null default '[]'::jsonb,
  bahan_kurang    boolean not null default false,
  status          text not null default 'aktif' check (status in ('aktif', 'dibatalkan')),
  created_by      uuid not null default auth.uid() references public.profiles (id),
  created_at      timestamptz not null default now(),
  cancelled_by    uuid references public.profiles (id),
  cancelled_at    timestamptz,
  alasan          text
);
create index production_logs_created_idx on public.production_logs (created_at desc);
create index production_logs_creator_idx on public.production_logs (created_by, created_at desc);

-- Pergerakan stok untuk bahan juga.
alter table public.stock_movements add column ingredient_id uuid references public.ingredients (id) on delete cascade;
alter table public.stock_movements add constraint stock_movements_target_chk
  check ((product_id is null) <> (ingredient_id is null));
create index stock_movements_ingredient_idx on public.stock_movements (ingredient_id, created_at desc);

-- ---------------------------------------------------------------------
-- Helper
-- ---------------------------------------------------------------------
create or replace function private.move_ingredient_stock(
  p_ingredient_id uuid, p_delta numeric, p_jenis text, p_ref_tabel text, p_ref_id text, p_alasan text default null)
returns numeric language plpgsql security definer set search_path = '' as $$
declare
  v_stok numeric;
begin
  update public.ingredients set stok = stok + p_delta where id = p_ingredient_id returning stok into v_stok;
  if not found then
    raise exception 'Bahan tidak ditemukan' using errcode = 'P0002';
  end if;
  insert into public.stock_movements (ingredient_id, qty, stok_sesudah, jenis, ref_tabel, ref_id, alasan)
  values (p_ingredient_id, p_delta, v_stok, p_jenis, p_ref_tabel, p_ref_id, p_alasan);
  return v_stok;
end;
$$;

-- Kebutuhan bahan untuk N batch (dipakai pratinjau & record_production).
create or replace function private.production_needs(p_product_id uuid, p_batches int)
returns table (ingredient_id uuid, nama text, satuan text, dibutuhkan numeric, tersedia numeric, kurang numeric, cost_per_unit numeric)
language sql stable security definer set search_path = '' as $$
  select i.id, i.nama, i.satuan,
         ri.qty_per_batch * p_batches,
         i.stok,
         greatest(0, ri.qty_per_batch * p_batches - greatest(i.stok, 0)),
         i.cost_per_unit
  from public.recipes r
  join public.recipe_items ri on ri.recipe_id = r.id
  join public.ingredients i on i.id = ri.ingredient_id
  where r.product_id = p_product_id
  order by i.nama;
$$;

-- ---------------------------------------------------------------------
-- RPC produksi
-- ---------------------------------------------------------------------

-- Produk yang bisa diproduksi (punya resep). Untuk semua staf dapur.
create or replace function public.production_products()
returns table (product_id uuid, nama text, satuan text, sale_mode public.sale_mode, stok int, yield_per_batch numeric, gambar_path text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.nama, p.satuan, p.sale_mode, p.stok, r.yield_per_batch, p.gambar_path
  from public.products p join public.recipes r on r.product_id = p.id
  where p.aktif and private.has_role('owner', 'admin', 'admin_baking')
  order by p.urutan, p.nama;
$$;

-- Pratinjau pemakaian bahan (tanpa membuka resep lengkap / harga).
create or replace function public.production_preview(p_product_id uuid, p_batches int)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_yield numeric;
  v_mode text := coalesce(private.setting('produksi.mode_bahan_kurang') #>> '{}', 'peringatan');
begin
  perform private.require_role('owner', 'admin', 'admin_baking');
  if p_batches is null or p_batches < 1 or p_batches > 1000 then
    raise exception 'Jumlah batch minimal 1' using errcode = '22023';
  end if;
  select yield_per_batch into v_yield from public.recipes where product_id = p_product_id;
  if v_yield is null then
    raise exception 'Produk ini belum punya resep' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'hasil', v_yield * p_batches,
    'mode_bahan_kurang', v_mode,
    'bahan', coalesce((select jsonb_agg(jsonb_build_object(
                         'nama', n.nama, 'satuan', n.satuan, 'dibutuhkan', n.dibutuhkan,
                         'tersedia', n.tersedia, 'kurang', n.kurang))
                       from private.production_needs(p_product_id, p_batches) n), '[]'::jsonb),
    'ada_kurang', exists (select 1 from private.production_needs(p_product_id, p_batches) n where n.kurang > 0)
  );
end;
$$;

create or replace function public.record_production(p_product_id uuid, p_batches int)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_product public.products;
  v_yield numeric;
  v_output numeric;
  v_mode text := coalesce(private.setting('produksi.mode_bahan_kurang') #>> '{}', 'peringatan');
  v_kurang boolean;
  v_hpp numeric := 0;
  v_snapshot jsonb;
  v_log_id uuid;
  v_old_stok int;
  r record;
begin
  perform private.require_role('owner', 'admin', 'admin_baking');
  if p_batches is null or p_batches < 1 or p_batches > 1000 then
    raise exception 'Jumlah batch minimal 1' using errcode = '22023';
  end if;

  select * into v_product from public.products where id = p_product_id for update;
  if not found then
    raise exception 'Produk tidak ditemukan' using errcode = 'P0002';
  end if;
  select yield_per_batch into v_yield from public.recipes where product_id = p_product_id;
  if v_yield is null then
    raise exception 'Produk ini belum punya resep' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.recipes rc join public.recipe_items ri on ri.recipe_id = rc.id where rc.product_id = p_product_id) then
    raise exception 'Resep belum berisi bahan' using errcode = '22023';
  end if;

  -- Kunci bahan berurutan (hindari deadlock antar input bersamaan).
  perform 1 from public.ingredients
   where id in (select ri.ingredient_id from public.recipes rc join public.recipe_items ri on ri.recipe_id = rc.id where rc.product_id = p_product_id)
   order by id for update;

  select exists (select 1 from private.production_needs(p_product_id, p_batches) where kurang > 0) into v_kurang;
  if v_kurang and v_mode = 'blokir' then
    raise exception 'Bahan tidak cukup: %',
      (select string_agg(nama || ' kurang ' || trim(to_char(kurang, 'FM999999990.###')) || ' ' || satuan, ', ')
         from private.production_needs(p_product_id, p_batches) where kurang > 0)
      using errcode = '23514';
  end if;

  v_output := v_yield * p_batches;
  select coalesce(sum(dibutuhkan * cost_per_unit), 0),
         coalesce(jsonb_agg(jsonb_build_object('ingredient_id', ingredient_id, 'nama', nama, 'satuan', satuan,
                                               'qty', dibutuhkan, 'kurang', kurang, 'cost_per_unit', cost_per_unit)), '[]'::jsonb)
    into v_hpp, v_snapshot
  from private.production_needs(p_product_id, p_batches);

  insert into public.production_logs (product_id, nama_produk, batches, total_output, hpp_snapshot, hpp_per_unit, bahan_snapshot, bahan_kurang)
  values (p_product_id, v_product.nama, p_batches, v_output, v_hpp, v_hpp / v_output, v_snapshot, v_kurang)
  returning id into v_log_id;

  for r in select * from private.production_needs(p_product_id, p_batches) loop
    perform private.move_ingredient_stock(r.ingredient_id, -r.dibutuhkan, 'produksi', 'production_logs', v_log_id::text);
  end loop;

  -- HPP produk: rata-rata bergerak.
  v_old_stok := greatest(v_product.stok, 0);
  update public.products
     set cost_per_unit = round(((v_old_stok * cost_per_unit) + v_hpp) / (v_old_stok + v_output), 2)
   where id = p_product_id;

  if v_product.sale_mode = 'ready_stock' then
    perform private.move_product_stock(p_product_id, floor(v_output)::int, 'produksi', 'production_logs', v_log_id::text);
  end if;

  return jsonb_build_object('id', v_log_id, 'hasil', v_output, 'bahan_kurang', v_kurang,
                            'stok_produk', (select stok from public.products where id = p_product_id));
end;
$$;

create or replace function public.cancel_production(p_id uuid, p_alasan text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v public.production_logs;
  v_product public.products;
  v_alasan text := btrim(coalesce(p_alasan, ''));
  v_remaining numeric;
  r record;
begin
  perform private.require_role('owner', 'admin');
  if char_length(v_alasan) < 3 then
    raise exception 'Alasan pembatalan wajib diisi' using errcode = '22023';
  end if;
  select * into v from public.production_logs where id = p_id for update;
  if not found then
    raise exception 'Data produksi tidak ditemukan' using errcode = 'P0002';
  end if;
  if v.status = 'dibatalkan' then
    raise exception 'Produksi ini sudah dibatalkan' using errcode = '22023';
  end if;
  select * into v_product from public.products where id = v.product_id for update;
  perform 1 from public.ingredients
   where id in (select (e ->> 'ingredient_id')::uuid from jsonb_array_elements(v.bahan_snapshot) e)
   order by id for update;

  perform set_config('app.audit_reason', v_alasan, true);
  if v_product.sale_mode = 'ready_stock' then
    if v_product.stok < floor(v.total_output) then
      raise exception 'Stok produk jadi tinggal %, tidak cukup untuk membatalkan % hasil produksi (sebagian sudah terjual). Gunakan koreksi stok.',
        v_product.stok, floor(v.total_output) using errcode = '23514';
    end if;
    perform private.move_product_stock(v.product_id, -floor(v.total_output)::int, 'batal_produksi', 'production_logs', p_id::text, v_alasan);
  end if;
  for r in select (e ->> 'ingredient_id')::uuid as ingredient_id, (e ->> 'qty')::numeric as qty
           from jsonb_array_elements(v.bahan_snapshot) e loop
    perform private.move_ingredient_stock(r.ingredient_id, r.qty, 'batal_produksi', 'production_logs', p_id::text, v_alasan);
  end loop;

  -- Balik HPP rata-rata bergerak bila masih ada stok tersisa.
  v_remaining := greatest(v_product.stok, 0) - v.total_output;
  if v_product.sale_mode = 'ready_stock' and v_remaining > 0 then
    update public.products
       set cost_per_unit = greatest(0, round(((greatest(v_product.stok, 0) * v_product.cost_per_unit) - v.hpp_snapshot) / v_remaining, 2))
     where id = v.product_id;
  end if;

  update public.production_logs
     set status = 'dibatalkan', cancelled_by = auth.uid(), cancelled_at = now(), alasan = v_alasan
   where id = p_id;
  perform private.write_audit('produksi.batal', 'produksi', p_id::text,
    jsonb_build_object('status', 'aktif', 'produk', v.nama_produk, 'batches', v.batches, 'hasil', v.total_output),
    jsonb_build_object('status', 'dibatalkan'), v_alasan);
  perform set_config('app.audit_reason', '', true);
end;
$$;

-- Ringkasan produksi hari ini (semua staf dapur melihat total toko).
create or replace function public.production_today()
returns table (product_id uuid, nama_produk text, satuan text, batches bigint, hasil numeric)
language sql stable security definer set search_path = '' as $$
  select l.product_id, l.nama_produk, p.satuan, sum(l.batches), sum(l.total_output)
  from public.production_logs l join public.products p on p.id = l.product_id
  where l.status = 'aktif'
    and (l.created_at at time zone 'Asia/Jakarta')::date = (now() at time zone 'Asia/Jakarta')::date
    and private.has_role('owner', 'admin', 'admin_baking')
  group by l.product_id, l.nama_produk, p.satuan
  order by l.nama_produk;
$$;

-- ---------------------------------------------------------------------
-- RPC stok bahan (Owner/Admin)
-- ---------------------------------------------------------------------
-- Belanja: tambah stok + harga total -> harga rata-rata bergerak.
create or replace function public.add_ingredient_stock(p_ingredient_id uuid, p_qty numeric, p_total_harga bigint, p_catatan text default null)
returns numeric language plpgsql security definer set search_path = '' as $$
declare
  v public.ingredients;
  v_base numeric;
  v_stok numeric;
begin
  perform private.require_role('owner', 'admin');
  if p_qty is null or p_qty <= 0 then
    raise exception 'Jumlah belanja harus lebih dari 0' using errcode = '22023';
  end if;
  if p_total_harga is null or p_total_harga < 0 then
    raise exception 'Total harga belanja wajib diisi' using errcode = '22023';
  end if;
  select * into v from public.ingredients where id = p_ingredient_id for update;
  if not found then
    raise exception 'Bahan tidak ditemukan' using errcode = 'P0002';
  end if;
  v_base := greatest(v.stok, 0);
  update public.ingredients
     set cost_per_unit = round(((v_base * cost_per_unit) + p_total_harga) / (v_base + p_qty), 4)
   where id = p_ingredient_id;
  v_stok := private.move_ingredient_stock(p_ingredient_id, p_qty, 'belanja', 'ingredients', p_ingredient_id::text,
                                          nullif(btrim(coalesce(p_catatan, '')), ''));
  perform private.write_audit('bahan.belanja', 'bahan', p_ingredient_id::text, jsonb_build_object('stok', v.stok),
    jsonb_build_object('stok', v_stok, 'qty', p_qty, 'total_harga', p_total_harga), nullif(btrim(coalesce(p_catatan, '')), ''));
  return v_stok;
end;
$$;

create or replace function public.adjust_ingredient_stock(p_ingredient_id uuid, p_delta numeric, p_alasan text)
returns numeric language plpgsql security definer set search_path = '' as $$
declare
  v_alasan text := btrim(coalesce(p_alasan, ''));
  v_old numeric;
  v_stok numeric;
begin
  perform private.require_role('owner', 'admin');
  if p_delta is null or p_delta = 0 then
    raise exception 'Jumlah koreksi tidak boleh 0' using errcode = '22023';
  end if;
  if char_length(v_alasan) < 3 then
    raise exception 'Alasan koreksi wajib diisi' using errcode = '22023';
  end if;
  select stok into v_old from public.ingredients where id = p_ingredient_id for update;
  if not found then
    raise exception 'Bahan tidak ditemukan' using errcode = 'P0002';
  end if;
  v_stok := private.move_ingredient_stock(p_ingredient_id, p_delta, 'koreksi', 'ingredients', p_ingredient_id::text, v_alasan);
  perform private.write_audit('bahan.koreksi_stok', 'bahan', p_ingredient_id::text, jsonb_build_object('stok', v_old),
                              jsonb_build_object('stok', v_stok), v_alasan);
  return v_stok;
end;
$$;

-- Simpan resep lengkap (Owner): hasil per batch + daftar bahan.
create or replace function public.save_recipe(p_product_id uuid, p_yield numeric, p_items jsonb, p_catatan text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  perform private.require_role('owner');
  if p_yield is null or p_yield <= 0 then
    raise exception 'Hasil per batch harus lebih dari 0' using errcode = '22023';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Resep minimal berisi satu bahan' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_items) e where coalesce((e ->> 'qty')::numeric, 0) <= 0) then
    raise exception 'Takaran bahan harus lebih dari 0' using errcode = '22023';
  end if;
  if (select count(distinct e ->> 'ingredient_id') from jsonb_array_elements(p_items) e) <> jsonb_array_length(p_items) then
    raise exception 'Bahan yang sama tercantum dua kali' using errcode = '22023';
  end if;
  insert into public.recipes (product_id, yield_per_batch, catatan)
  values (p_product_id, p_yield, nullif(btrim(coalesce(p_catatan, '')), ''))
  on conflict (product_id) do update set yield_per_batch = excluded.yield_per_batch, catatan = excluded.catatan
  returning id into v_id;
  delete from public.recipe_items
   where recipe_id = v_id
     and ingredient_id not in (select (e ->> 'ingredient_id')::uuid from jsonb_array_elements(p_items) e);
  insert into public.recipe_items (recipe_id, ingredient_id, qty_per_batch)
  select v_id, (e ->> 'ingredient_id')::uuid, (e ->> 'qty')::numeric from jsonb_array_elements(p_items) e
  on conflict (recipe_id, ingredient_id) do update set qty_per_batch = excluded.qty_per_batch
    where public.recipe_items.qty_per_batch is distinct from excluded.qty_per_batch;
  return v_id;
end;
$$;

-- HPP bahan (khusus Owner).
create view public.biaya_bahan as
  select i.id, i.cost_per_unit from public.ingredients i where (select private.has_role('owner'));

-- ---------------------------------------------------------------------
-- RLS & hak akses
-- ---------------------------------------------------------------------
alter table public.ingredients     enable row level security;
alter table public.recipes         enable row level security;
alter table public.recipe_items    enable row level security;
alter table public.production_logs enable row level security;

create policy ingredients_select on public.ingredients for select to authenticated
  using ((select private.is_staff()));
create policy ingredients_insert on public.ingredients for insert to authenticated
  with check ((select private.has_role('owner', 'admin')));
create policy ingredients_update on public.ingredients for update to authenticated
  using ((select private.has_role('owner', 'admin')))
  with check ((select private.has_role('owner', 'admin')));

-- Resep: Owner penuh (tulis lewat save_recipe), Admin lihat. Admin Baking tidak.
create policy recipes_select on public.recipes for select to authenticated
  using ((select private.has_role('owner', 'admin')));
create policy recipe_items_select on public.recipe_items for select to authenticated
  using ((select private.has_role('owner', 'admin')));

-- Log produksi: Owner/Admin semua; Admin Baking hanya miliknya.
create policy production_logs_select on public.production_logs for select to authenticated
  using ((select private.has_role('owner', 'admin'))
         or ((select private.has_role('admin_baking')) and created_by = (select auth.uid())));

-- Stok bahan: Admin Baking boleh melihat pergerakan bahan (read-only).
drop policy stock_movements_select on public.stock_movements;
create policy stock_movements_select on public.stock_movements for select to authenticated
  using ((select private.has_role('owner', 'admin'))
         or ((select private.has_role('admin_baking')) and ingredient_id is not null));

revoke all on public.ingredients, public.recipes, public.recipe_items, public.production_logs, public.biaya_bahan
  from anon, authenticated;
grant select (id, nama, satuan, stok, min_stock, aktif, created_at, updated_at) on public.ingredients to authenticated;
grant insert (nama, satuan, min_stock, aktif), update (nama, satuan, min_stock, aktif) on public.ingredients to authenticated;
grant select on public.recipes, public.recipe_items to authenticated;
grant select (id, product_id, nama_produk, batches, total_output, bahan_kurang, status, created_by, created_at,
              cancelled_by, cancelled_at, alasan) on public.production_logs to authenticated;
grant select on public.biaya_bahan to authenticated;
-- Kolom HPP log produksi khusus Owner lewat view.
create view public.biaya_produksi as
  select l.id, l.hpp_snapshot, l.hpp_per_unit, l.bahan_snapshot
  from public.production_logs l where (select private.has_role('owner'));
revoke all on public.biaya_produksi from anon, authenticated;
grant select on public.biaya_produksi to authenticated;

revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function
  private.jwt_aal(), private.current_app_role(), private.has_role(public.app_role[]), private.is_staff()
to anon, authenticated;

revoke execute on function
  public.production_products(), public.production_preview(uuid, int), public.record_production(uuid, int),
  public.cancel_production(uuid, text), public.production_today(),
  public.add_ingredient_stock(uuid, numeric, bigint, text), public.adjust_ingredient_stock(uuid, numeric, text),
  public.save_recipe(uuid, numeric, jsonb, text)
from public, anon;
grant execute on function
  public.production_products(), public.production_preview(uuid, int), public.record_production(uuid, int),
  public.cancel_production(uuid, text), public.production_today(),
  public.add_ingredient_stock(uuid, numeric, bigint, text), public.adjust_ingredient_stock(uuid, numeric, text),
  public.save_recipe(uuid, numeric, jsonb, text)
to authenticated;

-- Nama staf (untuk menampilkan "diinput oleh"), tanpa data lain. Hanya staf.
create view public.nama_staf as
  select p.id, p.nama from public.profiles p
  where p.role <> 'member' and (select private.is_staff());
revoke all on public.nama_staf from anon, authenticated;
grant select on public.nama_staf to authenticated;
