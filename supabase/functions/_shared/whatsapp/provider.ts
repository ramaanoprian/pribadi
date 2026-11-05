// Antarmuka penyedia WhatsApp. Sistem hanya bergantung pada interface ini,
// sehingga Fonnte bisa diganti WhatsApp Business API resmi cukup dengan
// menambah kelas baru dan mengubah env WHATSAPP_PROVIDER.

export type SendResult = { ok: true; messageId?: string } | { ok: false; error: string };

export type DeviceStatus = {
  provider: string;
  /** Token/kredensial sudah diatur */
  configured: boolean;
  /** Perangkat terhubung dan siap mengirim */
  connected: boolean;
  device?: string;
  name?: string;
  quota?: string;
  expired?: string;
  detail?: string;
};

export interface WhatsAppProvider {
  readonly name: string;
  /** `to` dalam format 628xxxxxxxxx */
  send(to: string, body: string): Promise<SendResult>;
  status(): Promise<DeviceStatus>;
}

const TIMEOUT_MS = 15_000;

/** Fonnte — https://docs.fonnte.com */
export class FonnteProvider implements WhatsAppProvider {
  readonly name = 'fonnte';
  constructor(private readonly token: string, private readonly baseUrl = 'https://api.fonnte.com') {}

  async send(to: string, body: string): Promise<SendResult> {
    const form = new FormData();
    form.set('target', to);
    form.set('message', body);
    form.set('countryCode', '62');
    try {
      const res = await fetch(`${this.baseUrl}/send`, {
        method: 'POST',
        headers: { Authorization: this.token },
        body: form,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const json = (await res.json().catch(() => ({}))) as { status?: boolean; id?: unknown; reason?: string; detail?: string };
      if (!res.ok || json.status !== true) {
        return { ok: false, error: json.reason ?? json.detail ?? `HTTP ${res.status}` };
      }
      const id = Array.isArray(json.id) ? String(json.id[0] ?? '') : json.id ? String(json.id) : undefined;
      return { ok: true, messageId: id };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  async status(): Promise<DeviceStatus> {
    try {
      const res = await fetch(`${this.baseUrl}/device`, {
        method: 'POST',
        headers: { Authorization: this.token },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (j.status !== true) {
        return { provider: this.name, configured: true, connected: false, detail: String(j.reason ?? j.detail ?? `HTTP ${res.status}`) };
      }
      return {
        provider: this.name,
        configured: true,
        connected: String(j.device_status ?? '').toLowerCase() === 'connect',
        device: j.device ? String(j.device) : undefined,
        name: j.name ? String(j.name) : undefined,
        quota: j.quota != null ? String(j.quota) : undefined,
        expired: j.expired ? String(j.expired) : undefined,
        detail: j.device_status ? String(j.device_status) : undefined,
      };
    } catch (e) {
      return { provider: this.name, configured: true, connected: false, detail: e instanceof Error ? e.message : String(e) };
    }
  }
}

/** Token belum diatur: semua pengiriman gagal dengan pesan jelas (fail closed). */
export class UnconfiguredProvider implements WhatsAppProvider {
  readonly name = 'belum_diatur';
  send(): Promise<SendResult> {
    return Promise.resolve({ ok: false, error: 'FONNTE_TOKEN belum diatur di secret Edge Function' });
  }
  status(): Promise<DeviceStatus> {
    return Promise.resolve({ provider: 'fonnte', configured: false, connected: false, detail: 'FONNTE_TOKEN belum diatur' });
  }
}

/**
 * KHUSUS PENGEMBANGAN/UJI (WHATSAPP_PROVIDER=dummy): tidak mengirim apa pun.
 * Nomor berakhiran 9999 disimulasikan gagal untuk menguji coba ulang.
 */
export class DummyProvider implements WhatsAppProvider {
  readonly name = 'dummy';
  send(to: string, body: string): Promise<SendResult> {
    console.log(`[wa:dummy] -> ${to}\n${body}`);
    if (to.endsWith('9999')) return Promise.resolve({ ok: false, error: 'Simulasi gagal (nomor uji 9999)' });
    return Promise.resolve({ ok: true, messageId: `dummy-${crypto.randomUUID()}` });
  }
  status(): Promise<DeviceStatus> {
    return Promise.resolve({ provider: this.name, configured: true, connected: true, device: 'dummy', name: 'Simulasi lokal' });
  }
}

export function getProvider(env: { get(key: string): string | undefined } = Deno.env): WhatsAppProvider {
  const kind = (env.get('WHATSAPP_PROVIDER') ?? 'fonnte').toLowerCase();
  if (kind === 'dummy') return new DummyProvider();
  // Tempat menambah penyedia resmi, mis.: if (kind === 'meta') return new MetaCloudProvider(...)
  const token = env.get('FONNTE_TOKEN');
  return token ? new FonnteProvider(token) : new UnconfiguredProvider();
}
