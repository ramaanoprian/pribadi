import { useQuery } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatDateTime } from '@/lib/format';
import { useAuth } from '@/auth/AuthProvider';
import { ChangePasswordCard, ProfileCard } from '@/components/account/ProfileCard';
import { Card, PageHeader } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/States';

function TwoFactorCard() {
  const q = useQuery({
    queryKey: ['mfa_factors'],
    queryFn: async () => {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;
      return data.totp.filter((f) => f.status === 'verified');
    },
  });
  return (
    <Card>
      <h2 className="flex items-center gap-2 font-sans text-lg font-bold">
        <ShieldCheck className="size-5 text-emerald-600" /> Verifikasi 2 langkah
      </h2>
      {q.isLoading ? (
        <div className="mt-3">
          <Spinner />
        </div>
      ) : (
        <ul className="mt-3 space-y-2 text-sm">
          {q.data?.map((f) => (
            <li key={f.id} className="rounded-lg bg-cream-100 px-3 py-2">
              {f.friendly_name ?? 'Authenticator'} · terdaftar {formatDateTime(f.created_at)}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-cocoa-500">2FA wajib untuk Owner dan tidak bisa dimatikan dari aplikasi.</p>
    </Card>
  );
}

export function MyProfile() {
  const { profile } = useAuth();
  return (
    <>
      <PageHeader title="Profil Saya" />
      <div className="grid gap-5 lg:grid-cols-2">
        <ProfileCard />
        <div className="space-y-5">
          <ChangePasswordCard />
          {profile?.role === 'owner' && <TwoFactorCard />}
        </div>
      </div>
    </>
  );
}
