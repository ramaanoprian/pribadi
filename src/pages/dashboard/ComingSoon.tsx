import { Hammer } from 'lucide-react';
import { PageHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/States';

const PHASE_NAME: Record<number, string> = {
  2: 'Katalog & pesanan',
  3: 'Notifikasi WhatsApp',
  4: 'Produksi',
  5: 'Loyalti',
  6: 'Biaya & laporan',
  7: 'Analisis pelanggan',
};

export function ComingSoon({ title, phase }: { title: string; phase: number }) {
  return (
    <>
      <PageHeader title={title} />
      <EmptyState
        icon={<Hammer className="size-8" />}
        title={`Dibangun di Fase ${phase}`}
        description={`Modul ini termasuk Fase ${phase} (${PHASE_NAME[phase] ?? ''}). Menu sudah tampil sesuai hak akses peran Anda.`}
      />
    </>
  );
}
