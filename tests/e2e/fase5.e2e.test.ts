/** Tes E2E Fase 5: stamp & OTP lewat API sungguhan. */
import { beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../src/lib/database.types';
import type { MyLoyalty } from '../../src/lib/loyalty';
import type { PublicOrder } from '../../src/lib/orders';
import { admin, client, login, ready } from './env';

const BOLU = 'b1000000-0000-4000-8000-000000000005';
const besok = () => new Date(Date.now() + 86_400_000).toISOString();

async function finish(adminC: SupabaseClient<Database>, kode: string) {
  const { data } = await adminC.from('orders').select('id').eq('kode', kode).single();
  for (const fn of ['confirm_order_payment', 'mark_order_ready', 'complete_order'] as const) {
    const r = fn === 'confirm_order_payment' ? await adminC.rpc(fn, { p_id: data!.id }) : await adminC.rpc(fn, { p_id: data!.id });
    if (r.error) throw r.error;
  }
}

describe.skipIf(!ready)('Fase 5 — loyalti (E2E)', () => {
  let adminC: SupabaseClient<Database>;
  let budi: SupabaseClient<Database>;
  beforeAll(async () => {
    await admin.from('app_settings').update({ value: 500 }).eq('key', 'batas.pesanan_per_jam_ip');
    await admin.from('app_settings').update({ value: 100 }).eq('key', 'batas.pesanan_per_jam');
    adminC = await login('admin@gutvibes.test', 'Admin12345');
    budi = await login('budi@gutvibes.test', 'Member12345');
  });

  it('pesanan member selesai menambah 1 stamp', async () => {
    const before = ((await budi.rpc('my_loyalty')).data as unknown as MyLoyalty).stamp;
    const { data } = await budi.rpc('create_order', { p_nama: 'Budi', p_no_hp: '081298765432', p_fulfillment: 'ambil', p_jadwal: besok(), p_items: [{ product_id: BOLU, qty: 1 }] });
    await finish(adminC, (data as unknown as PublicOrder).kode);
    const after = (await budi.rpc('my_loyalty')).data as unknown as MyLoyalty;
    expect(after.stamp === before + 1 || (before + 1 === after.target && after.stamp === 0)).toBe(true);
  });

  it('OTP WhatsApp: verifikasi nomor lalu pesanan tamu lama diklaim jadi stamp', async () => {
    const phone = `0813${String(Date.now()).slice(-8)}`;
    const { data: g } = await client().rpc('create_order', { p_nama: 'Budi Tamu', p_no_hp: phone, p_fulfillment: 'ambil', p_jadwal: besok(), p_items: [{ product_id: BOLU, qty: 1 }] });
    await finish(adminC, (g as unknown as PublicOrder).kode);

    expect((await budi.rpc('request_phone_otp', { p_phone: phone })).error).toBeNull();
    const { data: msg } = await admin.from('whatsapp_messages').select('body').eq('tahap', 'kode_otp').order('created_at', { ascending: false }).limit(1).single();
    const code = msg!.body.match(/(\d{6})/)![1];
    const res = await budi.rpc('verify_phone_otp', { p_code: code });
    expect(res.data).toMatchObject({ ok: true, stamp_diklaim: 1 });
    const { data: orders } = await budi.from('orders').select('kode').eq('kode', (g as unknown as PublicOrder).kode);
    expect(orders).toHaveLength(1);
  });

  it('anon tidak bisa memanggil fungsi loyalti member', async () => {
    expect((await client().rpc('my_loyalty')).error).not.toBeNull();
    expect((await client().rpc('request_phone_otp', { p_phone: '081211112222' })).error).not.toBeNull();
  });
});
