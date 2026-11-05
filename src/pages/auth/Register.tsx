import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { MailCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/errors';
import { normalizePhone } from '@/lib/phone';
import { isEmail, validatePassword } from '@/lib/validation';
import { Input } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Card';
import { AuthCard } from './AuthCard';

type Errors = Partial<Record<'nama' | 'email' | 'no_hp' | 'password' | 'konfirmasi', string>>;

export function Register() {
  const [form, setForm] = useState({ nama: '', email: '', no_hp: '', password: '', konfirmasi: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function validate(): Errors {
    const v: Errors = {};
    if (form.nama.trim().length < 2) v.nama = 'Nama minimal 2 huruf.';
    if (!isEmail(form.email)) v.email = 'Email tidak valid.';
    if (!normalizePhone(form.no_hp)) v.no_hp = 'Nomor HP tidak valid. Contoh: 0812xxxxxxxx.';
    const pw = validatePassword(form.password);
    if (pw) v.password = pw;
    if (form.konfirmasi !== form.password) v.konfirmasi = 'Konfirmasi kata sandi tidak sama.';
    return v;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const v = validate();
    setErrors(v);
    if (Object.keys(v).length) return;
    setError(null);
    setLoading(true);
    const email = form.email.trim().toLowerCase();
    const { data, error } = await supabase.auth.signUp({
      email,
      password: form.password,
      options: {
        data: { nama: form.nama.trim(), no_hp: normalizePhone(form.no_hp) },
        emailRedirectTo: `${window.location.origin}/akun`,
      },
    });
    setLoading(false);
    if (error) return setError(errorMessage(error));
    if (!data.session) setSentTo(email);
  }

  if (sentTo) {
    return (
      <AuthCard title="Cek email Anda" subtitle={`Kami mengirim tautan konfirmasi ke ${sentTo}.`}>
        <div className="flex flex-col items-center gap-3 text-center text-sm text-cocoa-600">
          <MailCheck className="size-12 text-brand-500" />
          <p>Klik tautan di email tersebut untuk mengaktifkan akun, lalu masuk.</p>
          <Link to="/masuk" className="font-semibold text-brand-600 hover:underline">
            Ke halaman masuk
          </Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Daftar member"
      subtitle="Simpan alamat, pesan ulang dengan cepat, dan kumpulkan stamp."
      footer={
        <>
          Sudah punya akun?{' '}
          <Link to="/masuk" className="font-semibold text-brand-600 hover:underline">
            Masuk
          </Link>
          <p className="mt-2 text-xs text-cocoa-500">Akun staf dibuat lewat undangan Owner, bukan dari halaman ini.</p>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {error && <Alert tone="red">{error}</Alert>}
        <Input label="Nama" autoComplete="name" value={form.nama} onChange={set('nama')} error={errors.nama} required />
        <Input label="Email" type="email" autoComplete="email" value={form.email} onChange={set('email')} error={errors.email} required />
        <Input
          label="Nomor HP (WhatsApp)"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="0812xxxxxxxx"
          value={form.no_hp}
          onChange={set('no_hp')}
          error={errors.no_hp}
          hint="Dipakai untuk konfirmasi pesanan via WhatsApp."
          required
        />
        <Input label="Kata sandi" type="password" autoComplete="new-password" value={form.password} onChange={set('password')} error={errors.password} hint="Minimal 8 karakter, berisi huruf dan angka." required />
        <Input label="Ulangi kata sandi" type="password" autoComplete="new-password" value={form.konfirmasi} onChange={set('konfirmasi')} error={errors.konfirmasi} required />
        <Button type="submit" block size="lg" loading={loading}>
          Daftar
        </Button>
      </form>
    </AuthCard>
  );
}
