/** Tes E2E Fase 2: katalog publik, checkout, lacak, alur status pesanan, storage. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../src/lib/database.types';
import type { PublicOrder } from '../../src/lib/orders';
import { admin, client, login, ready, URL } from './env';

const SOES = 'b1000000-0000-4000-8000-000000000001';
const BOLU = 'b1000000-0000-4000-8000-000000000005';
const besok = () => new Date(Date.now() + 86_400_000).toISOString();
const hp = () => `0813${String(Date.now()).slice(-8)}`;
const png = new Blob([Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])], { type: 'image/png' });

describe.skipIf(!ready)('Fase 2 — katalog & pesanan (E2E)', () => {
  let adminC: SupabaseClient<Database>;
  let baking: SupabaseClient<Database>;
  let member: SupabaseClient<Database>;
  let budi: SupabaseClient<Database>;
  const saved: Record<string, unknown> = {};

  beforeAll(async () => {
    const { data } = await admin.from('app_settings').select('key, value').in('key', ['batas.pesanan_per_jam_ip', 'batas.lacak_per_15_menit']);
    for (const r of data ?? []) saved[r.key] = r.value;
    await admin.from('app_settings').update({ value: 500 }).eq('key', 'batas.pesanan_per_jam_ip');
    await admin.from('app_settings').update({ value: 100 }).eq('key', 'batas.lacak_per_15_menit');
    adminC = await login('admin@gutvibes.test', 'Admin12345');
    baking = await login('baking@gutvibes.test', 'Baking12345');
    member = await login('member@gutvibes.test', 'Member12345');
    budi = await login('budi@gutvibes.test', 'Member12345');
  });
  afterAll(async () => {
    for (const [key, value] of Object.entries(saved)) await admin.from('app_settings').update({ value: value as number }).eq('key', key);
  });

  it('tamu membaca katalog lewat view, tidak bisa membaca tabel produk/HPP', async () => {
    const anon = client();
    const k = await anon.from('katalog_produk').select('*');
    expect(k.error).toBeNull();
    expect(k.data!.map((p) => p.slug)).toEqual(expect.arrayContaining(['soes-vla', 'bolu-pandan-klasik']));
    expect(Object.keys(k.data![0])).not.toContain('cost_per_unit');
    expect((await anon.from('products').select('id')).error).not.toBeNull();
    expect((await anon.from('orders').select('id')).error).not.toBeNull();
  });

  it('checkout tamu: harga dihitung server, lalu bisa dilacak (kode+HP & tautan)', async () => {
    const anon = client();
    const nomor = hp();
    const { data, error } = await anon.rpc('create_order', {
      p_nama: 'Tamu E2E',
      p_no_hp: nomor,
      p_fulfillment: 'ambil',
      p_jadwal: besok(),
      p_items: [{ product_id: SOES, qty: 10, harga: 1 }, { product_id: BOLU, qty: 1 }],
    });
    expect(error).toBeNull();
    const o = data as unknown as PublicOrder;
    expect(o.total).toBe(10 * 3500 + 85000);

    const t1 = await client().rpc('track_order', { p_kode: o.kode, p_no_hp: nomor });
    expect((t1.data as unknown as PublicOrder).status).toBe('menunggu_konfirmasi');
    const t2 = await client().rpc('track_order', { p_kode: o.kode, p_no_hp: '081200009999' });
    expect(t2.data).toBeNull();
    const t3 = await client().rpc('track_order_by_token', { p_token: o.tracking_code });
    expect((t3.data as unknown as PublicOrder).kode).toBe(o.kode);
  });

  it('alur Admin: ongkir → bayar (+bukti) → siap → selesai; stok ready dipotong', async () => {
    const { data: before } = await admin.from('products').select('stok').eq('id', SOES).single();
    const { data } = await client().rpc('create_order', {
      p_nama: 'Antar E2E',
      p_no_hp: hp(),
      p_fulfillment: 'antar',
      p_jadwal: besok(),
      p_alamat: 'Jl. Uji Coba No. 10, Bandung',
      p_items: [{ product_id: SOES, qty: 4 }],
    });
    const o = data as unknown as PublicOrder;
    const { data: row } = await adminC.from('orders').select('id').eq('kode', o.kode).single();
    const id = row!.id;

    expect((await adminC.rpc('confirm_order_payment', { p_id: id })).error?.message).toMatch(/ongkir/i);
    expect((await adminC.rpc('set_order_shipping', { p_id: id, p_ongkir: 12000, p_kurir: 'GoSend' })).error).toBeNull();

    const path = `${o.kode}/bukti.png`;
    expect((await adminC.storage.from('bukti-transfer').upload(path, png, { contentType: 'image/png' })).error).toBeNull();
    expect((await adminC.rpc('confirm_order_payment', { p_id: id, p_bukti_path: path })).error).toBeNull();
    expect((await adminC.rpc('mark_order_ready', { p_id: id })).error).toBeNull();
    expect((await adminC.rpc('complete_order', { p_id: id })).error).toBeNull();

    const { data: final } = await adminC.from('orders').select('status, total, payment_status, bukti_transfer_path').eq('id', id).single();
    expect(final).toEqual({ status: 'selesai', total: 4 * 3500 + 12000, payment_status: 'lunas', bukti_transfer_path: path });
    const { data: after } = await admin.from('products').select('stok').eq('id', SOES).single();
    expect(after!.stok).toBe(before!.stok - 4);
  });

  it('Admin Baking tidak melihat pesanan & tidak bisa mengunggah bukti', async () => {
    expect((await baking.from('orders').select('id')).data).toEqual([]);
    const up = await baking.storage.from('bukti-transfer').upload(`x/${Date.now()}.png`, png, { contentType: 'image/png' });
    expect(up.error).not.toBeNull();
  });

  it('member hanya melihat pesanannya sendiri', async () => {
    const { data } = await member.rpc('create_order', {
      p_nama: 'Sari Member',
      p_no_hp: '081234567890',
      p_fulfillment: 'ambil',
      p_jadwal: besok(),
      p_items: [{ product_id: BOLU, qty: 1 }],
    });
    const kode = (data as unknown as PublicOrder).kode;
    const mine = await member.from('orders').select('kode, user_id');
    expect(mine.data!.some((o) => o.kode === kode)).toBe(true);
    const { data: me } = await member.auth.getUser();
    expect(mine.data!.every((o) => o.user_id === me.user!.id)).toBe(true);
    const other = await budi.from('orders').select('kode').eq('kode', kode);
    expect(other.data).toEqual([]);
  });

  it('foto produk: Admin unggah ke bucket publik, tamu tidak bisa unggah', async () => {
    const path = `foto/e2e-${Date.now()}.png`;
    expect((await adminC.storage.from('produk').upload(path, png, { contentType: 'image/png' })).error).toBeNull();
    const res = await fetch(`${URL}/storage/v1/object/public/produk/${path}`);
    expect(res.status).toBe(200);
    expect((await client().storage.from('produk').upload(`foto/anon-${Date.now()}.png`, png, { contentType: 'image/png' })).error).not.toBeNull();
  });

  it('cek promo dari seed', async () => {
    const r = await client().rpc('check_promo', { p_kode: 'manis10', p_subtotal: 100000 });
    expect(r.data).toMatchObject({ valid: true, diskon: 10000 });
  });
});
