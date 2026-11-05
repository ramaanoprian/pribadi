import { ChangePasswordCard, ProfileCard } from '@/components/account/ProfileCard';
import { PageHeader } from '@/components/ui/Card';

export function MyProfile() {
  return (
    <>
      <PageHeader title="Profil Saya" />
      <div className="grid gap-5 lg:grid-cols-2">
        <ProfileCard />
        <div className="space-y-5">
          <ChangePasswordCard />
        </div>
      </div>
    </>
  );
}
