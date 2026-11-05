-- =====================================================================
-- FASE 3 — NOTIFIKASI WHATSAPP
-- Template per tahap, antrean whatsapp_messages (pending -> mengirim ->
-- terkirim | gagal), coba ulang maks. 3x, jeda & batas per menit.
-- Pengiriman dilakukan Edge Function `whatsapp-worker` lewat antarmuka
-- penyedia (Fonnte sekarang; bisa diganti WhatsApp API resmi).
--
-- Prinsip: pesanan TIDAK PERNAH gagal karena WhatsApp. Antrean ditulis di
-- transaksi yang sama; pengiriman terjadi terpisah (asinkron).
-- Pesan hanya transaksional dan tanpa data sensitif (tanpa alamat/HP).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Pengaturan tambahan
-- ---------------------------------------------------------------------
insert into public.app_settings (key, value, tipe, opsi, label, deskripsi, kategori, urutan, is_public) values
  ('toko.url_situs', '"http://localhost:5173"', 'teks', '{"maks_panjang": 120}', 'Alamat website',
   'Dipakai untuk tautan lacak di pesan WhatsApp. Contoh: https://gutvibes.id', 'Toko', 40, false),
  ('whatsapp.aktif', 'true', 'boolean', '{}', 'Kirim notifikasi WhatsApp otomatis',
   'Matikan sementara bila perangkat Fonnte bermasalah. Pesanan tetap tersimpan.', 'WhatsApp', 10, false),
  ('whatsapp.jeda_detik', '3', 'angka', '{"min": 1, "max": 30, "bulat": true, "satuan": "detik"}', 'Jeda antarpesan',
   'Jeda antar pengiriman agar nomor tidak dianggap spam.', 'WhatsApp', 20, false),
  ('whatsapp.maks_per_menit', '20', 'angka', '{"min": 1, "max": 60, "bulat": true, "satuan": "pesan/menit"}', 'Batas kirim per menit',
   null, 'WhatsApp', 30, false);

-- ---------------------------------------------------------------------
-- Template
-- ---------------------------------------------------------------------
create table public.whatsapp_templates (
  tahap       text primary key check (tahap ~ '^[a-z_]+$'),
  judul       text not null,
  isi         text not null check (char_length(isi) between 1 and 2000),
  aktif       boolean not null default true,
  urutan      int not null default 0,
  updated_by  uuid references public.profiles (id) on delete set null,
  updated_at  timestamptz not null default now()
);

-- Variabel yang boleh dipakai di template.
create or replace function private.wa_allowed_vars()
returns text[] language sql immutable set search_path = '' as $$
  select array['nama', 'toko', 'kode', 'item', 'total', 'jadwal', 'metode', 'tautan_lacak', 'kurir', 'alasan'];
$$;

create or replace function private.whatsapp_templates_before_update()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_var text;
begin
  new.isi := btrim(new.isi);
  for v_var in select (regexp_matches(new.isi, '\{([^{}]*)\}', 'g'))[1] loop
    if not (v_var = any (private.wa_allowed_vars())) then
      raise exception 'Variabel {%} tidak dikenal. Gunakan: %', v_var,
        array_to_string(array(select '{' || x || '}' from unnest(private.wa_allowed_vars()) x), ', ')
        using errcode = '22023';
    end if;
  end loop;
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;
create trigger whatsapp_templates_before_update before update on public.whatsapp_templates
for each row execute function private.whatsapp_templates_before_update();
create trigger whatsapp_templates_audit after update on public.whatsapp_templates
for each row execute function private.audit_row_change('template_wa', 'isi', 'aktif');

insert into public.whatsapp_templates (tahap, judul, urutan, isi) values
('pesanan_diterima', 'Pesanan diterima', 10,
$t$Halo {nama}, terima kasih sudah memesan di {toko}! 🧁

Kode pesanan: *{kode}*
{item}
Total: *{total}*
{metode}: {jadwal}

Kami akan segera mengonfirmasi pesanan & pembayaran Anda.
Lacak pesanan: {tautan_lacak}$t$),
('pembayaran_dikonfirmasi', 'Pembayaran dikonfirmasi', 20,
$t$Pembayaran pesanan *{kode}* sudah kami terima ✅
Total: {total}

Pesanan sedang kami siapkan untuk {metode}: {jadwal}.
Lacak: {tautan_lacak}$t$),
('pesanan_siap', 'Siap diambil / dikirim', 30,
$t$Kabar baik, {nama}! Pesanan *{kode}* sudah siap ({metode}). 🎉
Jadwal: {jadwal}
Kurir: {kurir}

Lacak: {tautan_lacak}$t$),
('pesanan_selesai', 'Pesanan selesai', 40,
$t$Pesanan *{kode}* sudah selesai. Terima kasih sudah berbelanja di {toko}, semoga suka! 💛$t$),
('pesanan_dibatalkan', 'Pesanan dibatalkan', 50,
$t$Mohon maaf {nama}, pesanan *{kode}* dibatalkan.
Alasan: {alasan}

Silakan balas pesan ini bila ada pertanyaan.$t$);

