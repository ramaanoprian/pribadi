// Edge Function: undang akun staf lewat email (khusus Owner dengan 2FA).
//
// Alur:
//  1. Validasi input.
//  2. Panggil RPC create_staff_invitation memakai JWT pemanggil. Pengecekan
//     "Owner + aal2" dilakukan di database (sumber kebenaran tunggal).
//  3. Kirim email undangan via Auth Admin API (service role, hanya di server).
//     Trigger database memberi peran staf saat user undangan dibuat.
//  4. Bila pengiriman gagal, undangan ditandai "gagal".
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, json } from '../_shared/cors.ts';

const ROLES = ['owner', 'admin', 'admin_baking'] as const;
type StaffRole = (typeof ROLES)[number];

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

  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const siteUrl = Deno.env.get('APP_URL') ?? req.headers.get('origin') ?? '';

  // Klien atas nama pemanggil -> RLS & cek peran berlaku.
  const asCaller = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: invitationId, error: rpcError } = await asCaller.rpc('create_staff_invitation', {
    p_email: email,
    p_role: role,
    p_nama: nama,
  });
  if (rpcError) {
    const status = rpcError.code === '42501' ? 403 : 400;
    return json({ error: rpcError.message }, status);
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: siteUrl ? `${siteUrl.replace(/\/$/, '')}/atur-kata-sandi` : undefined,
    data: { nama },
  });

  if (inviteError) {
    await admin
      .from('staff_invitations')
      .update({ status: 'gagal', catatan: inviteError.message })
      .eq('id', invitationId);
    const already = /already|registered|exists/i.test(inviteError.message);
    return json(
      { error: already ? 'Email sudah terdaftar. Ubah perannya dari daftar akun.' : `Gagal mengirim undangan: ${inviteError.message}` },
      400,
    );
  }

  return json({ ok: true, invitation_id: invitationId });
});
