-- =====================================================================
-- Owner tidak lagi wajib 2FA.
-- Sebelumnya hak Owner baru berlaku bila sesi aal2 (sudah memasukkan kode
-- authenticator). Sekarang Owner langsung mendapat haknya setelah masuk
-- dengan email & kata sandi, sama seperti peran staf lain.
-- =====================================================================

create or replace function private.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid()
    and p.aktif;
$$;
