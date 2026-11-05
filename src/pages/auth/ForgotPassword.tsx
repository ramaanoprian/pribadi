import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/errors';
import { Input } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Card';
import { AuthCard } from './AuthCard';

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/atur-kata-sandi`,
    });
    setLoading(false);
    if (error) setError(errorMessage(error));
    else setSent(true);
  }

  return (
    <AuthCard
      title="Lupa kata sandi"
      subtitle="Kami akan mengirim tautan untuk membuat kata sandi baru."
      footer={
        <Link to="/masuk" className="font-semibold text-brand-600 hover:underline">
          Kembali ke halaman masuk
        </Link>
      }
    >
      {sent ? (
        <Alert tone="green" title="Tautan terkirim">
          Bila email {email} terdaftar, tautan atur ulang kata sandi sudah dikirim. Cek kotak masuk atau folder spam.
        </Alert>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          {error && <Alert tone="red">{error}</Alert>}
          <Input label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Button type="submit" block size="lg" loading={loading} disabled={!email}>
            Kirim tautan
          </Button>
        </form>
      )}
    </AuthCard>
  );
}
