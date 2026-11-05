import { clsx } from 'clsx';
import type { HTMLAttributes, ReactNode } from 'react';

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx('rounded-2xl bg-white p-5 shadow-sm ring-1 ring-cream-200', className)} {...rest} />;
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold text-cocoa-900 sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-cocoa-600">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

type Tone = 'neutral' | 'brand' | 'green' | 'amber' | 'red' | 'blue';
const tones: Record<Tone, string> = {
  neutral: 'bg-cream-200 text-cocoa-700',
  brand: 'bg-brand-100 text-brand-700',
  green: 'bg-emerald-100 text-emerald-800',
  amber: 'bg-amber-100 text-amber-800',
  red: 'bg-red-100 text-red-700',
  blue: 'bg-sky-100 text-sky-800',
};

export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={clsx('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold', tones[tone], className)}>{children}</span>;
}

export function Alert({ tone = 'amber', title, children, className }: { tone?: 'amber' | 'red' | 'green' | 'blue'; title?: string; children?: ReactNode; className?: string }) {
  const map = {
    amber: 'bg-amber-50 text-amber-900 ring-amber-200',
    red: 'bg-red-50 text-red-800 ring-red-200',
    green: 'bg-emerald-50 text-emerald-900 ring-emerald-200',
    blue: 'bg-sky-50 text-sky-900 ring-sky-200',
  };
  return (
    <div className={clsx('rounded-xl p-3.5 text-sm ring-1', map[tone], className)} role={tone === 'red' ? 'alert' : 'status'}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={clsx(title && 'mt-0.5')}>{children}</div>}
    </div>
  );
}
