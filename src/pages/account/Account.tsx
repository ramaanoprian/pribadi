import { LogOut, Stamp } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { AddressBook } from '@/components/account/AddressBook';
import { OrderHistory } from '@/components/account/OrderHistory';
import { ChangePasswordCard, ProfileCard } from '@/components/account/ProfileCard';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

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
        <div className="space-y-5 md:order-2">
          <ProfileCard phoneRequired />
          <ChangePasswordCard />
        </div>
        <div className="space-y-5 md:order-1">
          <OrderHistory />
          <AddressBook />
          <Card className="bg-cream-50">
            <div className="flex items-start gap-3">
              <Stamp className="mt-0.5 size-5 shrink-0 text-brand-500" />
              <div>
                <p className="font-semibold">Kartu stamp, lencana & hadiah</p>
                <p className="text-sm text-cocoa-600">Segera hadir: kumpulkan 1 stamp setiap pesanan selesai.</p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
