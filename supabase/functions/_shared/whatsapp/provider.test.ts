// deno test supabase/functions/_shared/whatsapp/provider.test.ts
import { DummyProvider, FonnteProvider, getProvider, UnconfiguredProvider } from './provider.ts';

function assertEquals(a: unknown, b: unknown, msg?: string) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg ?? 'assertEquals'}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`);
}

const envOf = (vars: Record<string, string>) => ({ get: (k: string) => vars[k] });

Deno.test('getProvider memilih penyedia sesuai env', () => {
  assertEquals(getProvider(envOf({ WHATSAPP_PROVIDER: 'dummy' })) instanceof DummyProvider, true);
  assertEquals(getProvider(envOf({ FONNTE_TOKEN: 'abc' })) instanceof FonnteProvider, true);
  assertEquals(getProvider(envOf({})) instanceof UnconfiguredProvider, true, 'tanpa token = fail closed');
});

Deno.test('Fonnte: kirim memakai header Authorization & form target/message', async () => {
  const orig = globalThis.fetch;
  let captured: { url: string; auth: string | null; target: unknown; message: unknown } | null = null;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const form = init?.body as FormData;
    captured = { url: String(input), auth: new Headers(init?.headers).get('Authorization'), target: form.get('target'), message: form.get('message') };
    return new Response(JSON.stringify({ status: true, id: ['123'], process: 'pending' }));
  }) as typeof fetch;
  try {
    const r = await new FonnteProvider('TOKEN-X').send('628111', 'Halo');
    assertEquals(r, { ok: true, messageId: '123' });
    assertEquals(captured, { url: 'https://api.fonnte.com/send', auth: 'TOKEN-X', target: '628111', message: 'Halo' });
  } finally {
    globalThis.fetch = orig;
  }
});

Deno.test('Fonnte: status false dikembalikan sebagai gagal dengan alasan', async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ status: false, reason: 'device disconnected' }))) as typeof fetch;
  try {
    assertEquals(await new FonnteProvider('T').send('628111', 'x'), { ok: false, error: 'device disconnected' });
  } finally {
    globalThis.fetch = orig;
  }
});

Deno.test('Fonnte: status perangkat', async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ status: true, device: '62812', device_status: 'disconnect', name: 'Toko', quota: '1000' }))) as typeof fetch;
  try {
    const s = await new FonnteProvider('T').status();
    assertEquals([s.connected, s.device, s.detail], [false, '62812', 'disconnect']);
  } finally {
    globalThis.fetch = orig;
  }
});

Deno.test('Dummy: nomor berakhiran 9999 disimulasikan gagal', async () => {
  const d = new DummyProvider();
  assertEquals((await d.send('6281200009999', 'x')).ok, false);
  assertEquals((await d.send('6281200001111', 'x')).ok, true);
});
