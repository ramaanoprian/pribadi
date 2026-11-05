import { LogOut } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { AddressBook } from '@/components/account/AddressBook';
import { OrderHistory } from '@/components/account/OrderHistory';
import { LoyaltyCard } from '@/components/account/LoyaltyCard';
import { ChangePasswordCard, ProfileCard } from '@/components/account/ProfileCard';
import { Button } from '@/components/ui/Button';

export function Account() {
  const { profile, signOut } = useAuth();
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:py-12">
      <div className="mb-6 flex items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-brand-600">Akun Saya</p>
          <h1 className="text-3xl font-bold">Halo, {profile?.nama?.split(' ')[0] || 'Member'}!</h1>
        </div>
        <Button variant="ghost" size="sm" icon={<LogOut className="size-4" />} onClick={() => void signOut()}>
          Keluar
        </Button>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-5">
          <LoyaltyCard />
          <OrderHistory />
          <AddressBook />
        </div>
        <div className="space-y-5">
          <ProfileCard phoneRequired />
          <ChangePasswordCard />
        </div>
      </div>
    </div>
  );
}
