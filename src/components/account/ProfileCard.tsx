import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/errors';
import { normalizePhone } from '@/lib/phone';
import { validatePassword } from '@/lib/validation';
import { useAuth } from '@/auth/AuthProvider';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { formatPhone } from '@/lib/phone';

export function ProfileCard({ phoneRequired }: { phoneRequired?: boolean }) {
  const { profile, refreshProfile } = useAuth();
  const toast = useToast();
  const [nama, setNama] = useState('');
  const [noHp, setNoHp] = useState('');
  const [errors, setErrors] = useState<{ nama?: string; no_hp?: string }>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setNama(profile?.nama ?? '');
    setNoHp(profile?.no_hp ? formatPhone(profile.no_hp) : '');
  }, [profile]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const v: typeof errors = {};
    if (nama.trim().length < 2) v.nama = 'Nama minimal 2 huruf.';
    const hp = noHp.trim() ? normalizePhone(noHp) : null;
    if (noHp.trim() && !hp) v.no_hp = 'Nomor HP tidak valid.';
    if (phoneRequired && !hp) v.no_hp = 'Nomor HP wajib diisi.';
    setErrors(v);
    if (Object.keys(v).length || !profile) return;
    setBusy(true);
    const { error } = await supabase.from('profiles').update({ nama: nama.trim(), no_hp: hp }).eq('id', profile.id);
    setBusy(false);
    if (error) return toast('error', errorMessage(error));
    await refreshProfile();
    toast('success', 'Profil tersimpan.');
  }

  return (
    <Card>
      <h2 className="font-sans text-lg font-bold">Profil</h2>
      <form onSubmit={onSubmit} className="mt-4 space-y-4">
        <Input label="Email" value={profile?.email ?? ''} disabled hint="Email dipakai untuk masuk dan tidak bisa diubah di sini." />
        <Input label="Nama" value={nama} onChange={(e) => setNama(e.target.value)} error={errors.nama} required />
        <Input label="Nomor HP (WhatsApp)" type="tel" inputMode="tel" value={noHp} onChange={(e) => setNoHp(e.target.value)} error={errors.no_hp} placeholder="0812xxxxxxxx" required={phoneRequired} />
        <Button type="submit" loading={busy}>
          Simpan profil
        </Button>
      </form>
    </Card>
  );
}

export function ChangePasswordCard() {
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [konfirmasi, setKonfirmasi] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const v = validatePassword(password) ?? (password !== konfirmasi ? 'Konfirmasi kata sandi tidak sama.' : null);
    setError(v);
    if (v) return;
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    setPassword('');
    setKonfirmasi('');
    toast('success', 'Kata sandi diperbarui.');
  }

  return (
    <Card>
      <h2 className="font-sans text-lg font-bold">Ubah kata sandi</h2>
      <form onSubmit={onSubmit} className="mt-4 space-y-4">
        <Input label="Kata sandi baru" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} hint="Minimal 8 karakter, berisi huruf dan angka." error={error} />
        <Input label="Ulangi kata sandi" type="password" autoComplete="new-password" value={konfirmasi} onChange={(e) => setKonfirmasi(e.target.value)} />
        <Button type="submit" variant="secondary" loading={busy} disabled={!password}>
          Ubah kata sandi
        </Button>
      </form>
    </Card>
  );
}
