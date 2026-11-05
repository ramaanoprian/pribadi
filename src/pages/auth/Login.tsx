import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/errors';
import { Input } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Card';
import { AuthCard } from './AuthCard';
import { useSeo } from '@/hooks/useSeo';

export function Login() {
  useSeo({ title: 'Masuk', noindex: true });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (error) setError(errorMessage(error));
    // Bila berhasil, GuestOnly otomatis mengarahkan ke halaman awal sesuai peran.
  }

  return (
    <AuthCard
      title="Masuk"
      subtitle="Untuk member dan staf toko."
      footer={
        <>
          Belum punya akun?{' '}
          <Link to="/daftar" className="font-semibold text-brand-600 hover:underline">
            Daftar sebagai member
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {error && <Alert tone="red">{error}</Alert>}
        <Input label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Input label="Kata sandi" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <div className="flex justify-end">
          <Link to="/lupa-kata-sandi" className="text-sm font-semibold text-brand-600 hover:underline">
            Lupa kata sandi?
          </Link>
        </div>
        <Button type="submit" block size="lg" loading={loading} disabled={!email || !password}>
          Masuk
        </Button>
      </form>
    </AuthCard>
  );
}
