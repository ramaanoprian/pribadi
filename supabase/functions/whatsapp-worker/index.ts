// Worker antrean WhatsApp. Dipanggil oleh pg_cron (tiap menit) dan oleh
// trigger saat pesan baru masuk (lewat pg_net). Dilindungi secret bersama
// (header x-worker-secret = env WA_WORKER_SECRET), bukan JWT pengguna.
import { getProvider } from '../_shared/whatsapp/provider.ts';
import { processQueue } from '../_shared/whatsapp/queue.ts';

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Metode tidak didukung', { status: 405 });
  const secret = Deno.env.get('WA_WORKER_SECRET');
  const given = req.headers.get('x-worker-secret') ?? '';
  if (!secret || !safeEqual(given, secret)) {
    return new Response(JSON.stringify({ error: 'Tidak diizinkan' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  try {
    const summary = await processQueue(getProvider(), { maxMs: 50_000 });
    return Response.json({ ok: true, ...summary });
  } catch (e) {
    console.error('[whatsapp-worker]', e);
    return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
});
