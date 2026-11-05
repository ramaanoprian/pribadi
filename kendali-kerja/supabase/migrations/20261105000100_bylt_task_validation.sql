-- Kendali Kerja BYLT: validasi tugas yang ramah pengguna + riwayat pendukung yang tidak berisik.
--
-- Perubahan:
-- 1. bylt_save_task
--    - Pesan error yang jelas sebelum CHECK constraint tabel menolak:
--      Selesai tanpa hasil aktual, Menunggu tanpa alasan/pihak, Dibatalkan tanpa alasan.
--      (Aturannya sendiri sudah ditegakkan constraint bylt_tasks_check*, ini hanya pesan.)
--    - Riwayat 'supporters' hanya dicatat bila daftar pendukung benar-benar berubah,
--      dan sekarang menyimpan before_data agar linimasa bisa menampilkan perubahannya.
-- 2. bylt_import_data
--    - Tugas berstatus Selesai tanpa hasil aktual tidak lagi gagal diimpor:
--      diberi nilai berlabel '(Diimpor tanpa hasil aktual)'.
--
-- Signature fungsi tidak berubah, jadi ACL yang ada tetap berlaku.

create or replace function public.bylt_save_task(p_org uuid, p_id uuid, p_version integer, p_request uuid, p_data jsonb, p_supporters uuid[] default '{}'::uuid[])
 returns public.bylt_tasks
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare oldrow public.bylt_tasks; n public.bylt_tasks; role_name text; supporter uuid;
  old_supporters uuid[]; new_supporters uuid[];
begin
  role_name:=bylt_private.role_for(p_org);
  if role_name is null or role_name not in ('admin','member') then raise exception 'Akses ditolak' using errcode='42501'; end if;
  if p_id is null then
    select * into n from public.bylt_tasks where organization_id=p_org and request_id=p_request;
    if found then return n; end if;
    n.id:=gen_random_uuid(); n.organization_id:=p_org; n.created_by:=auth.uid(); n.created_at:=now(); n.received_at:=now();
    n.number:=nextval('public.bylt_task_number'); n.version:=1; n.request_id:=p_request;
  else
    select * into oldrow from public.bylt_tasks where id=p_id and organization_id=p_org for update;
    if not found or not bylt_private.can_edit(p_id) then raise exception 'Akses ditolak' using errcode='42501'; end if;
    if oldrow.version<>p_version then raise exception 'CONFLICT: pekerjaan telah diperbarui pengguna lain' using errcode='40001'; end if;
    n:=oldrow; n.version:=oldrow.version+1;
  end if;
  n.title:=trim(p_data->>'title'); n.description:=coalesce(p_data->>'description',''); n.kind:=p_data->>'kind';
  n.assigned_by:=coalesce(p_data->>'assigned_by',''); n.received_at:=coalesce((p_data->>'received_at')::timestamptz,n.received_at);
  n.due_at:=nullif(p_data->>'due_at','')::timestamptz;
  n.team_id:=nullif(p_data->>'team_id','')::uuid; n.department_id:=nullif(p_data->>'department_id','')::uuid;
  n.pic_id:=nullif(p_data->>'pic_id','')::uuid; n.priority:=coalesce(p_data->>'priority','normal');
  n.status:=coalesce(p_data->>'status','todo'); n.progress:=coalesce((p_data->>'progress')::integer,0);
  n.expected_result:=coalesce(p_data->>'expected_result',''); n.actual_result:=coalesce(p_data->>'actual_result','');
  n.obstacles:=coalesce(p_data->>'obstacles',''); n.decision_needed:=coalesce(p_data->>'decision_needed','');
  n.next_action:=coalesce(p_data->>'next_action',''); n.waiting_reason:=coalesce(p_data->>'waiting_reason','');
  n.waiting_on:=coalesce(p_data->>'waiting_on',''); n.change_reason:=coalesce(p_data->>'change_reason','');
  if p_id is not null and oldrow.status='done' and n.status<>'done' and length(trim(n.change_reason))=0 then raise exception 'Alasan membuka kembali wajib diisi'; end if;
  -- Pesan yang jelas untuk aturan yang juga ditegakkan CHECK constraint tabel.
  if n.status='done' and length(trim(n.actual_result))=0 then
    raise exception 'Hasil aktual wajib diisi sebelum menandai pekerjaan Selesai' using errcode='23514';
  end if;
  if n.status='waiting' and (length(trim(n.waiting_reason))=0 or length(trim(n.waiting_on))=0) then
    raise exception 'Status Menunggu wajib mengisi alasan dan pihak yang ditunggu' using errcode='23514';
  end if;
  if n.status='cancelled' and length(trim(n.change_reason))=0 then
    raise exception 'Alasan pembatalan wajib diisi' using errcode='23514';
  end if;
  if n.status='done' then n.progress:=100; n.completed_at:=coalesce(oldrow.completed_at,now()); else n.completed_at:=null; end if;
  if n.pic_id is not null and not exists(select 1 from public.bylt_memberships where organization_id=p_org and user_id=n.pic_id and active and role in ('admin','member')) then raise exception 'PIC harus anggota aktif organisasi'; end if;
  foreach supporter in array p_supporters loop
    if not exists(select 1 from public.bylt_memberships where organization_id=p_org and user_id=supporter and active and role in ('admin','member')) then raise exception 'Pendukung harus anggota aktif organisasi'; end if;
  end loop;
  n.updated_at:=now(); n.updated_by:=auth.uid();
  if p_id is null then insert into public.bylt_tasks select (n).*;
  else update public.bylt_tasks set title=n.title,description=n.description,kind=n.kind,assigned_by=n.assigned_by,received_at=n.received_at,due_at=n.due_at,
    team_id=n.team_id,department_id=n.department_id,pic_id=n.pic_id,priority=n.priority,status=n.status,progress=n.progress,expected_result=n.expected_result,
    actual_result=n.actual_result,obstacles=n.obstacles,decision_needed=n.decision_needed,next_action=n.next_action,waiting_reason=n.waiting_reason,
    waiting_on=n.waiting_on,change_reason=n.change_reason,updated_at=n.updated_at,updated_by=n.updated_by,completed_at=n.completed_at,version=n.version where id=p_id;
  end if;
  -- Bandingkan pendukung lama vs baru (terurut, tanpa duplikat) sebelum menulis ulang.
  select coalesce(array_agg(user_id order by user_id),'{}') into old_supporters from public.bylt_task_members where task_id=n.id;
  select coalesce(array_agg(x order by x),'{}') into new_supporters from (select distinct unnest(p_supporters) x) s where x is not null;
  if old_supporters is distinct from new_supporters then
    delete from public.bylt_task_members where task_id=n.id;
    insert into public.bylt_task_members(organization_id,task_id,user_id) select p_org,n.id,x from unnest(new_supporters) x;
    if p_id is not null then
      insert into public.bylt_history(organization_id,task_id,actor_id,action,before_data,after_data)
      values(p_org,n.id,auth.uid(),'supporters',jsonb_build_object('supporters',old_supporters),jsonb_build_object('supporters',new_supporters));
    end if;
  end if;
  return n;
