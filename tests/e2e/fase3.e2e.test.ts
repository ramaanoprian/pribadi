/** Tes E2E Fase 3: antrean WhatsApp lewat Edge Runtime sungguhan (penyedia dummy). */
import { beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../src/lib/database.types';
import type { PublicOrder } from '../../src/lib/orders';
import { admin, ANON, client, login, loginOwnerAal2, ready, URL } from './env';

const WORKER = `${URL}/functions/v1/whatsapp-worker`;
const ADMIN_FN = `${URL}/functions/v1/whatsapp-admin`;
const SECRET = process.env.WA_WORKER_SECRET ?? 'local-dev-worker-secret';
const BOLU = 'b1000000-0000-4000-8000-000000000005';
const besok = () => new Date(Date.now() + 86_400_000).toISOString();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function order(phone: string) {
  const { data, error } = await client().rpc('create_order', {
    p_nama: 'Uji WA', p_no_hp: phone, p_fulfillment: 'ambil', p_jadwal: besok(), p_items: [{ product_id: BOLU, qty: 1 }],
  });
  if (error) throw error;
  return data as unknown as PublicOrder;
}
async function messageOf(kode: string) {
  const { data } = await admin.from('whatsapp_messages').select('id, status, attempts, last_error, orders!inner(kode)').eq('orders.kode', kode).eq('tahap', 'pesanan_diterima').single();
  return data!;
}
const runWorker = () => fetch(WORKER, { method: 'POST', headers: { 'x-worker-secret': SECRET } }).then((r) => r.json());
async function callAdmin(c: SupabaseClient<Database>, body: object) {
  const { data } = await c.auth.getSession();
  const res = await fetch(ADMIN_FN, { method: 'POST', headers: { Authorization: `Bearer ${data.session!.access_token}`, apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
}

describe.skipIf(!ready)('Fase 3 — WhatsApp (E2E)', () => {
  let adminC: SupabaseClient<Database>;
  let baking: SupabaseClient<Database>;
  let owner: SupabaseClient<Database>;

  beforeAll(async () => {
    await admin.from('app_settings').update({ value: 500 }).eq('key', 'batas.pesanan_per_jam_ip');
    await admin.from('app_settings').update({ value: 100 }).eq('key', 'batas.lacak_per_15_menit');
    await admin.from('app_settings').update({ value: 1 }).eq('key', 'whatsapp.jeda_detik');
    await admin.from('app_settings').update({ value: 60 }).eq('key', 'whatsapp.maks_per_menit');
    adminC = await login('admin@gutvibes.test', 'Admin12345');
    baking = await login('baking@gutvibes.test', 'Baking12345');
    owner = await loginOwnerAal2();
  });

  it('worker menolak permintaan tanpa secret yang benar', async () => {
    expect((await fetch(WORKER, { method: 'POST', headers: { 'x-worker-secret': 'salah' } })).status).toBe(401);
    expect((await fetch(WORKER, { method: 'POST' })).status).toBe(401);
  });

  it('pesanan baru otomatis terkirim (trigger -> pg_net -> worker)', async () => {
    const o = await order(`0813${String(Date.now()).slice(-8)}`);
    let m = await messageOf(o.kode);
    for (let i = 0; i < 20 && m.status !== 'terkirim'; i++) {
      await sleep(1000);
      m = await messageOf(o.kode);
    }
    expect(m.status).toBe('terkirim');
    const t = await client().rpc('track_order_by_token', { p_token: o.tracking_code });
    expect((t.data as unknown as PublicOrder).notif_wa).toBe('terkirim');
  });

  it('gagal kirim dicoba ulang hingga 3x lalu berstatus gagal; Admin bisa kirim ulang', async () => {
    const o = await order(`0812${String(Date.now()).slice(-4)}9999`);
    let m = await messageOf(o.kode);
    for (let i = 0; i < 20 && m.attempts < 1; i++) {
      await sleep(500);
      m = await messageOf(o.kode);
    }
    for (let attempt = m.attempts; attempt < 3; attempt++) {
      await admin.from('whatsapp_messages').update({ next_attempt_at: new Date().toISOString() } as never).eq('id', m.id);
      await runWorker();
    }
    m = await messageOf(o.kode);
    expect(m).toMatchObject({ status: 'gagal', attempts: 3 });
    expect(m.last_error).toMatch(/Simulasi gagal/);

    expect((await baking.rpc('wa_resend', { p_id: m.id })).error?.code).toBe('42501');
    expect((await adminC.rpc('wa_resend', { p_id: m.id })).error).toBeNull();
    const r = await callAdmin(adminC, { action: 'proses' });
    expect(r.status).toBe(200);
    m = await messageOf(o.kode);
    expect(m.attempts).toBe(1);
  });

  it('fungsi admin: status perangkat & uji kirim khusus Owner (2FA)', async () => {
    expect((await callAdmin(adminC, { action: 'status' })).status).toBe(403);
    const s = await callAdmin(owner, { action: 'status' });
    expect(s.body).toMatchObject({ provider: 'dummy', connected: true });
    expect((await callAdmin(adminC, { action: 'test', to: '081211112222' })).status).toBe(403);
    const t = await callAdmin(owner, { action: 'test', to: '081211112222' });
    expect(t.status).toBe(200);
    expect(t.body.terkirim).toBeGreaterThanOrEqual(1);
  });

  it('Admin Baking tidak melihat log & template WhatsApp', async () => {
    expect((await baking.from('whatsapp_messages').select('id')).data).toEqual([]);
    expect((await baking.from('whatsapp_templates').select('tahap')).data).toEqual([]);
    expect((await adminC.from('whatsapp_templates').select('tahap')).data!.map((t) => t.tahap)).toEqual(expect.arrayContaining(['pesanan_diterima', 'pesanan_dibatalkan']));
  });
});
