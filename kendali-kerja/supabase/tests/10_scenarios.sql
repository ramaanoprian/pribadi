\set ON_ERROR_STOP 1
\pset format unaligned
\pset tuples_only on
-- Fixtures: org, admin A, member M, member S (pendukung), viewer V
insert into bylt_organizations(id,name) values('00000000-0000-0000-0000-00000000000a','BYLT');
insert into bylt_memberships values
 ('00000000-0000-0000-0000-00000000000a','11111111-1111-1111-1111-111111111111','admin',true),
 ('00000000-0000-0000-0000-00000000000a','22222222-2222-2222-2222-222222222222','member',true),
 ('00000000-0000-0000-0000-00000000000a','33333333-3333-3333-3333-333333333333','member',true),
 ('00000000-0000-0000-0000-00000000000a','44444444-4444-4444-4444-444444444444','viewer',true);
insert into bylt_profiles(id,name,reminders) values('33333333-3333-3333-3333-333333333333','S',false);
set test.uid='11111111-1111-1111-1111-111111111111';

\echo '--- T1: buat tugas, lalu update tanpa ubah pendukung -> tidak ada riwayat supporters'
create temp table v(id uuid, ver int);
insert into v select id, version from bylt_save_task('00000000-0000-0000-0000-00000000000a',null,0,gen_random_uuid(),
 '{"title":"Uji","kind":"routine","pic_id":"22222222-2222-2222-2222-222222222222","due_at":"2020-01-01T00:00:00Z"}',array['33333333-3333-3333-3333-333333333333']::uuid[]);
select bylt_save_task('00000000-0000-0000-0000-00000000000a',v.id,v.ver,gen_random_uuid(),
 '{"title":"Uji 2","kind":"routine","pic_id":"22222222-2222-2222-2222-222222222222","due_at":"2020-01-01T00:00:00Z"}',array['33333333-3333-3333-3333-333333333333']::uuid[]) is not null from v;
select 'supporters rows=' || count(*) from bylt_history where action='supporters';
select 'members=' || count(*) from bylt_task_members;
update v set ver=ver+1;
\echo '--- T2: ubah pendukung -> 1 riwayat dengan before/after'
select bylt_save_task('00000000-0000-0000-0000-00000000000a',v.id,v.ver,gen_random_uuid(),
 '{"title":"Uji 2","kind":"routine","pic_id":"22222222-2222-2222-2222-222222222222","due_at":"2020-01-01T00:00:00Z"}','{}') is not null from v;
select 'supporters rows=' || count(*) || ' ' || max(before_data::text) || ' -> ' || max(after_data::text) from bylt_history where action='supporters';
update v set ver=ver+1;
\echo '--- T3: Selesai tanpa hasil aktual -> pesan jelas'
\set ON_ERROR_STOP 0
select bylt_save_task('00000000-0000-0000-0000-00000000000a',v.id,v.ver,gen_random_uuid(),'{"title":"Uji 2","kind":"routine","status":"done"}','{}') from v;
select bylt_save_task('00000000-0000-0000-0000-00000000000a',v.id,v.ver,gen_random_uuid(),'{"title":"Uji 2","kind":"routine","status":"waiting"}','{}') from v;
select bylt_save_task('00000000-0000-0000-0000-00000000000a',v.id,v.ver,gen_random_uuid(),'{"title":"Uji 2","kind":"routine","status":"cancelled"}','{}') from v;
\set ON_ERROR_STOP 1
\echo '--- T4: reminders. Tugas overdue PIC=M, pendukung dihapus. Tambah tugas tanpa PIC dengan pendukung S (reminders off)'
select bylt_save_task('00000000-0000-0000-0000-00000000000a',null,0,gen_random_uuid(),
 ('{"title":"Tanpa PIC","kind":"evp","due_at":"'||(now()+interval '3 hours')||'"}')::jsonb,array['33333333-3333-3333-3333-333333333333']::uuid[]) is not null;
