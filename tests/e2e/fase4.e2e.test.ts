/** Tes E2E Fase 4: produksi lewat API sungguhan. */
import { beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../src/lib/database.types';
import { admin, login, ready } from './env';

const SOES = 'b1000000-0000-4000-8000-000000000001';

describe.skipIf(!ready)('Fase 4 — produksi (E2E)', () => {
  let baking: SupabaseClient<Database>;
  let adminC: SupabaseClient<Database>;
  beforeAll(async () => {
    baking = await login('baking@gutvibes.test', 'Baking12345');
    adminC = await login('admin@gutvibes.test', 'Admin12345');
    await admin.from('app_settings').update({ value: 'peringatan' }).eq('key', 'produksi.mode_bahan_kurang');
  });

  it('Admin Baking: pratinjau → simpan → stok bahan berkurang & produk bertambah', async () => {
    const { data: before } = await admin.from('products').select('stok').eq('id', SOES).single();
    const { data: terigu0 } = await admin.from('ingredients').select('stok').eq('nama', 'Tepung terigu').single();
    const prev = await baking.rpc('production_preview', { p_product_id: SOES, p_batches: 2 });
    expect(prev.error).toBeNull();
    expect((prev.data as { hasil: number }).hasil).toBe(140);
    const rec = await baking.rpc('record_production', { p_product_id: SOES, p_batches: 2 });
    expect(rec.error).toBeNull();
    const { data: after } = await admin.from('products').select('stok').eq('id', SOES).single();
    expect(after!.stok).toBe(before!.stok + 140);
    const { data: terigu1 } = await admin.from('ingredients').select('stok').eq('nama', 'Tepung terigu').single();
    expect(Number(terigu0!.stok) - Number(terigu1!.stok)).toBe(1000);
  });

  it('Admin Baking tidak bisa membaca resep / HPP, dan tidak bisa membatalkan', async () => {
    expect((await baking.from('recipes').select('id')).data).toEqual([]);
    expect((await baking.from('ingredients').select('cost_per_unit')).error).not.toBeNull();
    const { data: logs } = await baking.from('production_logs').select('id').limit(1);
    expect((await baking.rpc('cancel_production', { p_id: logs![0].id, p_alasan: 'coba' })).error?.code).toBe('42501');
  });

  it('Admin membatalkan produksi dengan alasan; stok dibalik', async () => {
    const { data: logs } = await adminC.from('production_logs').select('id, total_output, product_id').eq('status', 'aktif').eq('product_id', SOES).order('created_at', { ascending: false }).limit(1);
    const { data: before } = await admin.from('products').select('stok').eq('id', SOES).single();
    expect((await adminC.rpc('cancel_production', { p_id: logs![0].id, p_alasan: 'Salah input' })).error).toBeNull();
    const { data: after } = await admin.from('products').select('stok').eq('id', SOES).single();
    expect(after!.stok).toBe(before!.stok - Number(logs![0].total_output));
  });
});
