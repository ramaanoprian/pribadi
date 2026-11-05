-- Samakan hak tabel bylt_recurrences dengan bylt_tasks: baca saja; tulis lewat RPC.
-- (Default privileges Supabase memberi authenticated semua hak; TRUNCATE tidak dicek RLS.)
revoke insert, update, delete, truncate, references, trigger on public.bylt_recurrences from authenticated;
