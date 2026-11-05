import { Minus, Plus } from 'lucide-react';
import { clsx } from 'clsx';

export function QtyStepper({ value, onChange, max = 999, size = 'md' }: { value: number; onChange: (v: number) => void; max?: number; size?: 'md' | 'lg' }) {
  const btn = clsx('grid place-items-center rounded-lg text-cocoa-700 hover:bg-cream-200 disabled:opacity-40', size === 'lg' ? 'size-11' : 'size-9');
  return (
    <div className="inline-flex items-center rounded-xl bg-white ring-1 ring-cream-300">
      <button type="button" className={btn} onClick={() => onChange(value - 1)} aria-label="Kurangi">
        <Minus className="size-4" />
      </button>
      <input
        type="number"
        inputMode="numeric"
        className={clsx('w-12 [appearance:textfield] bg-transparent text-center font-semibold tabular-nums focus:outline-none', size === 'lg' && 'text-lg')}
        value={value}
        min={0}
        max={max}
        onChange={(e) => onChange(Math.max(0, Math.min(max, Number(e.target.value) || 0)))}
        aria-label="Jumlah"
      />
      <button type="button" className={btn} onClick={() => onChange(value + 1)} disabled={value >= max} aria-label="Tambah">
        <Plus className="size-4" />
      </button>
    </div>
  );
}
