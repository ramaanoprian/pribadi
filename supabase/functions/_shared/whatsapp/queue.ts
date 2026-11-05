import { rpc } from '../rest.ts';
import type { WhatsAppProvider } from './provider.ts';

type Claimed = { jeda_detik: number; pesan: { id: string; to: string; body: string; attempts: number }[] };
export type QueueSummary = { diproses: number; terkirim: number; dijadwalkan_ulang: number; gagal: number };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Proses antrean whatsapp_messages: klaim (batas per menit dihitung di DB),
 * kirim satu per satu dengan jeda, catat hasil. Berhenti bila antrean kosong
 * atau waktu habis.
 */
export async function processQueue(provider: WhatsAppProvider, opts: { maxMs?: number; batch?: number } = {}): Promise<QueueSummary> {
  const deadline = Date.now() + (opts.maxMs ?? 45_000);
  const summary: QueueSummary = { diproses: 0, terkirim: 0, dijadwalkan_ulang: 0, gagal: 0 };
  let first = true;

  while (Date.now() < deadline) {
    const claimed = await rpc<Claimed>('wa_claim_messages', { p_limit: opts.batch ?? 10 });
    if (!claimed.pesan.length) break;
    for (const m of claimed.pesan) {
      if (!first) await sleep(Math.max(1, claimed.jeda_detik) * 1000);
      first = false;
      const result = await provider.send(m.to, m.body);
      const state = await rpc<string>('wa_mark_result', {
        p_id: m.id,
        p_ok: result.ok,
        p_provider: provider.name,
        p_provider_message_id: result.ok ? result.messageId ?? null : null,
        p_error: result.ok ? null : result.error,
      });
      summary.diproses++;
      if (state === 'terkirim') summary.terkirim++;
      else if (state === 'gagal') summary.gagal++;
      else summary.dijadwalkan_ulang++;
      if (Date.now() >= deadline) break;
    }
  }
  return summary;
}
