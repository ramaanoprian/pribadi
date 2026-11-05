// Edge Function: undang akun staf lewat email (khusus Owner dengan 2FA).
//
// Alur:
//  1. Validasi input.
//  2. Panggil RPC create_staff_invitation memakai JWT pemanggil. Pengecekan
//     "Owner + aal2" dilakukan di database (sumber kebenaran tunggal).
//  3. Kirim email undangan via Auth Admin API (service role, hanya di server).
//     Trigger database memberi peran staf saat user undangan dibuat.
//  4. Bila pengiriman gagal, undangan ditandai "gagal".
// Tanpa dependensi eksternal (fetch langsung ke Auth & PostgREST).
import { corsHeaders, json } from '../_shared/cors.ts';
import { env, rpc, RpcError } from '../_shared/rest.ts';

const ROLES = ['owner', 'admin', 'admin_baking'] as const;
type StaffRole = (typeof ROLES)[number];

async function markFailed(invitationId: string, reason: string) {
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  await fetch(`${env('SUPABASE_URL')}/rest/v1/staff_invitations?id=eq.${encodeURIComponent(invitationId)}`, {
    method: 'PATCH',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ status: 'gagal', catatan: reason.slice(0, 500) }),
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Metode tidak didukung' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Harus masuk terlebih dahulu' }, 401);

  let body: { email?: unknown; role?: unknown; nama?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Format permintaan tidak valid' }, 400);
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const role = body.role as StaffRole;
  const nama = typeof body.nama === 'string' ? body.nama.trim().slice(0, 120) : '';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'Email tidak valid' }, 400);
  if (!ROLES.includes(role)) return json({ error: 'Peran tidak valid' }, 400);

  let invitationId: string;
  try {
    invitationId = await rpc<string>('create_staff_invitation', { p_email: email, p_role: role, p_nama: nama }, authHeader);
  } catch (e) {
    if (e instanceof RpcError) return json({ error: e.message }, e.code === '42501' ? 403 : 400);
    throw e;
  }

  const siteUrl = (Deno.env.get('APP_URL') ?? req.headers.get('origin') ?? '').replace(/\/$/, '');
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
  const redirect = siteUrl ? `?redirect_to=${encodeURIComponent(`${siteUrl}/atur-kata-sandi`)}` : '';
  const res = await fetch(`${env('SUPABASE_URL')}/auth/v1/invite${redirect}`, {
    method: 'POST',
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, data: { nama } }),
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { msg?: string; message?: string; error_description?: string };
    const reason = err.msg ?? err.message ?? err.error_description ?? `HTTP ${res.status}`;
    await markFailed(invitationId, reason);
    const already = /already|registered|exists/i.test(reason);
    return json({ error: already ? 'Email sudah terdaftar. Ubah perannya dari daftar akun.' : `Gagal mengirim undangan: ${reason}` }, 400);
  }

  return json({ ok: true, invitation_id: invitationId });
});
