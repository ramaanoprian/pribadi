import { clsx } from 'clsx';
import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

const control =
  'w-full rounded-xl border border-cream-300 bg-white px-3.5 text-cocoa-900 placeholder:text-cocoa-400 transition focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-100 disabled:bg-cream-100';

type FieldShellProps = { label?: string; hint?: ReactNode; error?: string | null; id: string; children: ReactNode; required?: boolean };

function FieldShell({ label, hint, error, id, children, required }: FieldShellProps) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={id} className="block text-sm font-semibold text-cocoa-800">
          {label}
          {required && <span className="text-brand-600"> *</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-cocoa-500">{hint}</p>
      ) : null}
    </div>
  );
}

type Common = { label?: string; hint?: ReactNode; error?: string | null };

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & Common>(function Input(
  { label, hint, error, className, id, ...rest },
  ref,
) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <FieldShell label={label} hint={hint} error={error} id={fid} required={rest.required}>
      <input ref={ref} id={fid} aria-invalid={Boolean(error)} className={clsx(control, 'h-11', error && 'border-red-400', className)} {...rest} />
    </FieldShell>
  );
});

export function Select({ label, hint, error, className, id, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & Common) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <FieldShell label={label} hint={hint} error={error} id={fid} required={rest.required}>
      <select id={fid} className={clsx(control, 'h-11 pr-8', className)} {...rest}>
        {children}
      </select>
    </FieldShell>
  );
}

export function Textarea({ label, hint, error, className, id, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & Common) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <FieldShell label={label} hint={hint} error={error} id={fid} required={rest.required}>
      <textarea id={fid} className={clsx(control, 'min-h-24 py-2.5', className)} {...rest} />
    </FieldShell>
  );
}

export function Checkbox({ label, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  return (
    <label className={clsx('flex cursor-pointer items-start gap-2.5 text-sm text-cocoa-800', className)}>
      <input type="checkbox" className="mt-0.5 size-4 rounded accent-brand-500" {...rest} />
      <span>{label}</span>
    </label>
  );
}
