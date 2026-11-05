-- =====================================================================
-- DATA CONTOH (khusus pengembangan lokal: `npx supabase db reset`)
-- Fase 1: akun per peran. Fase 2: kategori, 6 produk, promo, konten web,
-- 30 pesanan campuran tamu & member.
--
--   owner@gutvibes.test   / Owner12345   (Owner)
--   admin@gutvibes.test   / Admin12345   (Admin)
--   baking@gutvibes.test  / Baking12345  (Admin Baking)
--   member@gutvibes.test  / Member12345  (Member / pelanggan)
--   budi@gutvibes.test    / Member12345  (Member kedua)
--
-- JANGAN jalankan di produksi.
-- =====================================================================
do $$
declare
  r record;
  v_id uuid;
begin
  for r in
    select * from (values
      ('00000000-0000-4000-a000-000000000001'::uuid, 'owner@gutvibes.test',  'Owner12345',  'Nadia (Owner)',      '081200000001', 'owner'::public.app_role),
      ('00000000-0000-4000-a000-000000000002'::uuid, 'admin@gutvibes.test',  'Admin12345',  'Rina (Admin)',       '081200000002', 'admin'::public.app_role),
      ('00000000-0000-4000-a000-000000000003'::uuid, 'baking@gutvibes.test', 'Baking12345', 'Joko (Admin Baking)', '081200000003', 'admin_baking'::public.app_role),
      ('00000000-0000-4000-a000-000000000004'::uuid, 'member@gutvibes.test', 'Member12345', 'Sari Member',        '081234567890', 'member'::public.app_role),
      ('00000000-0000-4000-a000-000000000005'::uuid, 'budi@gutvibes.test',   'Member12345', 'Budi Santoso',       '081298765432', 'member'::public.app_role)
    ) as t(id, email, pw, nama, hp, role)
  loop
    if exists (select 1 from auth.users where email = r.email) then
      continue;
    end if;
    v_id := r.id;
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) values (
      '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', r.email,
      extensions.crypt(r.pw, extensions.gen_salt('bf')), now(),
      '', '', '', '',
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('nama', r.nama, 'no_hp', r.hp),
      now(), now()
    );
    insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), v_id::text, v_id,
            jsonb_build_object('sub', v_id::text, 'email', r.email, 'email_verified', true),
            'email', now(), now(), now());
    if r.role <> 'member' then
      update public.profiles set role = r.role where id = v_id;
    end if;
  end loop;
end;
$$;

-- Contoh alamat untuk member
insert into public.addresses (user_id, label, penerima, no_hp, alamat, catatan, is_default)
select '00000000-0000-4000-a000-000000000004', 'Rumah', 'Sari Member', '081234567890',
       'Jl. Melati No. 12, Kel. Sukamaju, Kec. Cibeunying, Bandung', 'Pagar hijau', true
where not exists (select 1 from public.addresses where user_id = '00000000-0000-4000-a000-000000000004');

-- =====================================================================
-- FASE 2: katalog, promo, konten web, 30 pesanan
-- =====================================================================
insert into public.categories (id, nama, slug, urutan) values
  ('c1000000-0000-4000-8000-000000000001', 'Pastry', 'pastry', 10),
  ('c1000000-0000-4000-8000-000000000002', 'Roti', 'roti', 20),
  ('c1000000-0000-4000-8000-000000000003', 'Cake', 'cake', 30),
  ('c1000000-0000-4000-8000-000000000004', 'Kue Kering', 'kue-kering', 40)
on conflict (id) do nothing;

