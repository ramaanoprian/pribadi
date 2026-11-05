import { clsx } from 'clsx';
import { Check, X } from 'lucide-react';
import type { OrderStatus } from '@/lib/database.types';
import { formatDateTime, formatRupiah } from '@/lib/format';
import { orderSteps, STATUS_LABEL, STATUS_TONE, type PublicOrder } from '@/lib/orders';
import { Badge } from '@/components/ui/Card';

export function StatusBadge({ status }: { status: OrderStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>;
}

type TimelineInput = Parameters<typeof orderSteps>[0];

export function OrderTimeline({ order }: { order: TimelineInput }) {
  const steps = orderSteps(order);
  return (
    <ol className="space-y-0">
      {steps.map((s, i) => {
        const done = Boolean(s.at);
        const cancelled = s.key === 'dibatalkan';
        return (
          <li key={s.key} className="relative flex gap-3 pb-5 last:pb-0">
            {i < steps.length - 1 && <span className={clsx('absolute top-7 left-[13px] h-[calc(100%-1.5rem)] w-0.5', done ? 'bg-brand-200' : 'bg-cream-300')} aria-hidden />}
            <span
              className={clsx(
                'relative z-10 grid size-7 shrink-0 place-items-center rounded-full',
                cancelled ? 'bg-red-500 text-white' : done ? 'bg-brand-500 text-white' : 'bg-cream-200 text-cocoa-400',
              )}
            >
              {cancelled ? <X className="size-4" /> : done ? <Check className="size-4" /> : <span className="size-2 rounded-full bg-current" />}
            </span>
            <div>
              <p className={clsx('text-sm font-semibold', !done && !cancelled && 'text-cocoa-400')}>{s.label}</p>
              {s.at && <p className="text-xs text-cocoa-500">{formatDateTime(s.at)}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

type SummaryInput = Pick<PublicOrder, 'subtotal' | 'diskon' | 'promo_kode' | 'shipping_cost' | 'ongkir_diset' | 'gratis_ongkir' | 'total' | 'fulfillment'> & {
  items: { nama: string; satuan: string; harga: number; qty: number; subtotal: number }[];
};

export function OrderSummary({ order }: { order: SummaryInput }) {
  const pendingShipping = order.fulfillment === 'antar' && !order.ongkir_diset;
  return (
    <div className="text-sm">
      <ul className="divide-y divide-cream-200">
        {order.items.map((i, idx) => (
          <li key={idx} className="flex justify-between gap-3 py-2">
            <span>
              {i.nama}{' '}
              <span className="text-cocoa-500">
                × {i.qty} {i.satuan}
              </span>
            </span>
            <span className="tabular-nums">{formatRupiah(i.subtotal)}</span>
          </li>
        ))}
      </ul>
      <dl className="mt-2 space-y-1 border-t border-cream-200 pt-2">
        <Row label="Subtotal" value={formatRupiah(order.subtotal)} />
        {order.diskon > 0 && <Row label={`Diskon${order.promo_kode ? ` (${order.promo_kode})` : ''}`} value={`−${formatRupiah(order.diskon)}`} className="text-emerald-700" />}
        {order.fulfillment === 'antar' && (
          <Row label="Ongkir" value={order.gratis_ongkir ? 'Gratis' : pendingShipping ? 'Menunggu konfirmasi admin' : formatRupiah(order.shipping_cost)} />
        )}
        <Row label={pendingShipping ? 'Total (belum termasuk ongkir)' : 'Total'} value={formatRupiah(order.total)} className="text-base font-bold" />
      </dl>
    </div>
  );
}

function Row({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={clsx('flex justify-between gap-3', className)}>
      <dt>{label}</dt>
      <dd className="text-right tabular-nums">{value}</dd>
    </div>
  );
}
