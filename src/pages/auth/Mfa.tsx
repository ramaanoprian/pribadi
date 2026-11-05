import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/errors';
import { useAuth } from '@/auth/AuthProvider';
import { safeNext } from '@/auth/guards';
import { Input } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Card';
import { FullPageLoading, Spinner } from '@/components/ui/States';
import { AuthCard } from './AuthCard';

type Enrollment = { factorId: string; qr: string; secret: string };

/**
 * 2FA wajib untuk Owner (TOTP: Google Authenticator, Authy, dll.).
 * Database menolak hak Owner selama sesi belum aal2, jadi halaman ini adalah
 * gerbang wajib sebelum dashboard Owner.
 */
export function Mfa() {
  const { loading, profile, aal, refreshAal, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const next = safeNext(new URLSearchParams(location.search).get('next')) ?? '/dashboard';

  const [factorId, setFactorId] = useState<string | null>(null);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [preparing, setPreparing] = useState(true);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOwner = profile?.role === 'owner';

  useEffect(() => {
    if (loading || !isOwner || aal === 'aal2') return;
    let cancelled = false;
    (async () => {
      setPreparing(true);
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (cancelled) return;
      if (error) {
        setError(errorMessage(error));
        setPreparing(false);
        return;
      }
      const verified = data.totp.find((f) => f.status === 'verified');
      if (verified) {
        setFactorId(verified.id);
      } else {
        // Bersihkan pendaftaran lama yang belum selesai, lalu daftar baru.
        for (const f of data.all.filter((f) => f.status !== 'verified')) {
          await supabase.auth.mfa.unenroll({ factorId: f.id });
        }
        const res = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `GutVibes Owner ${Math.random().toString(36).slice(2, 7)}` });
        if (cancelled) return;
        if (res.error) setError(errorMessage(res.error));
        else {
          setFactorId(res.data.id);
          setEnrollment({ factorId: res.data.id, qr: res.data.totp.qr_code, secret: res.data.totp.secret });
        }
      }
      setPreparing(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, isOwner, aal]);

  if (loading) return <FullPageLoading />;
  if (!profile) return <Navigate to="/masuk" replace />;
  if (!isOwner) return <Navigate to="/dashboard" replace />;
  if (aal === 'aal2') return <Navigate to={next} replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
    if (error) {
      setBusy(false);
      setError(errorMessage(error));
      return;
    }
    await refreshAal();
    setBusy(false);
    navigate(next, { replace: true });
  }

  return (
    <div className="min-h-dvh bg-cream-100">
      <AuthCard
        title={enrollment ? 'Aktifkan verifikasi 2 langkah' : 'Verifikasi 2 langkah'}
        subtitle={
          enrollment
            ? 'Akun Owner wajib memakai 2FA. Pindai kode QR dengan aplikasi authenticator (Google Authenticator, Authy, 1Password, dll.).'
            : 'Masukkan 6 digit kode dari aplikasi authenticator Anda.'
        }
        footer={
          <button onClick={() => void signOut()} className="font-semibold text-brand-600 hover:underline">
            Keluar dan masuk dengan akun lain
          </button>
        }
      >
        {preparing ? (
          <Spinner label="Menyiapkan 2FA…" />
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            {error && <Alert tone="red">{error}</Alert>}
            {enrollment && (
              <div className="space-y-3">
                <div className="mx-auto w-48 rounded-2xl bg-white p-2 ring-1 ring-cream-200">
                  <img src={enrollment.qr} alt="Kode QR untuk aplikasi authenticator" className="w-full" />
                </div>
                <details className="text-sm text-cocoa-600">
                  <summary className="cursor-pointer font-semibold">Tidak bisa memindai? Masukkan kode manual</summary>
                  <code className="mt-2 block rounded-lg bg-cream-100 p-2 text-xs break-all">{enrollment.secret}</code>
                </details>
              </div>
            )}
            <Input
              label="Kode 6 digit"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className="text-center text-2xl tracking-[0.5em]"
              required
            />
            <Button type="submit" block size="lg" loading={busy} disabled={code.length !== 6} icon={<ShieldCheck className="size-5" />}>
              Verifikasi
            </Button>
            <p className="text-center text-xs text-cocoa-500">
              Kehilangan akses ke authenticator? Hubungi pengelola sistem untuk mereset 2FA. <Link to="/" className="underline">Beranda</Link>
            </p>
          </form>
        )}
      </AuthCard>
    </div>
  );
}