insert into public.products (id, category_id, nama, slug, deskripsi, harga, satuan, sale_mode, stok, cost_per_unit, urutan) values
  ('b1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'Soes Vla', 'soes-vla',
   'Kulit soes renyah dengan vla vanila lembut. Dipanggang setiap pagi — 1 batch 70 pcs.', 3500, 'pcs', 'ready_stock', 140, 1400, 10),
  ('b1000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000001', 'Croissant Butter', 'croissant-butter',
   'Croissant berlapis dengan butter premium, renyah di luar dan lembut di dalam.', 18000, 'pcs', 'ready_stock', 24, 8500, 20),
  ('b1000000-0000-4000-8000-000000000003', 'c1000000-0000-4000-8000-000000000002', 'Roti Sobek Cokelat', 'roti-sobek-cokelat',
   'Roti sobek empuk isi cokelat lumer. Isi 9 potong per loyang.', 38000, 'loyang', 'ready_stock', 12, 15000, 10),
  ('b1000000-0000-4000-8000-000000000004', 'c1000000-0000-4000-8000-000000000003', 'Brownies Panggang', 'brownies-panggang',
   'Brownies fudgy dengan dark chocolate dan kulit atas yang crinkly. Ukuran 20x20 cm.', 65000, 'loyang', 'ready_stock', 8, 26000, 20),
  ('b1000000-0000-4000-8000-000000000005', 'c1000000-0000-4000-8000-000000000003', 'Bolu Pandan Klasik', 'bolu-pandan-klasik',
   'Bolu pandan wangi dari daun pandan asli. Pre-order minimal H-1.', 85000, 'loyang', 'preorder', 0, 32000, 10),
  ('b1000000-0000-4000-8000-000000000006', 'c1000000-0000-4000-8000-000000000004', 'Nastar Premium', 'nastar-premium',
   'Nastar butter dengan selai nanas homemade. Toples 500 gram. Pre-order.', 125000, 'toples', 'preorder', 0, 55000, 10)
on conflict (id) do nothing;

insert into public.promos (kode, nama, tipe, nilai, min_belanja, maks_diskon, selesai)
values ('MANIS10', 'Diskon 10% pelanggan baru', 'persen', 10, 75000, 25000, now() + interval '60 days')
on conflict (kode) do nothing;

update public.site_content set value = v.value from (values
  ('lokasi.alamat', 'Jl. Cihampelas No. 88, Bandung 40131'),
  ('lokasi.jam_buka', E'Selasa–Minggu: 08.00–18.00\nSenin: tutup'),
  ('kontak.whatsapp', '081200000099'),
  ('kontak.instagram', 'gutvibes.bakehouse'),
  ('pembayaran.instruksi', E'Transfer ke BCA 1234567890 a.n. GutVibes Bakehouse.\nCantumkan kode pesanan di berita transfer.'),
  ('cerita.isi', E'GutVibes lahir dari dapur rumah dan resep keluarga.\n\nKami memanggang dalam jumlah kecil setiap hari dengan butter asli, telur segar, dan tanpa pengawet, supaya setiap gigitan terasa seperti buatan rumah.')
) as v(key, value)
where site_content.key = v.key and site_content.value = '' or (site_content.key = v.key and v.key in ('cerita.isi', 'pembayaran.instruksi'));

do $$
declare
  guests text[][] := array[
    array['Dewi Lestari', '6281311110001'], array['Andi Pratama', '6281311110002'], array['Maya Sari', '6281311110003'],
    array['Rizky Ramadhan', '6281311110004'], array['Nina Kartika', '6281311110005'], array['Fajar Nugroho', '6281311110006'],
    array['Lina Marlina', '6281311110007'], array['Yoga Saputra', '6281311110008']];
  prods uuid[] := array['b1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000002',
                        'b1000000-0000-4000-8000-000000000003', 'b1000000-0000-4000-8000-000000000004',
                        'b1000000-0000-4000-8000-000000000005', 'b1000000-0000-4000-8000-000000000006']::uuid[];
  i int; k int;
  v_nama text; v_phone text; v_user uuid;
  v_cust uuid; v_order uuid;
  v_created timestamptz; v_status public.order_status;
  v_ful public.fulfillment; v_ship bigint; v_sub bigint; v_p public.products; v_qty int;
