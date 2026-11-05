import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../src/lib/database.types';

export const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
export const ANON = process.env.SUPABASE_ANON_KEY ?? '';
export const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
export const ready = Boolean(ANON && SERVICE);

export const client = () => createClient<Database>(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
export const admin = createClient<Database>(URL, SERVICE || 'x', { auth: { persistSession: false } });

export async function login(email: string, password: string) {
  const c = client();
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return c;
}

/** Owner masuk dengan email & kata sandi (tanpa 2FA). */
export function loginOwner(): Promise<SupabaseClient<Database>> {
  return login('owner@gutvibes.test', 'Owner12345');
}
