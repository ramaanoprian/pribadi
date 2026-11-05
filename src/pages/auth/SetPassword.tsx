import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/errors';
import { homePathFor } from '@/lib/permissions';
import { useAuth } from '@/auth/AuthProvider';
import { Input } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Card';
import { FullPageLoading } from '@/components/ui/States';
import { AuthCard } from './AuthCard';
import { validatePassword } from '@/lib/validation';

/** Halaman tujuan tautan undangan staf & atur ulang kata sandi. */
export function SetPassword() {
  const { loading, session, profile } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [konfirmasi, setKonfirmasi] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading) return <FullPageLoading />;
  if (!session) {
    return (
      <AuthCard title="Tautan tidak valid" subtitle="Tautan sudah kedaluwarsa atau sudah dipakai.">
        <Link to="/lupa-kata-sandi" className="font-semibold text-brand-600 hover:underline">
          Minta tautan baru
        </Link>
      </AuthCard>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const v = validatePassword(password);
    if (v) return setError(v);
    if (password !== konfirmasi) return setError('Konfirmasi kata sandi tidak sama.');
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return setError(errorMessage(error));
    navigate(homePathFor(profile?.role), { replace: true });
  }

  return (
    <AuthCard title="Buat kata sandi" subtitle={`Akun: ${session.user.email}`}>
      <form onSubmit={onSubmit} className="space-y-4">
        {error && <Alert tone="red">{error}</Alert>}
        <Input label="Kata sandi baru" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} hint="Minimal 8 karakter, berisi huruf dan angka." required />
        <Input label="Ulangi kata sandi" type="password" autoComplete="new-password" value={konfirmasi} onChange={(e) => setKonfirmasi(e.target.value)} required />
        <Button type="submit" block size="lg" loading={busy}>
          Simpan kata sandi
        </Button>
      </form>
    </AuthCard>
  );
}
