-- Kendali Kerja BYLT: pengulangan pekerjaan rutin.
--
-- Admin membuat aturan (mingguan/bulanan) berisi templat tugas. Job pg_cron harian
-- (00:05 WIB) membuat instans tugas baru saat tanggalnya tiba.
--
-- Idempotensi: setiap instans memakai import_key 'recur:<aturan>:<tanggal>' yang dijaga
-- constraint unik (organization_id, import_key), jadi job yang jalan dua kali tidak membuat ganda.
-- Jika job sempat mati beberapa hari, hanya kemunculan terbaru (<= hari ini) yang dibuat;
-- kemunculan lama yang terlewat tidak dibuat ulang agar daftar tidak banjir.
--
-- Akses: semua anggota boleh membaca aturan; tulis hanya admin lewat RPC.

create table public.bylt_recurrences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.bylt_organizations(id),
  title text not null check (length(trim(title)) between 1 and 240),
  description text not null default '',
  kind text not null default 'routine' check (kind in ('evp','routine')),
  priority text not null default 'normal' check (priority in ('normal','high','urgent')),
  assigned_by text not null default '',
  expected_result text not null default '',
  team_id uuid,
  department_id uuid,
  pic_id uuid,
  supporters uuid[] not null default '{}',
  freq text not null check (freq in ('weekly','monthly')),
  weekday smallint check (weekday between 1 and 7),        -- ISO: 1 = Senin … 7 = Minggu
  month_day smallint check (month_day between 1 and 31),   -- 29–31 dipotong ke akhir bulan
  due_days smallint not null default 0 check (due_days between 0 and 60),
  due_time time not null default '16:00',
  active boolean not null default true,
  next_run date not null,
  last_run date,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((freq = 'weekly' and weekday is not null) or (freq = 'monthly' and month_day is not null)),
  foreign key (organization_id, team_id) references public.bylt_teams(organization_id, id),
  foreign key (organization_id, department_id) references public.bylt_departments(organization_id, id),
  foreign key (organization_id, pic_id) references public.bylt_memberships(organization_id, user_id),
  foreign key (organization_id, created_by) references public.bylt_memberships(organization_id, user_id)
);

create index bylt_recurrences_due_idx on public.bylt_recurrences (next_run) where active;
create index bylt_recurrences_org_idx on public.bylt_recurrences (organization_id);

alter table public.bylt_recurrences enable row level security;
revoke all on public.bylt_recurrences from anon, public;
grant select on public.bylt_recurrences to authenticated;
create policy member_read on public.bylt_recurrences for select to authenticated
  using (bylt_private.role_for(organization_id) is not null);

-- Kemunculan pertama pada atau setelah p_from.
create or replace function bylt_private.next_occurrence(p_freq text, p_weekday smallint, p_month_day smallint, p_from date)
 returns date
 language plpgsql
 immutable
 set search_path to ''
as $function$
declare first_of_month date; candidate date;
begin
  if p_freq = 'weekly' then
    return p_from + ((p_weekday - extract(isodow from p_from)::int + 7) % 7);
  end if;
  first_of_month := date_trunc('month', p_from)::date;
  for i in 0..1 loop
    candidate := least(first_of_month + (p_month_day - 1),
                       (first_of_month + interval '1 month - 1 day')::date);
    if candidate >= p_from then return candidate; end if;
    first_of_month := (first_of_month + interval '1 month')::date;
  end loop;
  return candidate;
end $function$;

-- Simpan aturan (buat baru bila p_id null). Admin saja.
create or replace function public.bylt_save_recurrence(p_org uuid, p_id uuid, p_data jsonb, p_supporters uuid[] default '{}'::uuid[])
 returns public.bylt_recurrences
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare r public.bylt_recurrences; old public.bylt_recurrences; today_wib date := (now() at time zone 'Asia/Jakarta')::date; s uuid;
begin
  if bylt_private.role_for(p_org) is distinct from 'admin' then raise exception 'Akses ditolak' using errcode='42501'; end if;
  if p_id is not null then
    select * into old from public.bylt_recurrences where id=p_id and organization_id=p_org for update;
    if not found then raise exception 'Aturan pengulangan tidak ditemukan'; end if;
    r := old;
  else
    r.id := gen_random_uuid(); r.organization_id := p_org; r.created_by := auth.uid(); r.created_at := now();
  end if;
  r.title := trim(coalesce(p_data->>'title',''));
  r.description := coalesce(p_data->>'description','');
  r.kind := coalesce(p_data->>'kind','routine');
  r.priority := coalesce(p_data->>'priority','normal');
  r.assigned_by := coalesce(p_data->>'assigned_by','');
  r.expected_result := coalesce(p_data->>'expected_result','');
  r.team_id := nullif(p_data->>'team_id','')::uuid;
  r.department_id := nullif(p_data->>'department_id','')::uuid;
  r.pic_id := nullif(p_data->>'pic_id','')::uuid;
  r.freq := p_data->>'freq';
  r.weekday := case when r.freq='weekly' then nullif(p_data->>'weekday','')::smallint end;
  r.month_day := case when r.freq='monthly' then nullif(p_data->>'month_day','')::smallint end;
  r.due_days := coalesce(nullif(p_data->>'due_days','')::smallint, 0);
  r.due_time := coalesce(nullif(p_data->>'due_time','')::time, '16:00');
  r.active := coalesce((p_data->>'active')::boolean, true);
  r.updated_at := now();
  if r.freq not in ('weekly','monthly') then raise exception 'Frekuensi harus mingguan atau bulanan'; end if;
  if r.freq='weekly' and r.weekday is null then raise exception 'Pilih hari untuk pengulangan mingguan'; end if;
  if r.freq='monthly' and r.month_day is null then raise exception 'Pilih tanggal untuk pengulangan bulanan'; end if;
  if r.pic_id is not null and not exists(select 1 from public.bylt_memberships where organization_id=p_org and user_id=r.pic_id and active and role in ('admin','member')) then
    raise exception 'PIC harus anggota aktif organisasi';
  end if;
  foreach s in array coalesce(p_supporters,'{}') loop
    if not exists(select 1 from public.bylt_memberships where organization_id=p_org and user_id=s and active and role in ('admin','member')) then
      raise exception 'Pendukung harus anggota aktif organisasi';
    end if;
  end loop;
  select coalesce(array_agg(distinct x),'{}') into r.supporters from unnest(coalesce(p_supporters,'{}')) x where x is not null;
  -- Hitung ulang jadwal untuk aturan baru, atau bila jadwal/aktif berubah.
  if p_id is null or old.freq is distinct from r.freq or old.weekday is distinct from r.weekday
     or old.month_day is distinct from r.month_day or (r.active and not old.active) then
    r.next_run := bylt_private.next_occurrence(r.freq, r.weekday, r.month_day, today_wib);
  end if;
  if p_id is null then
    insert into public.bylt_recurrences select (r).*;
  else
    update public.bylt_recurrences set title=r.title, description=r.description, kind=r.kind, priority=r.priority,
      assigned_by=r.assigned_by, expected_result=r.expected_result, team_id=r.team_id, department_id=r.department_id,
      pic_id=r.pic_id, supporters=r.supporters, freq=r.freq, weekday=r.weekday, month_day=r.month_day,
      due_days=r.due_days, due_time=r.due_time, active=r.active, next_run=r.next_run, updated_at=r.updated_at
    where id=p_id;
  end if;
  return r;
