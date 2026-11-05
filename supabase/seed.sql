-- =====================================================================
-- DATA CONTOH (khusus pengembangan lokal: `npx supabase db reset`)
-- Fase 1: satu akun per peran. Data produk/pesanan/biaya menyusul di fase
-- terkait.
--
--   owner@gutvibes.test   / Owner12345   (Owner — wajib 2FA saat masuk)
--   admin@gutvibes.test   / Admin12345   (Admin)
--   baking@gutvibes.test  / Baking12345  (Admin Baking)
--   member@gutvibes.test  / Member12345  (Member / pelanggan)
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
      ('00000000-0000-4000-a000-000000000004'::uuid, 'member@gutvibes.test', 'Member12345', 'Sari Member',        '081234567890', 'member'::public.app_role)
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