-- ---------------------------------------------------------------------
-- Antrean pesan
-- ---------------------------------------------------------------------
create table public.whatsapp_messages (
  id                   uuid primary key default gen_random_uuid(),
  order_id             uuid references public.orders (id) on delete set null,
  customer_id          uuid references public.customers (id) on delete set null,
  tahap                text not null,
  to_phone             text not null check (to_phone ~ '^628[0-9]{7,12}$'),
  body                 text not null check (char_length(body) between 1 and 4000),
  status               text not null default 'pending' check (status in ('pending', 'mengirim', 'terkirim', 'gagal')),
  attempts             int not null default 0,
  max_attempts         int not null default 3 check (max_attempts between 1 and 10),
  next_attempt_at      timestamptz not null default now(),
  last_attempt_at      timestamptz,
  locked_at            timestamptz,
  last_error           text,
  provider             text,
  provider_message_id  text,
  sent_at              timestamptz,
  created_by           uuid default auth.uid(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
-- Satu pesan per tahap per pesanan (idempoten).
create unique index whatsapp_messages_order_tahap_uq on public.whatsapp_messages (order_id, tahap) where order_id is not null;
create index whatsapp_messages_queue_idx on public.whatsapp_messages (status, next_attempt_at);
create index whatsapp_messages_created_idx on public.whatsapp_messages (created_at desc);
create index whatsapp_messages_attempt_idx on public.whatsapp_messages (last_attempt_at);

create trigger whatsapp_messages_touch before update on public.whatsapp_messages
for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------
-- Render
-- ---------------------------------------------------------------------
create or replace function private.format_jadwal(p_ts timestamptz)
returns text language sql immutable set search_path = '' as $$
  select (array['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'])[extract(dow from p_ts at time zone 'Asia/Jakarta')::int + 1]
         || ', ' || extract(day from p_ts at time zone 'Asia/Jakarta')::int || ' '
         || (array['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'])[extract(month from p_ts at time zone 'Asia/Jakarta')::int]
         || ' ' || extract(year from p_ts at time zone 'Asia/Jakarta')::int
         || ', ' || to_char(p_ts at time zone 'Asia/Jakarta', 'HH24.MI') || ' WIB';
$$;

create or replace function private.render_template(p_isi text, p_vars jsonb)
returns text language plpgsql immutable set search_path = '' as $$
declare
  v_out text := p_isi;
  v_key text;
  v_val text;
begin
  for v_key, v_val in select key, value from jsonb_each_text(p_vars) loop
    v_out := replace(v_out, '{' || v_key || '}', coalesce(v_val, ''));
  end loop;
  return v_out;
end;
$$;

create or replace function private.order_template_vars(p_order_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'nama', o.nama_pemesan,
    'toko', coalesce(private.setting('toko.nama') #>> '{}', 'GutVibes'),
    'kode', o.kode,
    'item', (select string_agg('• ' || i.nama_produk || ' ×' || i.qty, E'\n' order by i.nama_produk)
               from public.order_items i where i.order_id = o.id),
    'total', private.rupiah(o.total) || case when o.fulfillment = 'antar' and not o.ongkir_diset then ' + ongkir' else '' end,
    'jadwal', private.format_jadwal(o.jadwal),
    'metode', case o.fulfillment when 'antar' then 'diantar' else 'ambil di toko' end,
    'tautan_lacak', rtrim(coalesce(private.setting('toko.url_situs') #>> '{}', ''), '/') || '/lacak/' || o.tracking_code,
    'kurir', coalesce(o.courier_name, '-'),
    'alasan', coalesce(o.alasan_batal, '-')
  )
  from public.orders o where o.id = p_order_id;
$$;

-- Bangunkan worker lewat pg_net (bila dikonfigurasi). Tidak pernah gagal.
create or replace function private.kick_whatsapp_worker()
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_url text;
  v_secret text;
begin
  if to_regnamespace('net') is null or to_regnamespace('vault') is null then
    return;
  end if;
  execute $q$select (select decrypted_secret from vault.decrypted_secrets where name = 'wa_worker_url' limit 1),
                    (select decrypted_secret from vault.decrypted_secrets where name = 'wa_worker_secret' limit 1)$q$
    into v_url, v_secret;
  if v_url is null or v_secret is null then
    return;
  end if;
  execute 'select net.http_post(url := $1, headers := $2, body := $3, timeout_milliseconds := 2000)'
    using v_url, jsonb_build_object('Content-Type', 'application/json', 'x-worker-secret', v_secret), '{}'::jsonb;
exception when others then
  raise warning 'kick_whatsapp_worker: %', sqlerrm;
end;
$$;

-- ---------------------------------------------------------------------
-- notify_order (mengganti stub Fase 2)
-- ---------------------------------------------------------------------
create or replace function private.notify_order(p_order_id uuid, p_tahap text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_tahap text := case p_tahap
    when 'diterima' then 'pesanan_diterima'
    when 'dikonfirmasi' then 'pembayaran_dikonfirmasi'
    when 'siap' then 'pesanan_siap'
    when 'selesai' then 'pesanan_selesai'
    when 'dibatalkan' then 'pesanan_dibatalkan'
    else p_tahap end;
  v_tpl public.whatsapp_templates;
  v_order public.orders;
begin
  if not coalesce((private.setting('whatsapp.aktif') #>> '{}')::boolean, true) then
    return;
  end if;
  select * into v_tpl from public.whatsapp_templates where tahap = v_tahap and aktif;
  if not found then
    return;
  end if;
  select * into v_order from public.orders where id = p_order_id;
  if not found or not v_order.persetujuan_wa then
    return;
  end if;
  insert into public.whatsapp_messages (order_id, customer_id, tahap, to_phone, body)
  values (v_order.id, v_order.customer_id, v_tahap, v_order.no_hp,
          private.render_template(v_tpl.isi, private.order_template_vars(v_order.id)))
  on conflict (order_id, tahap) where order_id is not null do nothing;
exception when others then
  -- Pesanan tetap tersimpan walau antrean gagal.
  raise warning 'notify_order(%, %): %', p_order_id, p_tahap, sqlerrm;
end;
$$;

create or replace function private.whatsapp_messages_after_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.kick_whatsapp_worker();
  return null;
end;
$$;
create trigger whatsapp_messages_kick after insert on public.whatsapp_messages
for each statement execute function private.whatsapp_messages_after_insert();

-- ---------------------------------------------------------------------
-- RPC untuk worker (khusus service_role)
-- ---------------------------------------------------------------------
-- Ambil pesan yang siap dikirim. Menghormati batas per menit; pesan yang
-- macet di status "mengirim" > 5 menit diambil ulang.
create or replace function public.wa_claim_messages(p_limit int default 10)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_per_menit int := coalesce((private.setting('whatsapp.maks_per_menit') #>> '{}')::int, 20);
  v_used int;
  v_take int;
  v_rows jsonb;
begin
  select count(*) into v_used from public.whatsapp_messages
   where last_attempt_at > now() - interval '1 minute';
  v_take := greatest(0, least(coalesce(p_limit, 10), 50, v_per_menit - v_used));

  with picked as (
    select id from public.whatsapp_messages
     where (status = 'pending' and next_attempt_at <= now())
        or (status = 'mengirim' and locked_at < now() - interval '5 minutes')
     order by next_attempt_at, created_at
     limit v_take
     for update skip locked
  ), upd as (
    update public.whatsapp_messages m
       set status = 'mengirim', attempts = m.attempts + 1, locked_at = now(), last_attempt_at = now()
      from picked where m.id = picked.id
    returning m.id, m.to_phone, m.body, m.attempts, m.created_at
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'to', to_phone, 'body', body, 'attempts', attempts) order by created_at), '[]'::jsonb)
    into v_rows from upd;

  return jsonb_build_object(
    'jeda_detik', coalesce((private.setting('whatsapp.jeda_detik') #>> '{}')::int, 3),
    'pesan', v_rows);
end;
$$;

-- Catat hasil kirim. Gagal -> coba ulang dengan jeda bertahap (1, 5 menit)
-- hingga max_attempts, lalu berstatus "gagal".
create or replace function public.wa_mark_result(p_id uuid, p_ok boolean, p_provider text,
                                                  p_provider_message_id text default null, p_error text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v public.whatsapp_messages;
begin
  select * into v from public.whatsapp_messages where id = p_id for update;
  if not found then
    raise exception 'Pesan tidak ditemukan' using errcode = 'P0002';
  end if;
  if p_ok then
    update public.whatsapp_messages
       set status = 'terkirim', sent_at = now(), locked_at = null, last_error = null,
           provider = p_provider, provider_message_id = left(p_provider_message_id, 200)
     where id = p_id;
    return 'terkirim';
  end if;
  if v.attempts >= v.max_attempts then
    update public.whatsapp_messages
       set status = 'gagal', locked_at = null, provider = p_provider, last_error = left(coalesce(p_error, 'Gagal mengirim'), 500)
     where id = p_id;
    return 'gagal';
  end if;
  update public.whatsapp_messages
     set status = 'pending', locked_at = null, provider = p_provider,
         last_error = left(coalesce(p_error, 'Gagal mengirim'), 500),
         next_attempt_at = now() + case v.attempts when 1 then interval '1 minute' else interval '5 minutes' end
   where id = p_id;
  return 'pending';
end;
$$;

-- ---------------------------------------------------------------------
-- RPC untuk staf
-- ---------------------------------------------------------------------
create or replace function public.my_effective_role()
returns text language sql stable security definer set search_path = '' as $$
  select private.current_app_role()::text;
$$;

-- Kirim ulang pesan gagal (Owner/Admin).
create or replace function public.wa_resend(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v public.whatsapp_messages;
begin
  perform private.require_role('owner', 'admin');
  select * into v from public.whatsapp_messages where id = p_id for update;
  if not found then
    raise exception 'Pesan tidak ditemukan' using errcode = 'P0002';
  end if;
  if v.status <> 'gagal' then
    raise exception 'Hanya pesan gagal yang bisa dikirim ulang' using errcode = '22023';
  end if;
  update public.whatsapp_messages
     set status = 'pending', attempts = 0, next_attempt_at = now(), locked_at = null
   where id = p_id;
  perform private.write_audit('pesan_wa.kirim_ulang', 'pesan_wa', p_id::text,
                              jsonb_build_object('status', v.status, 'last_error', v.last_error), null);
  perform private.kick_whatsapp_worker();
end;
$$;

-- Uji kirim (Owner).
create or replace function public.wa_enqueue_test(p_to text, p_pesan text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_phone text := public.normalize_phone(p_to);
  v_id uuid;
begin
  perform private.require_role('owner');
  if v_phone is null then
    raise exception 'Nomor HP tidak valid' using errcode = '22023';
  end if;
  if not private.hit_rate_limit('wa_test:' || auth.uid(), 10, interval '1 hour') then
    raise exception 'Terlalu banyak uji kirim. Coba lagi nanti.' using errcode = '54000';
  end if;
  insert into public.whatsapp_messages (tahap, to_phone, body, max_attempts)
  values ('uji_kirim', v_phone,
          left(coalesce(nullif(btrim(p_pesan), ''),
                        'Uji kirim dari ' || coalesce(private.setting('toko.nama') #>> '{}', 'GutVibes') || ' ✅ Notifikasi WhatsApp berjalan.'), 1000),
          1)
  returning id into v_id;
  perform private.write_audit('pesan_wa.uji_kirim', 'pesan_wa', v_id::text, null, jsonb_build_object('to', v_phone));
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Lacak pesanan: sertakan status notifikasi "pesanan diterima" agar
-- halaman sukses bisa menampilkan tombol cadangan bila gagal.
-- ---------------------------------------------------------------------
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
    -- Untuk pelanggan: "gagal" begitu percobaan pertama gagal (sistem tetap
    -- mencoba ulang), agar tombol konfirmasi manual langsung tampil.
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
alter table public.whatsapp_templates enable row level security;
alter table public.whatsapp_messages  enable row level security;

create policy whatsapp_templates_select on public.whatsapp_templates for select to authenticated
  using ((select private.has_role('owner', 'admin')));
create policy whatsapp_templates_update on public.whatsapp_templates for update to authenticated
  using ((select private.has_role('owner', 'admin')))
  with check ((select private.has_role('owner', 'admin')));
create policy whatsapp_messages_select on public.whatsapp_messages for select to authenticated
  using ((select private.has_role('owner', 'admin')));

revoke all on public.whatsapp_templates, public.whatsapp_messages from anon, authenticated;
grant select, update (isi, aktif) on public.whatsapp_templates to authenticated;
grant select on public.whatsapp_messages to authenticated;

revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function
  private.jwt_aal(), private.current_app_role(), private.has_role(public.app_role[]), private.is_staff()
to anon, authenticated;

revoke execute on function
  public.wa_claim_messages(int),
  public.wa_mark_result(uuid, boolean, text, text, text),
  public.my_effective_role(),
  public.wa_resend(uuid),
  public.wa_enqueue_test(text, text)
from public, anon, authenticated;
grant execute on function public.wa_claim_messages(int), public.wa_mark_result(uuid, boolean, text, text, text)
  to service_role;
grant execute on function public.my_effective_role(), public.wa_resend(uuid), public.wa_enqueue_test(text, text)
  to authenticated;

-- ---------------------------------------------------------------------
-- Penjadwal: worker dibangunkan tiap menit (coba ulang & pesan tertunda).
-- Butuh pg_net + pg_cron (tersedia di Supabase). URL & secret worker
-- disimpan di Vault: wa_worker_url, wa_worker_secret (lihat README).
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net')
     and exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_net with schema extensions;
    create extension if not exists pg_cron;
    perform cron.schedule('whatsapp-worker', '* * * * *', 'select private.kick_whatsapp_worker()');
  end if;
end;
$$;
