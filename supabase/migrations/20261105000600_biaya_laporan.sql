-- =====================================================================
-- FASE 6 — BIAYA OPERASIONAL & LAPORAN (khusus Owner)
-- Kategori biaya, pengeluaran (+ foto nota, rincian gaji opsional),
-- biaya rutin bulanan, anggaran per kategori, tutup/buka periode,
-- laporan laba rugi (Pendapatan − HPP = Laba kotor − Biaya = Laba bersih),
-- ringkasan dashboard Owner.
-- =====================================================================

create table public.expense_categories (
  id      uuid primary key default gen_random_uuid(),
  nama    text not null unique check (char_length(btrim(nama)) between 1 and 60),
  urutan  int not null default 0,
  aktif   boolean not null default true
);
insert into public.expense_categories (nama, urutan) values
  ('Utilitas', 10), ('Tenaga kerja', 20), ('Pengiriman', 30), ('Tempat', 40),
  ('Pemasaran', 50), ('Peralatan', 60), ('Kemasan', 70), ('Lain-lain', 80);

create table public.recurring_expenses (
  id                 uuid primary key default gen_random_uuid(),
  nama               text not null check (char_length(btrim(nama)) between 1 and 80),
  category_id        uuid not null references public.expense_categories (id),
  nominal_perkiraan  bigint not null check (nominal_perkiraan >= 0),
  tanggal            int not null default 1 check (tanggal between 1 and 28),
  aktif              boolean not null default true,
  created_at         timestamptz not null default now()
);

create table public.expenses (
  id            uuid primary key default gen_random_uuid(),
  tanggal       date not null,
  periode       date generated always as (tanggal - (extract(day from tanggal)::int - 1)) stored,
  category_id   uuid not null references public.expense_categories (id),
  nominal       bigint not null check (nominal > 0 and nominal <= 10000000000),
  keterangan    text check (keterangan is null or char_length(keterangan) <= 500),
  nota_path     text,
  recurring_id  uuid references public.recurring_expenses (id) on delete set null,
  -- Rincian opsional (mis. gaji per orang): [{"nama": "...", "nominal": 123}]
  rincian       jsonb,
  created_by    uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index expenses_periode_idx on public.expenses (periode, category_id);
create index expenses_tanggal_idx on public.expenses (tanggal desc);
create unique index expenses_recurring_uq on public.expenses (recurring_id, periode) where recurring_id is not null;

create table public.budgets (
  periode      date not null check (periode = date_trunc('month', periode)::date),
  category_id  uuid not null references public.expense_categories (id) on delete cascade,
  nominal      bigint not null check (nominal >= 0),
  updated_at   timestamptz not null default now(),
  primary key (periode, category_id)
);

create table public.period_closings (
  periode      date primary key check (periode = date_trunc('month', periode)::date),
  status       text not null default 'ditutup' check (status in ('ditutup', 'dibuka')),
  closed_by    uuid references public.profiles (id) on delete set null,
  closed_at    timestamptz not null default now(),
  reopened_by  uuid references public.profiles (id) on delete set null,
  reopened_at  timestamptz,
  alasan_buka  text
);

-- ---------------------------------------------------------------------
-- Periode tertutup tidak bisa diubah
-- ---------------------------------------------------------------------
create or replace function private.period_is_closed(p_periode date)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.period_closings where periode = date_trunc('month', p_periode)::date and status = 'ditutup');
$$;