begin
  if exists (select 1 from public.orders where kode like 'GV-%-S%') then return; end if;
  for i in 1..30 loop
    if i % 3 = 0 then
      v_nama := 'Sari Member'; v_phone := '6281234567890'; v_user := '00000000-0000-4000-a000-000000000004';
    elsif i % 5 = 0 then
      v_nama := 'Budi Santoso'; v_phone := '6281298765432'; v_user := '00000000-0000-4000-a000-000000000005';
    else
      v_nama := guests[1 + (i * 7) % 8][1]; v_phone := guests[1 + (i * 7) % 8][2]; v_user := null;
    end if;

    select id into v_cust from public.customers where phone_normalized = v_phone;
    if v_cust is null then
      insert into public.customers (user_id, nama, phone_normalized) values (v_user, v_nama, v_phone) returning id into v_cust;
    end if;

    v_created := date_trunc('hour', now()) - make_interval(days => (30 - i) * 3, hours => (i * 5) % 9);
    v_status := case
      when i = 27 then 'dibatalkan'
      when i = 28 then 'dikonfirmasi'
      when i = 29 then 'siap'
      when i = 30 then 'menunggu_konfirmasi'
      when i % 11 = 0 then 'dibatalkan'
      else 'selesai' end;
    if i between 23 and 26 then v_created := date_trunc('hour', now()) - make_interval(days => 27 - i, hours => 2); end if;
    if i >= 28 then v_created := now() - make_interval(hours => (31 - i) * 3); end if;
    v_ful := case when i % 2 = 0 then 'antar' else 'ambil' end;
    v_ship := case when v_ful = 'antar' then 10000 + (i % 3) * 5000 else 0 end;

    insert into public.orders (kode, customer_id, user_id, nama_pemesan, no_hp, status, fulfillment, jadwal, alamat_antar,
                               subtotal, shipping_cost, ongkir_diset, courier_name, payment_status, stok_dipotong,
                               created_at, confirmed_at, ready_at, completed_at, cancelled_at, alasan_batal)
    values ('GV-' || to_char(v_created at time zone 'Asia/Jakarta', 'YYMMDD') || '-S' || lpad(i::text, 3, '0'),
            v_cust, v_user, v_nama, v_phone, v_status, v_ful, v_created + interval '1 day',
            case when v_ful = 'antar' then 'Jl. Contoh No. ' || i || ', Bandung' end,
            0, case when v_status = 'menunggu_konfirmasi' then 0 else v_ship end,
            v_ful = 'ambil' or v_status <> 'menunggu_konfirmasi',
            case when v_ful = 'antar' and v_status in ('siap', 'selesai') then 'GoSend' end,
            case when v_status in ('menunggu_konfirmasi') or (v_status = 'dibatalkan' and i = 27) then 'belum_bayar'::public.payment_status else 'lunas' end,
            false, v_created,
            case when v_status in ('dikonfirmasi', 'siap', 'selesai') then v_created + interval '1 hour' end,
            case when v_status in ('siap', 'selesai') then v_created + interval '20 hours' end,
            case when v_status = 'selesai' then least(v_created + interval '1 day', now() - interval '1 hour') end,
            case when v_status = 'dibatalkan' then v_created + interval '2 hours' end,
            case when v_status = 'dibatalkan' then 'Pelanggan membatalkan' end)
    returning id into v_order;

    v_sub := 0;
    for k in 0..(i % 3) loop
      select * into v_p from public.products where id = prods[1 + (i + k * 2) % 6];
      v_qty := case when v_p.slug = 'soes-vla' then 10 + (i % 4) * 5 else 1 + (i + k) % 2 end;
      insert into public.order_items (order_id, product_id, nama_produk, satuan, sale_mode, harga, qty, cost_snapshot)
      values (v_order, v_p.id, v_p.nama, v_p.satuan, v_p.sale_mode, v_p.harga, v_qty, v_p.cost_per_unit)
      on conflict do nothing;
      v_sub := v_sub + v_p.harga * v_qty;
    end loop;
    update public.orders set subtotal = v_sub where id = v_order;
  end loop;
end;
$$;

-- =====================================================================
-- FASE 3: worker WhatsApp lokal (Vault). Secret harus sama dengan
-- WA_WORKER_SECRET di supabase/functions/.env.
-- =====================================================================
do $$
begin
  if to_regnamespace('vault') is not null then
    if not exists (select 1 from vault.secrets where name = 'wa_worker_url') then
      perform vault.create_secret('http://kong:8000/functions/v1/whatsapp-worker', 'wa_worker_url');
    end if;
    if not exists (select 1 from vault.secrets where name = 'wa_worker_secret') then
      perform vault.create_secret('local-dev-worker-secret', 'wa_worker_secret');
    end if;
  end if;
end;
$$;
update public.app_settings set value = '"http://localhost:5173"' where key = 'toko.url_situs';

