import { clsx } from 'clsx';

export function Logo({ className, white }: { className?: string; white?: boolean }) {
  return <img src={white ? '/brand/logo-white.png' : '/brand/logo.png'} alt="GutVibes" className={clsx('h-8 w-auto', className)} />;
}

export function Symbol({ className, white }: { className?: string; white?: boolean }) {
  return <img src={white ? '/brand/symbol-white.png' : '/brand/symbol.png'} alt="" aria-hidden className={clsx('size-8', className)} />;
}
