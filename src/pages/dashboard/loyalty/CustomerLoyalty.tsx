import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stamp } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';

type Data = { stamp: number; target: number; lencana: string[]; riwayat: { tipe: string; qty: number; alasan: string | null; created_at: string }[] };
const TIPE: Record<string, string> = { earn: 'Pesanan selesai', adjust: 'Koreksi manual', kartu_penuh: 'Kartu penuh → hadiah' };

export function CustomerLoyalty({ customerId }: { customerId: string }) {
  const q = useQuery({
    queryKey: ['customer_loyalty', customerId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('customer_loyalty', { p_customer_id: customerId });
      if (error) throw error;
      return data as unknown as Data;
    },
  });
  const [open, setOpen] = useState(false);
  return (
    <Card className="mb-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-sans font-bold">
          <Stamp className="size-4 text-brand-500" /> Stamp & lencana
        </h2>
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
          Koreksi stamp
        </Button>
      </div>
      {q.isLoading ? (
        <Spinner />
      ) : q.data ? (
        <>
          <p className="mt-2 text-2xl font-bold">
            {q.data.stamp}/{q.data.target} <span className="text-sm font-normal text-cocoa-500">stamp di kartu</span>
          </p>
          <p className="text-sm text-cocoa-600">Lencana: {q.data.lencana.length ? q.data.lencana.join(', ') : '-'}</p>
          {q.data.riwayat.length > 0 && (
            <ul className="mt-3 max-h-48 divide-y divide-cream-200 overflow-y-auto text-sm">
              {q.data.riwayat.map((r, i) => (
                <li key={i} className="flex justify-between gap-2 py-1.5">
                  <span>
                    {TIPE[r.tipe] ?? r.tipe}
                    <span className="block text-xs text-cocoa-500">
                      {formatDateTime(r.created_at)}
                      {r.alasan ? ` · ${r.alasan}` : ''}
                    </span>
                  </span>
                  <span className={r.qty < 0 ? 'text-red-700' : 'text-emerald-700'}>
                    {r.qty > 0 ? '+' : ''}
                    {r.qty}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
      {open && <AdjustStampModal customerId={customerId} onClose={() => setOpen(false)} />}
    </Card>
  );
}

export function AdjustStampModal({ customerId, onClose }: { customerId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [qty, setQty] = useState('1');
  const [alasan, setAlasan] = useState('');
  const m = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('adjust_stamps', { p_customer_id: customerId, p_qty: Number(qty), p_alasan: alasan });
      if (error) throw error;
      return data;
    },
    onSuccess: (saldo) => {
      toast('success', `Stamp diperbarui. Saldo kartu: ${saldo}.`);
      void qc.invalidateQueries({ queryKey: ['customer_loyalty'] });
      void qc.invalidateQueries({ queryKey: ['loyalty_members'] });
      onClose();
    },
    onError: (e) => toast('error', errorMessage(e)),
  });
  return (
    <Modal
      open
      onClose={onClose}
      title="Koreksi stamp"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Batal
          </Button>
          <Button loading={m.isPending} disabled={!Number(qty) || alasan.trim().length < 3} onClick={() => m.mutate()}>
            Simpan
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input label="Jumlah (+ tambah, − kurangi)" type="number" value={qty} onChange={(e) => setQty(e.target.value)} min={-50} max={50} />
        <Input label="Alasan" value={alasan} onChange={(e) => setAlasan(e.target.value)} maxLength={200} required hint="Wajib. Tercatat di log aktivitas." />
      </div>
    </Modal>
  );
}
