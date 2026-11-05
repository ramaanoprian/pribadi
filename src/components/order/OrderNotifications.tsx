import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageCircle, RotateCcw } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';
import { WA_TAHAP_LABEL } from '@/lib/whatsapp';
import { waAdmin } from '@/hooks/useWhatsApp';
import { WaStatusBadge } from '@/components/WaStatusBadge';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';

/** Status notifikasi WhatsApp untuk satu pesanan (detail pesanan Admin/Owner). */
export function OrderNotifications({ orderId }: { orderId: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({
    queryKey: ['wa_messages', 'order', orderId],
    // Pantau lebih sering selama masih ada pesan yang antre/mengirim.
    refetchInterval: (query) => (query.state.data?.some((m) => m.status === 'pending' || m.status === 'mengirim') ? 3_000 : 15_000),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('whatsapp_messages')
        .select('id, tahap, status, attempts, max_attempts, sent_at, created_at, last_error')
        .eq('order_id', orderId)
        .order('created_at');
      if (error) throw error;
      return data;
    },
  });
  const resend = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('wa_resend', { p_id: id });
      if (error) throw error;
      await waAdmin({ action: 'proses' }).catch(() => null);
    },
    onSuccess: () => {
      toast('success', 'Pesan dikirim ulang.');
      void qc.invalidateQueries({ queryKey: ['wa_messages'] });
    },
    onError: (e) => toast('error', errorMessage(e)),
  });
  return (
    <Card>
      <h2 className="flex items-center gap-2 font-sans font-bold">
        <MessageCircle className="size-4 text-emerald-600" /> Notifikasi WhatsApp
      </h2>
      {q.isLoading ? (
        <p className="mt-2 text-sm text-cocoa-500">Memuat…</p>
      ) : !q.data?.length ? (
        <p className="mt-2 text-sm text-cocoa-500">Belum ada notifikasi untuk pesanan ini.</p>
      ) : (
        <ul className="mt-3 space-y-2.5 text-sm">
          {q.data.map((m) => (
            <li key={m.id}>
              <div className="flex items-center justify-between gap-2">
                <span>{WA_TAHAP_LABEL[m.tahap] ?? m.tahap}</span>
                <WaStatusBadge status={m.status} />
              </div>
              <p className="text-xs text-cocoa-500">
                {m.sent_at ? `Terkirim ${formatDateTime(m.sent_at)}` : `Dibuat ${formatDateTime(m.created_at)} · ${m.attempts}/${m.max_attempts} percobaan`}
              </p>
              {m.status === 'gagal' && (
                <>
                  {m.last_error && <p className="text-xs text-red-700">{m.last_error}</p>}
                  <Button size="sm" variant="secondary" className="mt-1" icon={<RotateCcw className="size-3.5" />} loading={resend.isPending && resend.variables === m.id} onClick={() => resend.mutate(m.id)}>
                    Kirim ulang
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
