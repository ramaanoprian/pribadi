import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Gift } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/errors';
import { formatDate, formatDateTime, formatRupiah } from '@/lib/format';
import { Alert, Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';

type Props = { orderId: string; redemptionId: string; status: string; verifiedAt: string | null; rewardDiskon: number; gratisOngkir: boolean };

/** Hadiah member pada pesanan: verifikasi atau tolak (Owner/Admin). */
export function OrderReward({ orderId, redemptionId, status, verifiedAt, rewardDiskon, gratisOngkir }: Props) {
  const qc = useQueryClient();
  const toast = useToast();
  const [rejecting, setRejecting] = useState(false);
  const [alasan, setAlasan] = useState('');
  const q = useQuery({
    queryKey: ['reward_redemptions', redemptionId],
    queryFn: async () => {
      const { data, error } = await supabase.from('reward_redemptions').select('kode, nama, expires_at, created_at').eq('id', redemptionId).single();
      if (error) throw error;
      return data;
    },
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['orders'] });
    void qc.invalidateQueries({ queryKey: ['reward_redemptions'] });
  };
  const verify = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('verify_order_reward', { p_order_id: orderId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast('success', 'Hadiah diverifikasi.');
      refresh();
    },
    onError: (e) => toast('error', errorMessage(e)),
  });
  const reject = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('reject_order_reward', { p_order_id: orderId, p_alasan: alasan });
      if (error) throw error;
    },
    onSuccess: () => {
      toast('success', 'Hadiah ditolak dan dikembalikan ke member. Total pesanan diperbarui.');
      setRejecting(false);
      refresh();
    },
    onError: (e) => toast('error', errorMessage(e)),
  });
  return (
    <Card className="border-l-4 border-l-brand-500">
      <h2 className="flex items-center gap-2 font-sans font-bold">
        <Gift className="size-4 text-brand-500" /> Hadiah member
      </h2>
      {q.data && (
        <p className="mt-2 text-sm">
          <strong>{q.data.nama}</strong> <span className="font-mono text-xs text-cocoa-500">{q.data.kode}</span>
          <span className="block text-xs text-cocoa-500">
            Terbuka {formatDate(q.data.created_at)} · berlaku hingga {formatDate(q.data.expires_at)}
          </span>
          <span className="block text-xs text-cocoa-600">{gratisOngkir ? 'Gratis ongkir' : `Potongan ${formatRupiah(rewardDiskon)}`}</span>
        </p>
      )}
      {verifiedAt ? (
        <p className="mt-2 text-sm text-emerald-700">Terverifikasi {formatDateTime(verifiedAt)}</p>
      ) : status === 'menunggu_konfirmasi' ? (
        <>
          <Alert tone="amber" className="mt-2">
            Cocokkan kode hadiah dengan member sebelum mengonfirmasi pembayaran.
          </Alert>
          <div className="mt-2 flex gap-2">
            <Button size="sm" loading={verify.isPending} onClick={() => verify.mutate()}>
              Verifikasi
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setRejecting(true)}>
              Tolak
            </Button>
          </div>
        </>
      ) : null}
      <Modal
        open={rejecting}
        onClose={() => setRejecting(false)}
        title="Tolak hadiah?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRejecting(false)}>
              Batal
            </Button>
            <Button variant="danger" loading={reject.isPending} disabled={alasan.trim().length < 3} onClick={() => reject.mutate()}>
              Tolak hadiah
            </Button>
          </>
        }
      >
        <Textarea label="Alasan" value={alasan} onChange={(e) => setAlasan(e.target.value)} maxLength={200} hint="Hadiah kembali ke akun member; potongan dihapus dari pesanan." />
      </Modal>
    </Card>
  );
}
