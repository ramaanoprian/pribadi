import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/auth/AuthProvider';
import { ToastProvider } from '@/components/ui/Toast';
import { supabaseConfigured } from '@/lib/supabase';
import App from './App';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 },
  },
});

function MissingConfig() {
  return (
    <div className="mx-auto max-w-lg px-6 py-20">
      <img src="/brand/logo.png" alt="GutVibes" className="h-10" />
      <h1 className="mt-6 text-2xl font-bold">Konfigurasi Supabase belum diisi</h1>
      <p className="mt-2 text-cocoa-700">
        Salin <code>.env.example</code> menjadi <code>.env.local</code>, isi <code>VITE_SUPABASE_URL</code> dan <code>VITE_SUPABASE_ANON_KEY</code>, lalu jalankan ulang <code>npm run dev</code>.
      </p>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {supabaseConfigured ? (
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <ToastProvider>
              <App />
            </ToastProvider>
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    ) : (
      <MissingConfig />
    )}
  </StrictMode>,
);
