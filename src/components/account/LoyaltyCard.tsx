import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { Award, Cookie, Crown, Gift, Heart, ShieldCheck, Star } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/auth/AuthProvider';
import { errorMessage } from '@/lib/errors';
import { formatDate, formatRupiah } from '@/lib/format';
import { formatPhone } from '@/lib/phone';
import { effectiveStatus, REDEMPTION_STATUS, type MyLoyalty } from '@/lib/loyalty';
import { Alert, Badge, Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { ErrorState, LoadingState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';

const ICONS = { Cookie, Heart, Star, Crown, Award } as const;

export function useMyLoyalty() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['my_loyalty', profile?.id],
    enabled: profile?.role === 'member',
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_loyalty');
      if (error) throw error;
      return data as unknown as MyLoyalty;
    },
  });
}

/** Kartu stamp, hadiah, dan lencana member. */
export function LoyaltyCard() {
  const q = useMyLoyalty();
  if (q.isLoading) return <LoadingState label="Memuat kartu stamp…" />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />;
  const d = q.data!;
  const filled = Math.min(d.stamp, d.target);
  const available = d.hadiah_saya.filter((h) => effectiveStatus(h.status, h.expires_at) === 'tersedia');
  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 p-5 text-white shadow-lg shadow-brand-500/20" aria-label="Kartu stamp">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-white/80">Kartu stamp</p>
            <p className="font-display text-3xl font-bold">
              {filled}/{d.target}
            </p>
          </div>
          <img src="/brand/symbol-white.png" alt="" className="size-10 opacity-90" />
        </div>
        <div className="mt-4 grid grid-cols-5 gap-2" role="list" aria-label={`${filled} dari ${d.target} stamp`}>
          {Array.from({ length: d.target }, (_, i) => (
            <div
              key={i}
              role="listitem"
              className={clsx('grid aspect-square place-items-center rounded-full border-2', i < filled ? 'border-white bg-white text-brand-600' : 'border-white/40 border-dashed text-white/50')}
            >
              {i < filled ? <img src="/brand/symbol.png" alt="" className="w-3/5" /> : <span className="text-xs font-bold">{i + 1}</span>}
            </div>
          ))}
        </div>
        <p className="mt-4 text-sm text-white/90">
          {d.aktif ? (
            <>
              Kumpulkan {d.target} stamp, dapatkan <strong>{d.hadiah}</strong>.{' '}
              {d.min_belanja > 0 ? `1 pesanan selesai minimal ${formatRupiah(d.min_belanja)} = 1 stamp.` : '1 pesanan selesai = 1 stamp.'}
            </>
          ) : (
            'Program stamp sedang tidak aktif.'
          )}
        </p>
      </section>

      {!d.phone_verified && <PhoneVerifyCard currentPhone={d.no_hp} />}

      <Card>
        <h2 className="flex items-center gap-2 font-sans text-lg font-bold">
          <Gift className="size-5 text-brand-500" /> Hadiah saya
        </h2>
        {d.hadiah_saya.length === 0 ? (
          <p className="mt-2 text-sm text-cocoa-500">Belum ada hadiah. Penuhi kartu stamp untuk membuka hadiah.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {d.hadiah_saya.map((h) => {
              const st = REDEMPTION_STATUS[effectiveStatus(h.status, h.expires_at)];
              return (
                <li key={h.kode} className="flex items-center justify-between gap-3 rounded-xl border border-cream-200 p-3 text-sm">
                  <span>
                    <span className="font-semibold">{h.nama}</span>
                    <span className="block font-mono text-xs text-cocoa-500">{h.kode}</span>
                    <span className="block text-xs text-cocoa-500">Berlaku hingga {formatDate(h.expires_at)}</span>
                  </span>
                  <Badge tone={st.tone}>{st.label}</Badge>
                </li>
              );
            })}
          </ul>
        )}
        {available.length > 0 && <p className="mt-3 text-xs text-cocoa-600">Pilih hadiah saat checkout. Hadiah diverifikasi Admin sebelum pesanan diproses.</p>}
      </Card>

      <Card>
        <h2 className="font-sans text-lg font-bold">Lencana</h2>
        <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {d.lencana.map((b) => {
            const Icon = ICONS[b.ikon as keyof typeof ICONS] ?? Award;
            const earned = Boolean(b.earned_at);
            return (
              <li key={b.kode} className={clsx('rounded-xl p-3 text-center ring-1', earned ? 'bg-brand-50 ring-brand-200' : 'bg-cream-50 opacity-60 ring-cream-200')}>
                <Icon className={clsx('mx-auto size-7', earned ? 'text-brand-500' : 'text-cocoa-400')} aria-hidden />
                <p className="mt-1 text-sm font-semibold">{b.nama}</p>
                <p className="text-xs text-cocoa-500">{earned ? `Didapat ${formatDate(b.earned_at)}` : `${d.pesanan_selesai}/${b.ambang} pesanan`}</p>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}

/** Verifikasi nomor HP lewat kode OTP WhatsApp (untuk klaim pesanan tamu lama). */
function PhoneVerifyCard({ currentPhone }: { currentPhone: string | null }) {
  const qc = useQueryClient();
  const { refreshProfile } = useAuth();
  const toast = useToast();
  const [phone, setPhone] = useState(currentPhone ? formatPhone(currentPhone) : '');
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const request = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('request_phone_otp', { p_phone: phone });
      if (error) throw error;
    },
    onSuccess: () => {
      setSent(true);
      setError(null);
      toast('success', 'Kode verifikasi dikirim lewat WhatsApp.');
    },
    onError: (e) => setError(errorMessage(e)),
  });
  const verify = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('verify_phone_otp', { p_code: code });
      if (error) throw error;
      return data as { ok: boolean; pesan?: string; sisa_percobaan?: number; stamp_diklaim?: number };
    },
    onSuccess: async (r) => {
      if (!r.ok) {
        setError(`${r.pesan ?? 'Kode salah'}. Sisa percobaan: ${r.sisa_percobaan ?? 0}.`);
        return;
      }
      toast('success', r.stamp_diklaim ? `Nomor terverifikasi! ${r.stamp_diklaim} pesanan lama ditambahkan sebagai stamp.` : 'Nomor terverifikasi!');
      await refreshProfile();
      void qc.invalidateQueries({ queryKey: ['my_loyalty'] });
      void qc.invalidateQueries({ queryKey: ['my_orders'] });
    },
    onError: (e) => setError(errorMessage(e)),
  });

  return (
    <Card className="border-l-4 border-l-brand-500">
      <h2 className="flex items-center gap-2 font-sans text-lg font-bold">
        <ShieldCheck className="size-5 text-brand-500" /> Verifikasi nomor WhatsApp
      </h2>
      <p className="mt-1 text-sm text-cocoa-600">Pernah memesan sebagai tamu? Verifikasi nomor yang dipakai agar pesanan lama yang sudah selesai dihitung sebagai stamp.</p>
      {error && (
        <Alert tone="red" className="mt-3">
          {error}
        </Alert>
      )}
      {!sent ? (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Input label="Nomor WhatsApp" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0812xxxxxxxx" />
          </div>
          <Button loading={request.isPending} disabled={!phone.trim()} onClick={() => request.mutate()}>
            Kirim kode
          </Button>
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Input
              label="Kode 6 digit dari WhatsApp"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className="text-center text-xl tracking-[0.4em]"
            />
          </div>
          <Button loading={verify.isPending} disabled={code.length !== 6} onClick={() => verify.mutate()}>
            Verifikasi
          </Button>
          <Button variant="ghost" onClick={() => { setSent(false); setCode(''); }}>
            Ganti nomor
          </Button>
        </div>
      )}
    </Card>
  );
}
