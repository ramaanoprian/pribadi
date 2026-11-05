import { Component, type ErrorInfo, type ReactNode } from 'react';

type State = { error: Error | null };

/** Menangkap galat render agar halaman tidak blank; tawarkan muat ulang. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Galat tampilan:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const chunk = /Loading chunk|dynamically imported module|Failed to fetch/i.test(this.state.error.message);
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
        <img src="/brand/symbol.png" alt="" className="size-14" />
        <h1 className="text-2xl font-bold">{chunk ? 'Versi baru tersedia' : 'Terjadi kesalahan'}</h1>
        <p className="text-sm text-cocoa-600">
          {chunk ? 'Aplikasi baru saja diperbarui. Muat ulang untuk melanjutkan.' : 'Maaf, halaman ini gagal ditampilkan. Coba muat ulang; bila berulang, hubungi kami.'}
        </p>
        <button onClick={() => window.location.reload()} className="mt-2 h-11 rounded-xl bg-brand-500 px-5 font-semibold text-white hover:bg-brand-600">
          Muat ulang
        </button>
      </div>
    );
  }
}