create or replace function private.expenses_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_sum bigint;
begin
  if tg_op in ('UPDATE', 'DELETE') and private.period_is_closed(old.tanggal) then
    raise exception 'Periode % sudah ditutup. Buka kembali periode untuk mengubah.', to_char(old.tanggal, 'MM/YYYY') using errcode = '42501';
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    if private.period_is_closed(new.tanggal) then
      raise exception 'Periode % sudah ditutup. Buka kembali periode untuk mencatat biaya.', to_char(new.tanggal, 'MM/YYYY') using errcode = '42501';
    end if;
    if new.rincian is not null then
      if jsonb_typeof(new.rincian) <> 'array' or jsonb_array_length(new.rincian) = 0 then
        new.rincian := null;
      else
        select coalesce(sum((e ->> 'nominal')::bigint), 0) into v_sum from jsonb_array_elements(new.rincian) e;
        if v_sum <> new.nominal then
          raise exception 'Jumlah rincian (%) harus sama dengan nominal (%)', v_sum, new.nominal using errcode = '22023';
        end if;
      end if;
    end if;
    if tg_op = 'UPDATE' then new.updated_at := now(); end if;
    return new;
  end if;
  return old;
end;
$$;
create trigger expenses_guard before insert or update or delete on public.expenses
for each row execute function private.expenses_guard();
create trigger expenses_audit after insert or update or delete on public.expenses
for each row execute function private.audit_row_change('biaya', 'tanggal', 'category_id', 'nominal', 'keterangan');

create or replace function private.budgets_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if private.period_is_closed(coalesce(new.periode, old.periode)) then
    raise exception 'Periode sudah ditutup' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger budgets_guard before insert or update or delete on public.budgets
for each row execute function private.budgets_guard();
create trigger budgets_audit after insert or update on public.budgets
for each row execute function private.audit_row_change('anggaran', 'periode', 'category_id', 'nominal');

-- ---------------------------------------------------------------------
-- Tutup / buka periode
-- ---------------------------------------------------------------------
create or replace function public.close_period(p_periode date)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_p date := date_trunc('month', p_periode)::date;
begin
  perform private.require_role('owner');
  if v_p >= date_trunc('month', (now() at time zone 'Asia/Jakarta'))::date then
    raise exception 'Hanya bulan yang sudah lewat yang bisa ditutup' using errcode = '22023';
  end if;
  insert into public.period_closings (periode, status, closed_by, closed_at)
  values (v_p, 'ditutup', auth.uid(), now())
  on conflict (periode) do update set status = 'ditutup', closed_by = auth.uid(), closed_at = now();
  perform private.write_audit('periode.tutup', 'periode', v_p::text, null, jsonb_build_object('status', 'ditutup'));
end;
$$;

