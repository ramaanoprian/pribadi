// Aksi WhatsApp dari dashboard:
//   status -> status perangkat penyedia (Owner)
//   test   -> uji kirim ke nomor tertentu (Owner)
//   proses -> proses antrean sekarang, mis. setelah kirim ulang (Owner/Admin)
// Hak akses diperiksa di database memakai JWT pemanggil.
import { corsHeaders, json } from '../_shared/cors.ts';
import { rpc, RpcError } from '../_shared/rest.ts';
import { getProvider } from '../_shared/whatsapp/provider.ts';
import { processQueue } from '../_shared/whatsapp/queue.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Metode tidak didukung' }, 405);
  const auth = req.headers.get('Authorization');
  if (!auth) return json({ error: 'Harus masuk terlebih dahulu' }, 401);

  let body: { action?: string; to?: string; pesan?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Format permintaan tidak valid' }, 400);
  }

  try {
    const role = await rpc<string | null>('my_effective_role', {}, auth);
    const provider = getProvider();

    switch (body.action) {
      case 'status': {
        if (role !== 'owner') return json({ error: 'Khusus Owner' }, 403);
        return json(await provider.status());
      }
      case 'test': {
        // wa_enqueue_test memeriksa Owner + 2FA dan batas uji kirim.
        const id = await rpc<string>('wa_enqueue_test', { p_to: body.to ?? '', p_pesan: body.pesan ?? null }, auth);
        const summary = await processQueue(provider, { maxMs: 20_000 });
        return json({ ok: true, id, ...summary });
      }
      case 'proses': {
        if (role !== 'owner' && role !== 'admin') return json({ error: 'Akses ditolak' }, 403);
        return json({ ok: true, ...(await processQueue(provider, { maxMs: 20_000 })) });
      }
      default:
        return json({ error: 'Aksi tidak dikenal' }, 400);
    }
  } catch (e) {
    if (e instanceof RpcError) return json({ error: e.message }, e.code === '42501' ? 403 : 400);
    console.error('[whatsapp-admin]', e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
