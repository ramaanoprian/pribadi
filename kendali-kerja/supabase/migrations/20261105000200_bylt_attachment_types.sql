-- Kendali Kerja BYLT: lampiran foto HP (HEIC/HEIF) dan PowerPoint, plus validasi lampiran di server.
--
-- Perubahan:
-- 1. Bucket bylt-evidence menerima image/heic, image/heif, PowerPoint (.ppt/.pptx).
--    Batas ukuran tetap 20 MB. Bucket tetap privat.
-- 2. bylt_register_attachment tidak lagi mempercayai ukuran/MIME dari klien:
--    nilainya diambil dari metadata storage.objects, lalu dicek terhadap
--    daftar MIME bucket dan batas 20 MB (sama dengan constraint bylt_attachments_size_check).
--
-- Hanya menyentuh bucket bylt-evidence; bucket lampiran/cadangan milik dashboard dokumen tidak diubah.

update storage.buckets
set allowed_mime_types = array[
  'application/pdf',
  'image/jpeg','image/png','image/webp','image/heic','image/heif',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation'
]
where id = 'bylt-evidence';

create or replace function public.bylt_register_attachment(p_org uuid, p_task uuid, p_name text, p_path text, p_size bigint, p_mime text, p_caption text)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare obj_size bigint; obj_mime text; allowed text[]; max_size bigint;
begin
  if not bylt_private.can_edit(p_task) or not exists(select 1 from public.bylt_tasks where id=p_task and organization_id=p_org) then raise exception 'Akses ditolak' using errcode='42501'; end if;
  if split_part(p_path,'/',1)<>p_org::text or split_part(p_path,'/',2)<>p_task::text then raise exception 'Lokasi berkas tidak valid'; end if;
  select nullif(o.metadata->>'size','')::bigint, lower(nullif(o.metadata->>'mimetype',''))
    into obj_size, obj_mime
    from storage.objects o where o.bucket_id='bylt-evidence' and o.name=p_path;
  if not found then raise exception 'Unggahan belum tersedia'; end if;
  select b.allowed_mime_types, b.file_size_limit into allowed, max_size from storage.buckets b where b.id='bylt-evidence';
  obj_size:=coalesce(obj_size,p_size);
  obj_mime:=coalesce(obj_mime,lower(p_mime));
  if obj_size is null or obj_size<1 or obj_size>coalesce(max_size,20971520) then
    raise exception 'Ukuran berkas maksimal 20 MB' using errcode='22023';
  end if;
  if allowed is not null and not (obj_mime = any(allowed)) then
    raise exception 'Jenis berkas tidak didukung: %', obj_mime using errcode='22023';
  end if;
  insert into public.bylt_attachments(organization_id,task_id,name,path,size,mime,caption,uploaded_by)
  values(p_org,p_task,left(coalesce(nullif(trim(p_name),''),split_part(p_path,'/',3)),255),p_path,obj_size,obj_mime,coalesce(p_caption,''),auth.uid())
  on conflict(path) do nothing;
end $function$;
