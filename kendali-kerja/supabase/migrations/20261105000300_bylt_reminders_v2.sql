-- Kendali Kerja BYLT: pengingat tenggat yang menjangkau semua pihak dan berulang saat terlewati.
--
-- Sebelumnya bylt_run_reminders():
--   - hanya ke PIC (tugas tanpa PIC tidak mengingatkan siapa pun),
--   - pendukung (bylt_task_members) tidak diingatkan,
--   - "Tenggat terlewati" hanya sekali per due_at.
-- Sekarang:
--   - penerima = PIC + pendukung; jika tugas belum punya PIC, ke semua admin aktif,
--   - hanya anggota aktif berperan admin/member, dan menghormati bylt_profiles.reminders
--     (pengguna tanpa baris profil dianggap mau diingatkan),
--   - "Tenggat mendekat" sekali per penerima per due_at (≤ 24 jam),
--   - "Tenggat terlewati" diulang sekali sehari (tanggal WIB) per penerima selama belum selesai.
-- Kunci dedupe kini memuat user_id karena satu tugas bisa punya beberapa penerima.
-- Jadwal pg_cron bylt-deadline-reminders (tiap 15 menit) tidak diubah.

create or replace function public.bylt_run_reminders()
 returns integer
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare affected integer; today_wib date := (now() at time zone 'Asia/Jakarta')::date;
begin
  with due as (
    select t.id, t.organization_id, t.title, t.due_at, t.pic_id, (t.due_at < now()) as overdue
    from public.bylt_tasks t
    where t.archived_at is null
      and t.status not in ('done','cancelled')
      and t.due_at is not null
      and t.due_at <= now() + interval '24 hours'
  ),
  recipients as (
    select d.*, d.pic_id as user_id, 'pic' as why from due d where d.pic_id is not null
    union
    select d.*, s.user_id, 'supporter' from due d join public.bylt_task_members s on s.task_id = d.id
    union
    select d.*, m.user_id, 'admin' from due d join public.bylt_memberships m
      on m.organization_id = d.organization_id and m.role = 'admin' and m.active
      where d.pic_id is null
  ),
  eligible as (
    select distinct on (r.id, r.user_id) r.*
    from recipients r
    join public.bylt_memberships m on m.organization_id = r.organization_id and m.user_id = r.user_id
      and m.active and m.role in ('admin','member')
    left join public.bylt_profiles p on p.id = r.user_id
    where coalesce(p.reminders, true)
    order by r.id, r.user_id, case r.why when 'pic' then 0 when 'supporter' then 1 else 2 end
  )
  insert into public.bylt_notifications(organization_id, user_id, task_id, title, dedupe_key)
  select e.organization_id, e.user_id, e.id,
    case
      when e.overdue and e.why = 'admin' then 'Tenggat terlewati, belum ada PIC: '
      when e.overdue then 'Tenggat terlewati: '
      when e.why = 'admin' then 'Tenggat mendekat, belum ada PIC: '
      else 'Tenggat mendekat: '
    end || e.title,
    'reminder:' || e.id || ':' || e.user_id || ':' || e.due_at::text || ':' ||
      case when e.overdue then 'overdue:' || today_wib::text else 'soon' end
  from eligible e
  on conflict (dedupe_key) do nothing;
  get diagnostics affected = row_count;
  return affected;
end $function$;
