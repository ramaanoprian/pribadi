-- =====================================================================
-- FASE 7 — ANALISIS PELANGGAN (khusus Owner)
-- Semua angka dihitung dari pesanan SELESAI saat dibaca (VIEW/fungsi),
-- tidak ada angka tersimpan. Ambang "tidur" & VIP dari pengaturan.
-- =====================================================================

create or replace view public.analisis_pelanggan as
  with s as (
    select o.customer_id,
           count(*)::int as jumlah_pesanan,
           sum(o.total)::bigint as total_belanja,
           min(o.completed_at) as pesanan_pertama,
           max(o.completed_at) as pesanan_terakhir
    from public.orders o
    where o.status = 'selesai'
    group by o.customer_id
  ), fav as (
    select distinct on (o.customer_id) o.customer_id, i.nama_produk
    from public.orders o join public.order_items i on i.order_id = o.id
    where o.status = 'selesai'
    group by o.customer_id, i.nama_produk
    order by o.customer_id, sum(i.qty) desc, i.nama_produk
  )
  select c.id, c.nama, c.phone_normalized,
         case when c.user_id is not null then 'member' else 'tamu' end as jenis,
         coalesce(s.jumlah_pesanan, 0) as jumlah_pesanan,
         coalesce(s.total_belanja, 0) as total_belanja,
         s.pesanan_pertama, s.pesanan_terakhir,
         fav.nama_produk as produk_favorit,
         coalesce(s.jumlah_pesanan, 0) >= 2 as is_repeat,
         (c.is_vip or coalesce(s.jumlah_pesanan, 0) >= coalesce((select (st.value #>> '{}')::int from public.app_settings st where st.key = 'pelanggan.ambang_vip'), 10)) as is_vip,
         (s.pesanan_terakhir is not null
          and s.pesanan_terakhir < now() - make_interval(days => coalesce((select (st.value #>> '{}')::int from public.app_settings st where st.key = 'pelanggan.hari_tidur'), 60))) as is_tidur
  from public.customers c
  left join s on s.customer_id = c.id
  left join fav on fav.customer_id = c.id
  where (select private.has_role('owner'));

revoke all on public.analisis_pelanggan from anon, authenticated;
grant select on public.analisis_pelanggan to authenticated;

-- Peringkat pelanggan dengan filter periode, jenis, status, pencarian.
create or replace function public.customer_ranking(
  p_from date default null,
  p_to date default null,
  p_jenis text default null,
  p_status text default null,
  p_search text default null,
  p_sort text default 'jumlah',
  p_limit int default 20,
  p_offset int default 0
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_q text := nullif(btrim(coalesce(p_search, '')), '');
  v_digits text := regexp_replace(coalesce(p_search, ''), '\D', '', 'g');
begin
  perform private.require_role('owner');
  return (
    with periode as (
      select o.customer_id, count(*)::int as jumlah, sum(o.total)::bigint as total, max(o.completed_at) as terakhir_periode
      from public.orders o
      where o.status = 'selesai'
        and (p_from is null or (o.completed_at at time zone 'Asia/Jakarta')::date >= p_from)
        and (p_to is null or (o.completed_at at time zone 'Asia/Jakarta')::date <= p_to)
      group by o.customer_id
    ), base as (
      select a.*, pr.jumlah as jumlah_periode, pr.total as total_periode,
             (a.pesanan_pertama at time zone 'Asia/Jakarta')::date >= coalesce(p_from, '-infinity'::date) as is_baru
      from public.analisis_pelanggan a join periode pr on pr.customer_id = a.id
      where (p_jenis is null or a.jenis = p_jenis)
        and (p_status is null or p_status = 'semua'
             or (p_status = 'repeat' and a.is_repeat)
             or (p_status = 'vip' and a.is_vip)
             or (p_status = 'tidur' and a.is_tidur)
             or (p_status = 'baru' and (a.pesanan_pertama at time zone 'Asia/Jakarta')::date >= coalesce(p_from, '-infinity'::date)))
        and (v_q is null or a.nama ilike '%' || v_q || '%'
             or (length(v_digits) >= 4 and a.phone_normalized like '%' || regexp_replace(v_digits, '^0', '62') || '%'))
    )
    select jsonb_build_object(
      'total', (select count(*) from base),
      'rows', coalesce((
        select jsonb_agg(to_jsonb(b) - 'phone_normalized' || jsonb_build_object('no_hp', b.phone_normalized)
                         order by case when p_sort = 'total' then b.total_periode else b.jumlah_periode end desc,
                                  case when p_sort = 'total' then b.jumlah_periode else b.total_periode end desc, b.nama)
        from (select * from base
              order by case when p_sort = 'total' then total_periode else jumlah_periode end desc,
                       case when p_sort = 'total' then jumlah_periode else total_periode end desc, nama
              limit least(greatest(coalesce(p_limit, 20), 1), 1000) offset greatest(coalesce(p_offset, 0), 0)) b), '[]'::jsonb))
  );
end;
$$;

-- Ringkasan: aktif, baru vs kembali, repeat, rata-rata pesanan, tidur, VIP.
create or replace function public.customer_analytics_summary(p_from date default null, p_to date default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_role('owner');
  return (
    with periode as (
      select o.customer_id, count(*)::int as jumlah
      from public.orders o
      where o.status = 'selesai'
        and (p_from is null or (o.completed_at at time zone 'Asia/Jakarta')::date >= p_from)
        and (p_to is null or (o.completed_at at time zone 'Asia/Jakarta')::date <= p_to)
      group by o.customer_id
    ), aktif as (
      select a.*, p.jumlah as jumlah_periode from public.analisis_pelanggan a join periode p on p.customer_id = a.id
    )
    select jsonb_build_object(
      'aktif', (select count(*) from aktif),
      'baru', (select count(*) from aktif where (pesanan_pertama at time zone 'Asia/Jakarta')::date >= coalesce(p_from, '-infinity'::date)),
      'kembali', (select count(*) from aktif where (pesanan_pertama at time zone 'Asia/Jakarta')::date < coalesce(p_from, '-infinity'::date)),
      'repeat', (select count(*) from aktif where is_repeat),
      'repeat_rate', (select case when count(*) = 0 then 0 else round(count(*) filter (where is_repeat) * 100.0 / count(*), 1) end from aktif),
      'rata_rata_pesanan', (select case when count(*) = 0 then 0 else round(sum(jumlah_periode)::numeric / count(*), 2) end from aktif),
      'pesanan', (select coalesce(sum(jumlah_periode), 0) from aktif),
      'member', (select count(*) from aktif where jenis = 'member'),
      'tamu', (select count(*) from aktif where jenis = 'tamu'),
      'tidur', (select count(*) from public.analisis_pelanggan where is_tidur),
      'vip', (select count(*) from public.analisis_pelanggan where is_vip),
      'hari_tidur', coalesce((private.setting('pelanggan.hari_tidur') #>> '{}')::int, 60),
      'ambang_vip', coalesce((private.setting('pelanggan.ambang_vip') #>> '{}')::int, 10)
    )
  );
end;
$$;

revoke execute on function public.customer_ranking(date, date, text, text, text, text, int, int),
  public.customer_analytics_summary(date, date) from public, anon;
grant execute on function public.customer_ranking(date, date, text, text, text, text, int, int),
  public.customer_analytics_summary(date, date) to authenticated;
