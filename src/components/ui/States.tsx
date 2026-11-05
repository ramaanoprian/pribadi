import { AlertTriangle, Inbox, Loader2, RotateCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from './Button';

export function Spinner({ label = 'Memuat…' }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-cocoa-600" role="status">
      <Loader2 className="size-4 animate-spin text-brand-500" aria-hidden />
      {label}
    </span>
  );
}

export function LoadingState({ label = 'Memuat data…' }: { label?: string }) {
  return (
    <div className="flex min-h-40 items-center justify-center rounded-2xl border border-dashed border-cream-300 bg-white/60 p-8">
      <Spinner label={label} />
    </div>
  );
}

export function FullPageLoading() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-cream-100">
      <img src="/brand/symbol.png" alt="" className="size-14 animate-pulse" />
      <Spinner label="Menyiapkan…" />
    </div>
  );
}

export function EmptyState({ title, description, action, icon }: { title: string; description?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-cream-300 bg-white/60 p-8 text-center">
      <div className="text-cocoa-400">{icon ?? <Inbox className="size-8" aria-hidden />}</div>
      <p className="font-semibold text-cocoa-800">{title}</p>
      {description && <p className="max-w-sm text-sm text-cocoa-600">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-2xl border border-red-200 bg-red-50 p-8 text-center" role="alert">
      <AlertTriangle className="size-8 text-red-500" aria-hidden />
      <p className="font-semibold text-red-800">Gagal memuat data</p>
      <p className="max-w-md text-sm text-red-700">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry} icon={<RotateCw className="size-4" />} className="mt-2">
          Coba lagi
        </Button>
      )}
    </div>
  );
}
