import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Tables } from '@/lib/database.types';
import { useAuth } from '@/auth/AuthProvider';

export type Setting = Tables<'app_settings'>;

/** Semua pengaturan yang boleh dibaca pengguna saat ini (publik untuk tamu, semua untuk staf). */
export function useSettings() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['app_settings', session?.user.id ?? 'tamu'],
    queryFn: async () => {
      const { data, error } = await supabase.from('app_settings').select('*').order('kategori').order('urutan');
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function settingValue<T = unknown>(settings: Setting[] | undefined, key: string, fallback: T): T {
  const s = settings?.find((x) => x.key === key);
  return (s?.value as T) ?? fallback;
}
