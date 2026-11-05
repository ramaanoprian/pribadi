import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export type DeviceStatus = { provider: string; configured: boolean; connected: boolean; device?: string; name?: string; quota?: string; expired?: string; detail?: string };

/** Panggil Edge Function whatsapp-admin dan ambil pesan galat dari badan respons. */
export async function waAdmin<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('whatsapp-admin', { body });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    const j = ctx && typeof ctx.json === 'function' ? await ctx.json().catch(() => null) : null;
    throw new Error(j?.error ?? error.message);
  }
  return data as T;
}

export function useDeviceStatus(enabled = true) {
  return useQuery({
    queryKey: ['wa_status'],
    enabled,
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: () => waAdmin<DeviceStatus>({ action: 'status' }),
  });
}
