import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../src/lib/database.types';
import { totp } from './totp';

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

/** Owner masuk lalu menyelesaikan 2FA (daftar TOTP bila belum ada). */
export async function loginOwnerAal2(): Promise<SupabaseClient<Database>> {
  const c = await login('owner@gutvibes.test', 'Owner12345');
  const { data: factors } = await c.auth.mfa.listFactors();
  for (const f of factors?.all ?? []) await c.auth.mfa.unenroll({ factorId: f.id }).catch(() => {});
  // Faktor terverifikasi hanya bisa dihapus dari sesi aal2; bersihkan via admin agar tes bisa diulang.
  const { data: u } = await c.auth.getUser();
  const { data: list } = await admin.auth.admin.mfa.listFactors({ userId: u.user!.id });
  for (const f of list?.factors ?? []) await admin.auth.admin.mfa.deleteFactor({ userId: u.user!.id, id: f.id });

  const { data: enrolled, error } = await c.auth.mfa.enroll({ factorType: 'totp', friendlyName: `e2e-${Date.now()}` });
  if (error) throw error;
  const v = await c.auth.mfa.challengeAndVerify({ factorId: enrolled.id, code: totp(enrolled.totp.secret) });
  if (v.error) throw v.error;
  return c;
}


