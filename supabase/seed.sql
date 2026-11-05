-- =====================================================================
-- DATA CONTOH (khusus pengembangan lokal: `npx supabase db reset`)
-- Fase 1: akun per peran. Fase 2: kategori, 6 produk, promo, konten web,
-- 30 pesanan campuran tamu & member.
--
--   owner@gutvibes.test   / Owner12345   (Owner — wajib 2FA saat masuk)
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
            case when v_status = 'selesai' then v_created + interval '1 day' end,
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