end $function$;

create or replace function public.bylt_delete_recurrence(p_org uuid, p_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if bylt_private.role_for(p_org) is distinct from 'admin' then raise exception 'Akses ditolak' using errcode='42501'; end if;
  delete from public.bylt_recurrences where id=p_id and organization_id=p_org;
end $function$;

-- Dipanggil pg_cron. Membuat instans tugas untuk aturan yang jatuh tempo.
create or replace function public.bylt_run_recurrences()
 returns integer
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare r public.bylt_recurrences; occ date; nxt date; tid uuid; pic uuid; created integer := 0;
  today_wib date := (now() at time zone 'Asia/Jakarta')::date;
begin
  for r in select * from public.bylt_recurrences where active and next_run <= today_wib for update skip locked loop
    -- Maju ke kemunculan terbaru yang <= hari ini.
    occ := r.next_run;
    loop
      nxt := bylt_private.next_occurrence(r.freq, r.weekday, r.month_day, occ + 1);
      exit when nxt > today_wib;
      occ := nxt;
    end loop;
    -- PIC yang sudah nonaktif tidak dipakai; tugas tetap dibuat dan pengingat akan ke admin.
    pic := null;
    select r.pic_id into pic where r.pic_id is not null and exists(
      select 1 from public.bylt_memberships m where m.organization_id=r.organization_id and m.user_id=r.pic_id and m.active and m.role in ('admin','member'));
    tid := null;
    insert into public.bylt_tasks(organization_id, title, description, kind, assigned_by, received_at, due_at,
      team_id, department_id, pic_id, priority, status, progress, expected_result,
      created_by, updated_by, request_id, import_key)
    values (r.organization_id, r.title, r.description, r.kind, r.assigned_by,
      (occ::timestamp + time '07:00') at time zone 'Asia/Jakarta',
      ((occ + r.due_days)::timestamp + r.due_time) at time zone 'Asia/Jakarta',
      r.team_id, r.department_id, pic, r.priority, 'todo', 0, r.expected_result,
      r.created_by, r.created_by, gen_random_uuid(), 'recur:' || r.id || ':' || occ::text)
    on conflict (organization_id, import_key) do nothing
    returning id into tid;
    if tid is not null then
      insert into public.bylt_task_members(organization_id, task_id, user_id)
      select r.organization_id, tid, s from unnest(r.supporters) s
      where exists(select 1 from public.bylt_memberships m where m.organization_id=r.organization_id and m.user_id=s and m.active and m.role in ('admin','member'));
      insert into public.bylt_history(organization_id, task_id, actor_id, action, after_data, reason)
      values (r.organization_id, tid, null, 'recurrence', jsonb_build_object('recurrence_id', r.id, 'occurrence', occ), 'Dibuat otomatis dari aturan pengulangan');
      created := created + 1;
    end if;
    update public.bylt_recurrences
       set last_run = occ,
           next_run = bylt_private.next_occurrence(r.freq, r.weekday, r.month_day, occ + 1)
     where id = r.id;
  end loop;
  return created;
end $function$;

revoke all on function bylt_private.next_occurrence(text, smallint, smallint, date) from public, anon, authenticated;
revoke all on function public.bylt_save_recurrence(uuid, uuid, jsonb, uuid[]) from public, anon;
revoke all on function public.bylt_delete_recurrence(uuid, uuid) from public, anon;
revoke all on function public.bylt_run_recurrences() from public, anon, authenticated;
grant execute on function public.bylt_save_recurrence(uuid, uuid, jsonb, uuid[]) to authenticated;
grant execute on function public.bylt_delete_recurrence(uuid, uuid) to authenticated;

select cron.schedule('bylt-recurrences', '5 17 * * *', 'select public.bylt_run_recurrences()');
