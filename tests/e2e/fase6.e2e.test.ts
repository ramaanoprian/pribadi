/** Tes E2E Fase 6: laporan & biaya khusus Owner (2FA). */
import { beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../src/lib/database.types';
import type { PL } from '../../src/lib/finance';
import { admin, login, loginOwner, ready } from './env';

describe.skipIf(!ready)('Fase 6 — biaya & laporan (E2E)', () => {
  let owner: SupabaseClient<Database>;
  let adminC: SupabaseClient<Database>;
  beforeAll(async () => {
    owner = await loginOwner();
    adminC = await login('admin@gutvibes.test', 'Admin12345');
  });

  it('Admin tidak bisa membaca biaya / laporan', async () => {
    expect((await adminC.from('expenses').select('id')).data).toEqual([]);
    expect((await adminC.rpc('report_profit_loss', { p_from: '2026-01-01', p_to: '2026-12-31' })).error?.code).toBe('42501');
  });

  it('laba rugi konsisten dengan data pesanan & biaya', async () => {
    const from = '2026-01-01';
    const to = '2026-12-31';
    const { data } = await owner.rpc('report_profit_loss', { p_from: from, p_to: to });
    const r = data as unknown as PL;
    const { data: orders } = await admin.from('orders').select('subtotal, diskon, shipping_cost, completed_at').eq('status', 'selesai');
    const pendapatan = orders!.filter((o) => o.completed_at! >= from && o.completed_at! <= `${to}T23:59:59`).reduce((s, o) => s + o.subtotal - o.diskon + o.shipping_cost, 0);
    expect(r.pendapatan).toBe(pendapatan);
    const { data: exp } = await admin.from('expenses').select('nominal').gte('tanggal', from).lte('tanggal', to);
    expect(r.biaya_operasional).toBe(exp!.reduce((s, e) => s + e.nominal, 0));
    expect(r.laba_bersih).toBe(r.pendapatan - r.hpp - r.biaya_operasional);
  });

  it('periode tertutup menolak perubahan biaya', async () => {
    const { data: closed } = await owner.from('period_closings').select('periode').eq('status', 'ditutup').limit(1);
    const { data: cat } = await owner.from('expense_categories').select('id').limit(1);
    const res = await owner.from('expenses').insert({ tanggal: closed![0].periode, category_id: cat![0].id, nominal: 1000 });
    expect(res.error?.message).toMatch(/ditutup/);
  });
});