select 'run1 inserted=' || bylt_run_reminders();
select 'run2 inserted=' || bylt_run_reminders();
select user_id || ' | ' || title from bylt_notifications where dedupe_key like 'reminder:%' order by title;
\echo '--- T5: impor tugas selesai tanpa hasil aktual'
select bylt_import_data('00000000-0000-0000-0000-00000000000a',repeat('a',64),null,'22222222-2222-2222-2222-222222222222',
 '[{"source_id":"x1","title":"Lama","kind":"routine","status":"done"},{"source_id":"x2","title":"Lama2","kind":"routine","status":"done","actual_result":"OK"}]','[]','[]');
select title||': '||actual_result from bylt_tasks where import_key is not null order by title;
\echo '--- T6: lampiran'
insert into storage.objects(bucket_id,name,metadata) select 'bylt-evidence','00000000-0000-0000-0000-00000000000a/'||id||'/foto.heic','{"size":12345,"mimetype":"image/heic"}' from v;
insert into storage.objects(bucket_id,name,metadata) select 'bylt-evidence','00000000-0000-0000-0000-00000000000a/'||id||'/x.exe','{"size":10,"mimetype":"application/x-msdownload"}' from v;
select bylt_register_attachment('00000000-0000-0000-0000-00000000000a',v.id,'foto.heic','00000000-0000-0000-0000-00000000000a/'||v.id||'/foto.heic',1,'application/pdf','') from v;
select name||' size='||size||' mime='||mime from bylt_attachments;
\set ON_ERROR_STOP 0
select bylt_register_attachment('00000000-0000-0000-0000-00000000000a',v.id,'x.exe','00000000-0000-0000-0000-00000000000a/'||v.id||'/x.exe',10,'application/pdf','') from v;
\set ON_ERROR_STOP 1
\echo '--- T7: next_occurrence'
select bylt_private.next_occurrence('weekly',1::smallint,null,'2026-11-05') ||' (Kamis->Senin 9 Nov)';
select bylt_private.next_occurrence('weekly',4::smallint,null,'2026-11-05') ||' (hari ini Kamis)';
select bylt_private.next_occurrence('monthly',null,31::smallint,'2026-02-10') ||' (31 Feb -> 28 Feb)';
select bylt_private.next_occurrence('monthly',null,5::smallint,'2026-11-06') ||' (-> 5 Des)';
select bylt_private.next_occurrence('monthly',null,31::smallint,'2026-12-31') ||' (-> 31 Des)';
\echo '--- T8: recurrence: viewer ditolak, admin buat, run idempoten'
set test.uid='44444444-4444-4444-4444-444444444444';
\set ON_ERROR_STOP 0
select bylt_save_recurrence('00000000-0000-0000-0000-00000000000a',null,'{"title":"Rutin","freq":"weekly","weekday":1}');
\set ON_ERROR_STOP 1
set test.uid='11111111-1111-1111-1111-111111111111';
select 'next_run='||next_run from bylt_save_recurrence('00000000-0000-0000-0000-00000000000a',null,
 '{"title":"Cek APAR mingguan","freq":"weekly","weekday":4,"due_days":1,"due_time":"15:00","pic_id":"22222222-2222-2222-2222-222222222222"}',array['33333333-3333-3333-3333-333333333333']::uuid[]);
reset test.uid;  -- cron: tanpa auth.uid
update bylt_recurrences set next_run = next_run - 14;  -- simulasikan 2 minggu tertunda
select 'run1 created='||bylt_run_recurrences();
select 'run2 created='||bylt_run_recurrences();
select title||' recv='||(received_at at time zone 'Asia/Jakarta')||' due='||(due_at at time zone 'Asia/Jakarta')||' pic='||pic_id||' key='||import_key from bylt_tasks where import_key like 'recur:%';
select 'members of recur task='||count(*) from bylt_task_members m join bylt_tasks t on t.id=m.task_id where t.import_key like 'recur:%';
select 'next_run now='||next_run||' last_run='||last_run from bylt_recurrences;
select 'cron='||jobname||' '||schedule from cron.job;
