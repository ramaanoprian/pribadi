import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Json } from '@/lib/database.types';

/** Konten web publik (key -> teks). */
export function useContent() {
  const q = useQuery({
    queryKey: ['konten_publik'],
    queryFn: async () => {
      const { data, error } = await supabase.from('konten_publik').select('key, value');
      if (error) throw error;
      return Object.fromEntries(data.map((r) => [r.key, r.value])) as Record<string, string>;
    },
    staleTime: 5 * 60_000,
  });
  return { ...q, c: (key: string, fallback = '') => q.data?.[key] || fallback };
}

/** Pengaturan publik (nama toko, ambang gratis ongkir). */
export function usePublicSettings() {
  const q = useQuery({
    queryKey: ['pengaturan_publik'],
    queryFn: async () => {
      const { data, error } = await supabase.from('pengaturan_publik').select('key, value');
      if (error) throw error;
      return Object.fromEntries(data.map((r) => [r.key, r.value])) as Record<string, Json>;
    },
    staleTime: 5 * 60_000,
  });
  return {
    ...q,
    storeName: (q.data?.['toko.nama'] as string) || 'GutVibes',
    freeShippingMin: Number(q.data?.['pesanan.gratis_ongkir_min'] ?? 0),
  };
}

export function useCatalog() {
  return useQuery({
    queryKey: ['katalog'],
    queryFn: async () => {
      const [cats, prods] = await Promise.all([
        supabase.from('katalog_kategori').select('*').order('urutan').order('nama'),
        supabase.from('katalog_produk').select('*').order('urutan').order('nama'),
      ]);
      if (cats.error) throw cats.error;
      if (prods.error) throw prods.error;
      return { categories: cats.data, products: prods.data };
    },
    staleTime: 60_000,
  });
}