-- =====================================================================
-- FASE 4: 12 bahan baku, resep 6 produk, contoh produksi
-- =====================================================================
insert into public.ingredients (id, nama, satuan, stok, min_stock, cost_per_unit) values
  ('d1000000-0000-4000-8000-000000000001', 'Tepung terigu', 'gram', 25000, 5000, 14),
  ('d1000000-0000-4000-8000-000000000002', 'Gula pasir', 'gram', 12000, 3000, 16),
  ('d1000000-0000-4000-8000-000000000003', 'Butter', 'gram', 6000, 2000, 120),
  ('d1000000-0000-4000-8000-000000000004', 'Telur', 'butir', 120, 30, 2200),
  ('d1000000-0000-4000-8000-000000000005', 'Susu cair', 'ml', 8000, 2000, 20),
  ('d1000000-0000-4000-8000-000000000006', 'Cokelat batang', 'gram', 1500, 1000, 150),
  ('d1000000-0000-4000-8000-000000000007', 'Daun pandan', 'lembar', 60, 20, 500),
  ('d1000000-0000-4000-8000-000000000008', 'Selai nanas', 'gram', 2500, 1000, 60),
  ('d1000000-0000-4000-8000-000000000009', 'Ragi instan', 'gram', 40, 50, 100),
  ('d1000000-0000-4000-8000-000000000010', 'Garam', 'gram', 1000, 100, 5),
  ('d1000000-0000-4000-8000-000000000011', 'Tepung maizena', 'gram', 3000, 500, 25),
  ('d1000000-0000-4000-8000-000000000012', 'Vanili bubuk', 'gram', 0, 20, 300)
on conflict (id) do nothing;

do $$
declare
  r record;
begin
  if exists (select 1 from public.recipes) then return; end if;
  for r in select * from (values
    ('b1000000-0000-4000-8000-000000000001'::uuid, 70::numeric, '[{"i":"01","q":500},{"i":"03","q":400},{"i":"04","q":16},{"i":"05","q":1500},{"i":"02","q":350},{"i":"11","q":150},{"i":"10","q":5},{"i":"12","q":10}]'),
    ('b1000000-0000-4000-8000-000000000002', 24, '[{"i":"01","q":1000},{"i":"03","q":600},{"i":"02","q":120},{"i":"09","q":15},{"i":"05","q":400},{"i":"10","q":20},{"i":"04","q":2}]'),
    ('b1000000-0000-4000-8000-000000000003', 4, '[{"i":"01","q":1000},{"i":"02","q":150},{"i":"09","q":15},{"i":"05","q":500},{"i":"03","q":100},{"i":"04","q":3},{"i":"06","q":300},{"i":"10","q":10}]'),
    ('b1000000-0000-4000-8000-000000000004', 2, '[{"i":"06","q":500},{"i":"03","q":300},{"i":"02","q":400},{"i":"04","q":8},{"i":"01","q":200}]'),
    ('b1000000-0000-4000-8000-000000000005', 2, '[{"i":"01","q":300},{"i":"02","q":300},{"i":"04","q":10},{"i":"07","q":20},{"i":"05","q":200},{"i":"03","q":150},{"i":"11","q":50}]'),
    ('b1000000-0000-4000-8000-000000000006', 4, '[{"i":"01","q":1000},{"i":"03","q":700},{"i":"02","q":150},{"i":"04","q":4},{"i":"08","q":800},{"i":"11","q":100},{"i":"12","q":5}]')
  ) as t(product_id, yield, items) loop
    insert into public.recipes (product_id, yield_per_batch) values (r.product_id, r.yield);
    insert into public.recipe_items (recipe_id, ingredient_id, qty_per_batch)
    select (select id from public.recipes where product_id = r.product_id),
           ('d1000000-0000-4000-8000-0000000000' || (e ->> 'i'))::uuid, (e ->> 'q')::numeric
    from jsonb_array_elements(r.items::jsonb) e;
  end loop;

  -- Contoh produksi hari ini oleh Admin Baking (memakai RPC asli).
  perform set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-4000-a000-000000000003', 'role', 'authenticated')::text, true);
  perform public.record_production('b1000000-0000-4000-8000-000000000001', 1);
  perform public.record_production('b1000000-0000-4000-8000-000000000004', 1);
  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- =====================================================================
-- FASE 5: stamp untuk pesanan member yang sudah selesai (tanpa WhatsApp)
-- =====================================================================
do $$
declare
  v_id uuid;
