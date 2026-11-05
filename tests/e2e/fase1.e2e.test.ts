/**
 * Tes E2E Fase 1 terhadap Supabase lokal (Auth + PostgREST + RLS sungguhan).
 *
 * Jalankan:
 *   npx supabase start && npx supabase db reset
 *   SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... npm run test:e2e
 * Opsional: INVITE_FN_URL (default ${SUPABASE_URL}/functions/v1/invite-staff), MAILPIT_URL.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../../src/lib/database.types';
import { admin, ANON, client, login, loginOwner, ready, URL } from './env';

const INVITE_FN = process.env.INVITE_FN_URL ?? `${URL}/functions/v1/invite-staff`;
const MAILPIT = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324';

describe.skipIf(!ready)('Fase 1 — fondasi (E2E)', () => {
  let owner1: SupabaseClient<Database>;
  let ownerC: SupabaseClient<Database>;
  let adminC: SupabaseClient<Database>;
  let baking: SupabaseClient<Database>;
  let member: SupabaseClient<Database>;

  beforeAll(async () => {
    owner1 = await login('owner@gutvibes.test', 'Owner12345');
    adminC = await login('admin@gutvibes.test', 'Admin12345');
    baking = await login('baking@gutvibes.test', 'Baking12345');
    member = await login('member@gutvibes.test', 'Member12345');
  });

  it('tamu (anon) hanya membaca pengaturan publik, tidak bisa membaca profil/audit', async () => {
    const anon = client();
    const s = await anon.from('pengaturan_publik').select('key');
    expect(s.error).toBeNull();
    expect(s.data!.map((x) => x.key)).toContain('toko.nama');
    expect(s.data!.map((x) => x.key)).not.toContain('pelanggan.ambang_vip');
    expect((await anon.from('app_settings').select('key')).error).not.toBeNull();
    expect((await anon.from('profiles').select('*')).error).not.toBeNull();
    expect((await anon.from('audit_logs').select('*')).error).not.toBeNull();
    expect((await anon.rpc('set_user_role', { p_user_id: crypto.randomUUID(), p_role: 'owner' })).error).not.toBeNull();
  });

  it('skema privat tidak terekspos lewat API', async () => {
    const r = await client().rpc('hit_rate_limit' as never, { p_bucket: 'x', p_max: 1, p_window: '1 minute' } as never);
    expect(r.error).not.toBeNull();
  });

  it('setiap peran membaca profilnya sendiri dengan peran yang benar', async () => {
    for (const [c, role] of [
      [owner1, 'owner'],
      [adminC, 'admin'],
      [baking, 'admin_baking'],
      [member, 'member'],
    ] as const) {
      const { data, error } = await c.from('profiles').select('role');
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data![0].role).toBe(role);
    }
  });

  it('Owner langsung punya hak penuh tanpa 2FA', async () => {
    ownerC = await loginOwner();
    const { data: aal } = await ownerC.auth.mfa.getAuthenticatorAssuranceLevel();
    expect(aal?.currentLevel).toBe('aal1');
    const p = await ownerC.from('profiles').select('id');
    expect(p.data!.length).toBeGreaterThanOrEqual(4);
    const logs = await owner1.from('audit_logs').select('id');
    expect(logs.error).toBeNull();
  });

  it('Admin & Admin Baking tidak bisa mengelola akun, Admin Baking tidak melihat pelanggan', async () => {
    const { data: m } = await member.auth.getUser();
    expect((await adminC.rpc('set_user_role', { p_user_id: m.user!.id, p_role: 'owner' })).error?.code).toBe('42501');
    expect((await baking.rpc('set_user_active', { p_user_id: m.user!.id, p_aktif: false })).error?.code).toBe('42501');
    expect((await baking.from('customers').select('id')).data).toEqual([]);
    expect((await adminC.from('audit_logs').select('id')).data).toEqual([]);
  });

  it('member tidak bisa menaikkan perannya sendiri', async () => {
    const { data: m } = await member.auth.getUser();
    const r = await member.from('profiles').update({ role: 'owner' } as never).eq('id', m.user!.id);
    expect(r.error).not.toBeNull();
    const { data } = await member.from('profiles').select('role').single();
    expect(data!.role).toBe('member');
  });

  it('pendaftaran publik selalu menjadi member walau metadata berisi role', async () => {
    const email = `daftar-${Date.now()}@gutvibes.test`;
    const r = await client().auth.signUp({ email, password: 'Rahasia123', options: { data: { nama: 'Penyusup', no_hp: '0812-7777-8888', role: 'owner' } } });
    expect(r.error).toBeNull();
    const { data } = await admin.from('profiles').select('role, no_hp').eq('email', email).single();
    expect(data).toEqual({ role: 'member', no_hp: '6281277778888' });
  });

  it('Owner mengubah peran & menonaktifkan akun; tercatat di log aktivitas', async () => {
    const email = `staf-${Date.now()}@gutvibes.test`;
    const { data: created } = await admin.auth.admin.createUser({ email, password: 'Rahasia123', email_confirm: true, user_metadata: { nama: 'Staf Uji' } });
    const id = created.user!.id;
    expect((await ownerC.rpc('set_user_role', { p_user_id: id, p_role: 'admin', p_alasan: 'Uji E2E' })).error).toBeNull();
    expect((await ownerC.rpc('set_user_active', { p_user_id: id, p_aktif: false })).error).toBeNull();

    const staf = await login(email, 'Rahasia123');
    expect((await staf.from('app_settings').select('key').eq('is_public', false)).data).toEqual([]);

    const { data: logs } = await ownerC.from('audit_logs').select('aksi, alasan, data_baru').eq('entitas_id', id).order('id');
    expect(logs!.map((l) => l.aksi)).toEqual(['akun.ubah', 'akun.ubah']);
    expect(logs![0].alasan).toBe('Uji E2E');
  });

  it('undangan staf lewat Edge Function: hanya Owner, email terkirim, peran diterapkan', async () => {
    const email = `undangan-${Date.now()}@gutvibes.test`;
    const call = async (c: SupabaseClient<Database>) => {
      const { data } = await c.auth.getSession();
      return fetch(INVITE_FN, {
        method: 'POST',
        headers: { Authorization: `Bearer ${data.session!.access_token}`, apikey: ANON, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role: 'admin_baking', nama: 'Koki Baru' }),
      });
    };
    expect((await call(adminC)).status).toBe(403);

    const res = await call(ownerC);
    expect(res.status, await res.clone().text()).toBe(200);

    const { data: prof } = await admin.from('profiles').select('role, nama').eq('email', email).single();
    expect(prof).toEqual({ role: 'admin_baking', nama: 'Koki Baru' });
    const { data: inv } = await admin.from('staff_invitations').select('status').eq('email', email).single();
    expect(inv!.status).toBe('terkirim');

    const mail = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`).then((r) => r.json());
    expect(mail.messages_count ?? mail.total).toBeGreaterThan(0);

    // Undangan ulang ke email yang sudah terdaftar ditolak.
    expect((await call(ownerC)).status).toBe(400);
  });

  it('Owner mengubah pengaturan (tervalidasi) — Admin tidak bisa', async () => {
    const bad = await ownerC.from('app_settings').update({ value: 'enam puluh' }).eq('key', 'pelanggan.hari_tidur');
    expect(bad.error).not.toBeNull();
    const ok = await ownerC.from('app_settings').update({ value: 45 }).eq('key', 'pelanggan.hari_tidur').select('value');
    expect(ok.data![0].value).toBe(45);
    await adminC.from('app_settings').update({ value: 90 }).eq('key', 'pelanggan.hari_tidur');
    const { data } = await admin.from('app_settings').select('value').eq('key', 'pelanggan.hari_tidur').single();
    expect(data!.value).toBe(45);
    await ownerC.from('app_settings').update({ value: 60 }).eq('key', 'pelanggan.hari_tidur');
  });
});