create or replace function public.reopen_period(p_periode date, p_alasan text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_p date := date_trunc('month', p_periode)::date;
  v_alasan text := btrim(coalesce(p_alasan, ''));
begin
  perform private.require_role('owner');
  if char_length(v_alasan) < 3 then
    raise exception 'Alasan membuka kembali periode wajib diisi' using errcode = '22023';
  end if;
  update public.period_closings
     set status = 'dibuka', reopened_by = auth.uid(), reopened_at = now(), alasan_buka = v_alasan
   where periode = v_p and status = 'ditutup';
  if not found then
    raise exception 'Periode ini tidak sedang ditutup' using errcode = '22023';
  end if;
  perform private.write_audit('periode.buka_kembali', 'periode', v_p::text,
    jsonb_build_object('status', 'ditutup'), jsonb_build_object('status', 'dibuka'), v_alasan);
end;
$$;

-- ---------------------------------------------------------------------
-- Laporan laba rugi (berdasarkan tanggal pesanan selesai, WIB)
-- ---------------------------------------------------------------------
create or replace function private.pl_numbers(p_from date, p_to date)
returns jsonb language sql stable security definer set search_path = '' as $$
  with o as (
    select * from public.orders
    where status = 'selesai'
      and (completed_at at time zone 'Asia/Jakarta')::date between p_from and p_to
  ), items as (
    select i.* from public.order_items i join o on o.id = i.order_id
  ), sales as (
    select coalesce(sum(subtotal), 0)::bigint as penjualan_kotor,
           coalesce(sum(diskon), 0)::bigint as diskon,
           coalesce(sum(shipping_cost), 0)::bigint as ongkir,
           count(*)::int as jumlah_pesanan
    from o
  ), hpp as (
    select coalesce(round(sum(cost_snapshot * qty)), 0)::bigint as hpp from items
  ), opex as (
    select c.nama, coalesce(sum(e.nominal), 0)::bigint as total
    from public.expense_categories c
    left join public.expenses e on e.category_id = c.id and e.tanggal between p_from and p_to
    group by c.id, c.nama, c.urutan
    having coalesce(sum(e.nominal), 0) > 0
    order by total desc
  )
  select jsonb_build_object(
    'dari', p_from, 'sampai', p_to,
    'jumlah_pesanan', s.jumlah_pesanan,
    'penjualan_kotor', s.penjualan_kotor,
    'diskon', s.diskon,
    'penjualan_bersih', s.penjualan_kotor - s.diskon,
    'pendapatan_ongkir', s.ongkir,
    'pendapatan', s.penjualan_kotor - s.diskon + s.ongkir,
    'hpp', h.hpp,
    'laba_kotor', s.penjualan_kotor - s.diskon + s.ongkir - h.hpp,
    'biaya_operasional', (select coalesce(sum(total), 0) from opex),
    'biaya_per_kategori', coalesce((select jsonb_agg(jsonb_build_object('kategori', nama, 'total', total)) from opex), '[]'::jsonb),
    'laba_bersih', s.penjualan_kotor - s.diskon + s.ongkir - h.hpp - (select coalesce(sum(total), 0) from opex)
  )
  from sales s, hpp h;
$$;

create or replace function public.report_profit_loss(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v jsonb;
begin
  perform private.require_role('owner');
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 1100 then
    raise exception 'Rentang tanggal tidak valid (maks. 3 tahun)' using errcode = '22023';
  end if;
  v := private.pl_numbers(p_from, p_to);
  return v || jsonb_build_object(
    'per_produk', coalesce((
      select jsonb_agg(x order by (x ->> 'pendapatan')::bigint desc) from (
        select jsonb_build_object(
                 'nama', i.nama_produk,
                 'qty', sum(i.qty),
                 'pendapatan', sum(i.subtotal),
                 'hpp', round(sum(i.cost_snapshot * i.qty)),
                 'margin', sum(i.subtotal) - round(sum(i.cost_snapshot * i.qty)),
                 'margin_persen', case when sum(i.subtotal) > 0
                                       then round((sum(i.subtotal) - sum(i.cost_snapshot * i.qty)) * 100.0 / sum(i.subtotal), 1) end) as x
        from public.order_items i join public.orders o on o.id = i.order_id
        where o.status = 'selesai' and (o.completed_at at time zone 'Asia/Jakarta')::date between p_from and p_to
        group by i.nama_produk) t), '[]'::jsonb));
end;
$$;

-- ---------------------------------------------------------------------
-- Ringkasan dashboard Owner (bulan berjalan + tren 6 bulan)
-- ---------------------------------------------------------------------
create or replace function public.owner_dashboard(p_bulan date default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_start date := date_trunc('month', coalesce(p_bulan, (now() at time zone 'Asia/Jakarta')::date))::date;
  v_end date := (v_start + interval '1 month - 1 day')::date;
  v_now jsonb;
begin
  perform private.require_role('owner');
  v_now := private.pl_numbers(v_start, v_end);
  return jsonb_build_object(
    'bulan', v_start,
    'ringkasan', v_now,
    'tren', (select jsonb_agg(jsonb_build_object(
                'bulan', m.bulan,
                'pendapatan', (x.p ->> 'pendapatan')::bigint,
                'total_biaya', (x.p ->> 'hpp')::bigint + (x.p ->> 'biaya_operasional')::bigint,
                'laba_bersih', (x.p ->> 'laba_bersih')::bigint) order by m.bulan)
             from (select gs::date as bulan from generate_series(v_start - interval '5 months', v_start, interval '1 month') gs) m,
                  lateral (select private.pl_numbers(m.bulan, (m.bulan + interval '1 month - 1 day')::date) as p) x),
    'anggaran', coalesce((
      select jsonb_agg(jsonb_build_object('kategori', c.nama, 'anggaran', b.nominal,
                                          'realisasi', coalesce((select sum(e.nominal) from public.expenses e
                                                                 where e.category_id = c.id and e.periode = v_start), 0))
                       order by c.urutan)
      from public.budgets b join public.expense_categories c on c.id = b.category_id
      where b.periode = v_start), '[]'::jsonb),
    'biaya_terbesar', coalesce((
      select jsonb_agg(jsonb_build_object('tanggal', e.tanggal, 'kategori', c.nama, 'keterangan', e.keterangan, 'nominal', e.nominal)
                       order by e.nominal desc)
      from (select * from public.expenses where periode = v_start order by nominal desc limit 5) e
      join public.expense_categories c on c.id = e.category_id), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- RLS & hak akses: semua khusus Owner (2FA)
-- ---------------------------------------------------------------------
alter table public.expense_categories enable row level security;
alter table public.recurring_expenses enable row level security;
alter table public.expenses           enable row level security;
alter table public.budgets            enable row level security;
alter table public.period_closings    enable row level security;

create policy expense_categories_owner on public.expense_categories for all to authenticated
  using ((select private.has_role('owner'))) with check ((select private.has_role('owner')));
create policy recurring_expenses_owner on public.recurring_expenses for all to authenticated
  using ((select private.has_role('owner'))) with check ((select private.has_role('owner')));
create policy expenses_owner on public.expenses for all to authenticated
  using ((select private.has_role('owner'))) with check ((select private.has_role('owner')));
create policy budgets_owner on public.budgets for all to authenticated
  using ((select private.has_role('owner'))) with check ((select private.has_role('owner')));
create policy period_closings_select on public.period_closings for select to authenticated
  using ((select private.has_role('owner')));

revoke all on public.expense_categories, public.recurring_expenses, public.expenses, public.budgets, public.period_closings
  from anon, authenticated;
grant select, insert (nama, urutan, aktif), update (nama, urutan, aktif) on public.expense_categories to authenticated;
grant select, insert (nama, category_id, nominal_perkiraan, tanggal, aktif),
      update (nama, category_id, nominal_perkiraan, tanggal, aktif), delete on public.recurring_expenses to authenticated;
grant select, insert (tanggal, category_id, nominal, keterangan, nota_path, recurring_id, rincian),
      update (tanggal, category_id, nominal, keterangan, nota_path, rincian), delete on public.expenses to authenticated;
grant select, insert (periode, category_id, nominal), update (nominal), delete on public.budgets to authenticated;
grant select on public.period_closings to authenticated;

revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function
  private.jwt_aal(), private.current_app_role(), private.has_role(public.app_role[]), private.is_staff()
to anon, authenticated;

revoke execute on function public.close_period(date), public.reopen_period(date, text),
  public.report_profit_loss(date, date), public.owner_dashboard(date) from public, anon;
grant execute on function public.close_period(date), public.reopen_period(date, text),
  public.report_profit_loss(date, date), public.owner_dashboard(date) to authenticated;

-- Foto nota (privat, Owner).
do $$
begin
  if exists (select 1 from pg_tables where schemaname = 'storage' and tablename = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('nota', 'nota', false, 3145728, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
    on conflict (id) do nothing;
    execute $p$create policy "nota: owner lihat" on storage.objects for select to authenticated
      using (bucket_id = 'nota' and (select private.has_role('owner')))$p$;
    execute $p$create policy "nota: owner unggah" on storage.objects for insert to authenticated
      with check (bucket_id = 'nota' and (select private.has_role('owner')))$p$;
  end if;
end;
$$;