begin
  if exists (select 1 from public.stamps) then return; end if;
  update public.app_settings set value = 'false' where key = 'whatsapp.aktif';
  for v_id in select id from public.orders where status = 'selesai' and user_id is not null order by completed_at loop
    perform private.award_stamp(v_id);
  end loop;
  update public.app_settings set value = 'true' where key = 'whatsapp.aktif';
end;
$$;

-- =====================================================================
-- FASE 6: biaya 3 bulan, biaya rutin, anggaran bulan ini
-- =====================================================================
do $$
declare
  v_now date := (now() at time zone 'Asia/Jakarta')::date;
  v_bulan date;
  i int;
  cat record;
  v_sewa uuid; v_listrik uuid; v_gaji uuid;
begin
  if exists (select 1 from public.expenses) then return; end if;
  select id into cat from public.expense_categories where nama = 'Tempat';
  insert into public.recurring_expenses (nama, category_id, nominal_perkiraan, tanggal)
  values ('Sewa tempat', (select id from public.expense_categories where nama = 'Tempat'), 350000, 1) returning id into v_sewa;
  insert into public.recurring_expenses (nama, category_id, nominal_perkiraan, tanggal)
  values ('Listrik & air', (select id from public.expense_categories where nama = 'Utilitas'), 120000, 10) returning id into v_listrik;
  insert into public.recurring_expenses (nama, category_id, nominal_perkiraan, tanggal)
  values ('Gaji karyawan', (select id from public.expense_categories where nama = 'Tenaga kerja'), 400000, 25) returning id into v_gaji;

  for i in reverse 2..0 loop
    v_bulan := (date_trunc('month', v_now) - make_interval(months => i))::date;
    insert into public.expenses (tanggal, category_id, nominal, keterangan, recurring_id)
    values (v_bulan, (select id from public.expense_categories where nama = 'Tempat'), 350000, 'Sewa tempat', v_sewa);
    if i > 0 or extract(day from v_now) >= 10 then
      insert into public.expenses (tanggal, category_id, nominal, keterangan, recurring_id)
      values (v_bulan + 9, (select id from public.expense_categories where nama = 'Utilitas'), 110000 + i * 8000, 'Listrik & air', v_listrik);
    end if;
    if i > 0 then
      insert into public.expenses (tanggal, category_id, nominal, keterangan, recurring_id, rincian)
      values (v_bulan + 24, (select id from public.expense_categories where nama = 'Tenaga kerja'), 400000, 'Gaji karyawan', v_gaji,
              '[{"nama": "Joko (baking)", "nominal": 250000}, {"nama": "Rina (admin)", "nominal": 150000}]');
    end if;
    insert into public.expenses (tanggal, category_id, nominal, keterangan) values
      (least(v_bulan + 4, v_now), (select id from public.expense_categories where nama = 'Kemasan'), 60000 + i * 5000, 'Box kue & stiker'),
      (least(v_bulan + 12, v_now), (select id from public.expense_categories where nama = 'Pemasaran'), 50000, 'Iklan Instagram'),
      (least(v_bulan + 15, v_now), (select id from public.expense_categories where nama = 'Pengiriman'), 45000 - i * 5000, 'Kurir gratis ongkir'),
      (least(v_bulan + 3, v_now), (select id from public.expense_categories where nama = 'Lain-lain'), 25000, 'Gas LPG');
  end loop;
  insert into public.expenses (tanggal, category_id, nominal, keterangan)
  values ((date_trunc('month', v_now) - interval '1 month')::date + 6, (select id from public.expense_categories where nama = 'Peralatan'), 150000, 'Spatula & loyang');

  insert into public.budgets (periode, category_id, nominal)
  select date_trunc('month', v_now)::date, c.id, b.nominal
  from (values ('Tempat', 350000), ('Utilitas', 125000), ('Tenaga kerja', 400000), ('Kemasan', 55000),
               ('Pemasaran', 80000), ('Pengiriman', 40000), ('Lain-lain', 30000)) as b(nama, nominal)
  join public.expense_categories c on c.nama = b.nama;

  insert into public.period_closings (periode, status, closed_at)
  values ((date_trunc('month', v_now) - interval '2 months')::date, 'ditutup', now());
end;
$$;
