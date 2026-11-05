import type { ReactNode } from 'react';
import { Symbol } from '@/components/Logo';

export function AuthCard({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-10 sm:py-16">
      <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-cream-200 sm:p-8">
        <Symbol className="size-10" />
        <h1 className="mt-4 text-2xl font-bold">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-cocoa-600">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </div>
      {footer && <div className="mt-5 text-center text-sm text-cocoa-600">{footer}</div>}
    </div>
  );
}
