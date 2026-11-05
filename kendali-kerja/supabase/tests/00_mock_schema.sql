do $$ begin create role anon nologin; create role authenticated nologin; create role service_role nologin; exception when duplicate_object then null; end $$;
create extension if not exists pgcrypto;
create schema auth; create schema storage; create schema cron; create schema bylt_private;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true),'')::uuid $$;
create table storage.buckets(id text primary key, public bool, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects(id uuid default gen_random_uuid(), bucket_id text, name text, metadata jsonb);
create table cron.job(jobname text primary key, schedule text, command text);
create function cron.schedule(n text, s text, c text) returns bigint language sql as $$ insert into cron.job values(n,s,c) on conflict(jobname) do update set schedule=excluded.schedule, command=excluded.command; select 1::bigint $$;
insert into storage.buckets values('bylt-evidence',false,20971520,array['application/pdf','image/jpeg','image/png','image/webp','text/csv','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);

create table public.bylt_organizations(id uuid primary key default gen_random_uuid(), name text not null);
create table public.bylt_profiles(id uuid primary key, name text not null, reminders boolean not null default true, updated_at timestamptz not null default now());
create table public.bylt_memberships(organization_id uuid not null references public.bylt_organizations, user_id uuid not null, role text not null check (role in ('admin','member','viewer')), active boolean not null default true, created_at timestamptz not null default now(), primary key(organization_id,user_id));
create table public.bylt_teams(id uuid primary key default gen_random_uuid(), organization_id uuid not null, name text not null, unique(organization_id,id));
create table public.bylt_departments(id uuid primary key default gen_random_uuid(), organization_id uuid not null, name text not null, unique(organization_id,id));
create table public.bylt_contacts(id uuid primary key default gen_random_uuid(), organization_id uuid not null, name text not null check(length(name)>0), position text default '', phone text default '', email text default '', notes text default '', import_key text, unique(organization_id,import_key));
create sequence public.bylt_task_number;
create table public.bylt_tasks(id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.bylt_organizations, number bigint not null default nextval('public.bylt_task_number') unique, title text not null check (length(trim(title)) between 1 and 240), description text not null default '', kind text not null check (kind in ('evp','routine')), assigned_by text not null default '', received_at timestamptz not null default now(), due_at timestamptz, team_id uuid, department_id uuid, pic_id uuid, priority text not null default 'normal' check (priority in ('normal','high','urgent')), status text not null default 'todo' check (status in ('todo','doing','waiting','done','cancelled')), progress int not null default 0 check (progress between 0 and 100), expected_result text not null default '', actual_result text not null default '', obstacles text not null default '', decision_needed text not null default '', next_action text not null default '', waiting_reason text not null default '', waiting_on text not null default '', change_reason text not null default '', created_by uuid not null, updated_by uuid not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), completed_at timestamptz, archived_at timestamptz, version int not null default 1, request_id uuid not null, import_key text,
 check (status<>'done' or (progress=100 and length(trim(actual_result))>0 and completed_at is not null)),
 check (status<>'waiting' or (length(trim(waiting_reason))>0 and length(trim(waiting_on))>0)),
 check (status<>'cancelled' or length(trim(change_reason))>0),
 unique(organization_id,import_key), unique(organization_id,request_id), unique(organization_id,id),
 foreign key(organization_id,created_by) references public.bylt_memberships(organization_id,user_id),
 foreign key(organization_id,updated_by) references public.bylt_memberships(organization_id,user_id),
 foreign key(organization_id,pic_id) references public.bylt_memberships(organization_id,user_id),
 foreign key(organization_id,team_id) references public.bylt_teams(organization_id,id),
 foreign key(organization_id,department_id) references public.bylt_departments(organization_id,id));
create table public.bylt_task_members(organization_id uuid not null, task_id uuid not null references public.bylt_tasks, user_id uuid not null, primary key(task_id,user_id));
create table public.bylt_history(id uuid primary key default gen_random_uuid(), organization_id uuid not null, task_id uuid not null, actor_id uuid, action text not null, before_data jsonb, after_data jsonb, reason text not null default '', created_at timestamptz not null default now());
create table public.bylt_notifications(id uuid primary key default gen_random_uuid(), organization_id uuid not null, user_id uuid not null, task_id uuid, title text not null, dedupe_key text not null unique, read_at timestamptz, created_at timestamptz not null default now());
create table public.bylt_attachments(id uuid primary key default gen_random_uuid(), organization_id uuid not null, task_id uuid not null, name text not null, path text not null unique, size bigint not null check (size between 1 and 20971520), mime text not null, caption text not null default '', uploaded_by uuid not null, created_at timestamptz not null default now());

CREATE OR REPLACE FUNCTION bylt_private.role_for(org uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $function$
 select role from public.bylt_memberships where organization_id=org and user_id=(select auth.uid()) and active $function$;
CREATE OR REPLACE FUNCTION bylt_private.can_edit(task uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $function$
 select exists(select 1 from public.bylt_tasks t where t.id=task and
 (bylt_private.role_for(t.organization_id)='admin' or
 (bylt_private.role_for(t.organization_id)='member' and (t.created_by=auth.uid() or t.pic_id=auth.uid() or exists
 (select 1 from public.bylt_task_members s where s.task_id=t.id and s.user_id=auth.uid()))))) $function$;
CREATE OR REPLACE FUNCTION bylt_private.audit_task() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
begin
 insert into public.bylt_history(organization_id,task_id,actor_id,action,before_data,after_data,reason)
 values(new.organization_id,new.id,auth.uid(),case when TG_OP='INSERT' then 'created' else 'updated' end,
 case when TG_OP='UPDATE' then to_jsonb(old) else null end,to_jsonb(new),new.change_reason);
 if new.pic_id is not null and (TG_OP='INSERT' or new.pic_id is distinct from old.pic_id or new.due_at is distinct from old.due_at) then
 insert into public.bylt_notifications(organization_id,user_id,task_id,title,dedupe_key)
 values(new.organization_id,new.pic_id,new.id,case when TG_OP='INSERT' then 'Penugasan baru: ' when new.pic_id is distinct from old.pic_id then 'Anda ditetapkan sebagai PIC: ' else 'Tenggat berubah: ' end || new.title,
 'task:'||new.id||':'||new.version) on conflict(dedupe_key) do nothing;
 end if;
 return new;
end $function$;
create trigger audit after insert or update on public.bylt_tasks for each row execute function bylt_private.audit_task();