end $function$;

create or replace function public.bylt_import_data(p_org uuid, p_source text, p_team uuid, p_owner uuid, p_tasks jsonb, p_contacts jsonb, p_history jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare item jsonb; t public.bylt_tasks; idx integer:=0; imported integer:=0; skipped integer:=0; issues jsonb:='[]'; k text; c integer:=0;
begin
  if bylt_private.role_for(p_org) is distinct from 'admin' then raise exception 'Akses ditolak' using errcode='42501'; end if;
  if length(p_source)<>64 or jsonb_array_length(p_tasks)>500 or jsonb_array_length(p_contacts)>500 then raise exception 'Impor dibatasi 500 tugas dan 500 kontak per berkas'; end if;
  if not exists(select 1 from public.bylt_memberships where organization_id=p_org and user_id=p_owner and active and role in ('admin','member')) then raise exception 'Pemilik tujuan tidak valid'; end if;
  if p_team is not null and not exists(select 1 from public.bylt_teams where organization_id=p_org and id=p_team) then raise exception 'Tim tujuan tidak valid'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_org::text||p_source,0));
  for item in select * from jsonb_array_elements(p_tasks) loop
    idx:=idx+1; k:=p_source||':task:'||coalesce(item->>'source_id',idx::text);
    if exists(select 1 from public.bylt_tasks where organization_id=p_org and import_key=k) then skipped:=skipped+1; continue; end if;
    -- Data lama sering tidak punya hasil aktual untuk tugas selesai; beri nilai berlabel agar tidak gagal.
    if item->>'status'='done' and length(trim(coalesce(item->>'actual_result','')))=0 then
      item:=item||jsonb_build_object('actual_result','(Diimpor tanpa hasil aktual)');
    end if;
    begin
      t:=public.bylt_save_task(p_org,null,0,gen_random_uuid(),item||jsonb_build_object('team_id',p_team,'pic_id',p_owner),'{}');
      update public.bylt_tasks set import_key=k where id=t.id;
      insert into public.bylt_history(organization_id,task_id,actor_id,action,after_data,reason)
      values(p_org,t.id,auth.uid(),'legacy_import',jsonb_build_object('source_id',item->>'source_id','legacy_history',(select coalesce(jsonb_agg(h),'[]') from jsonb_array_elements(p_history) h where coalesce(h->>'task_id',h->>'tugas_id')=item->>'source_id')),'Riwayat dari berkas impor; bukan kejadian terverifikasi server');
      imported:=imported+1;
    exception when others then issues:=issues||jsonb_build_array(jsonb_build_object('row',idx,'type','task','message',sqlerrm)); end;
  end loop;
  idx:=0;
  for item in select * from jsonb_array_elements(p_contacts) loop
    idx:=idx+1;k:=p_source||':contact:'||coalesce(item->>'id',idx::text);
    if exists(select 1 from public.bylt_contacts where organization_id=p_org and import_key=k) then skipped:=skipped+1;continue;end if;
    begin
      insert into public.bylt_contacts(organization_id,name,position,phone,email,notes,import_key)
      values(p_org,coalesce(item->>'name',item->>'nama'),coalesce(item->>'position',item->>'jabatan',''),coalesce(item->>'phone',item->>'telepon',''),coalesce(item->>'email',''),coalesce(item->>'notes',item->>'catatan',''),k);c:=c+1;
    exception when others then issues:=issues||jsonb_build_array(jsonb_build_object('row',idx,'type','contact','message',sqlerrm));end;
  end loop;
  return jsonb_build_object('tasks',imported,'contacts',c,'skipped',skipped,'errors',issues);
end $function$;
