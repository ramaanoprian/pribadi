/** Tes E2E Fase 7: analisis pelanggan khusus Owner. */
import { beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../src/lib/database.types';
import type { AnalyticsSummary, RankingRow } from '../../src/lib/analytics';
import { admin, login, loginOwner, ready } from './env';

describe.skipIf(!ready)('Fase 7 — analisis pelanggan (E2E)', () => {
  let owner: SupabaseClient<Database>;
  let adminC: SupabaseClient<Database>;
  beforeAll(async () => {
    owner = await loginOwner();
    adminC = await login('admin@gutvibes.test', 'Admin12345');
  });

  it('hanya Owner yang bisa membaca analisis', async () => {
    expect((await adminC.from('analisis_pelanggan').select('id')).data).toEqual([]);
    expect((await adminC.rpc('customer_ranking', {})).error?.code).toBe('42501');
  });

  it('peringkat konsisten dengan pesanan selesai', async () => {
    const { data } = await owner.rpc('customer_ranking', { p_sort: 'jumlah', p_limit: 100 });
    const rows = (data as unknown as { rows: RankingRow[] }).rows;
    expect(rows.length).toBeGreaterThan(0);
    const top = rows[0];
    const { count } = await admin.from('orders').select('id', { count: 'exact', head: true }).eq('customer_id', top.id).eq('status', 'selesai');
    expect(top.jumlah_periode).toBe(count);
    for (let i = 1; i < rows.length; i++) expect(rows[i - 1].jumlah_periode).toBeGreaterThanOrEqual(rows[i].jumlah_periode);
    const s = (await owner.rpc('customer_analytics_summary', {})).data as unknown as AnalyticsSummary;
    expect(s.aktif).toBe(rows.length);
  });
});
