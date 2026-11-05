import type { Tables } from '@/lib/database.types';
import { ROLE_LABEL } from '@/lib/permissions';
import type { AppRole } from '@/lib/database.types';

type Log = Tables<'audit_logs'>;

export const ENTITAS_LABEL: Record<string, string> = {
  akun: 'Akun',
  undangan_staf: 'Undangan staf',
  pengaturan: 'Pengaturan',
  pelanggan: 'Pelanggan',
  pesanan: 'Pesanan',
};

const roleLabel = (r: unknown) => ROLE_LABEL[r as AppRole] ?? String(r);

/** Kalimat singkat Bahasa Indonesia untuk satu baris log. */
export function describeAudit(l: Log): string {
  const lama = (l.data_lama ?? {}) as Record<string, unknown>;
  const baru = (l.data_baru ?? {}) as Record<string, unknown>;
  switch (l.aksi) {
    case 'akun.ubah': {
      const parts: string[] = [];
      if (lama.role !== baru.role) parts.push(`mengubah peran dari ${roleLabel(lama.role)} menjadi ${roleLabel(baru.role)}`);
      if (lama.aktif !== baru.aktif) parts.push(baru.aktif ? 'mengaktifkan akun' : 'menonaktifkan akun');
      return parts.join(' dan ') || 'mengubah akun';
    }
    case 'undangan_staf.tambah':
      return `mengundang ${baru.email} sebagai ${roleLabel(baru.role)}`;
    case 'undangan_staf.ubah':
      return `mengubah status undangan ${baru.email ?? ''} menjadi ${baru.status}`;
    case 'pengaturan.ubah':
      return `mengubah pengaturan ${l.entitas_id}`;
    default:
      if (l.aksi.endsWith('.ekspor_data')) return `mengekspor data ${ENTITAS_LABEL[l.entitas] ?? l.entitas}`;
      return `${l.aksi} (${l.entitas}${l.entitas_id ? ` ${l.entitas_id}` : ''})`;
  }
}
