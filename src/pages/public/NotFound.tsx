import { Link } from 'react-router-dom';
import { useSeo } from '@/hooks/useSeo';

export function NotFound() {
  useSeo({ title: 'Halaman tidak ditemukan', noindex: true });
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
      <img src="/brand/symbol.png" alt="" className="size-16 opacity-80" />
      <h1 className="mt-4 text-3xl font-bold">Halaman tidak ditemukan</h1>
      <p className="mt-2 text-cocoa-600">Sepertinya kue yang Anda cari sudah habis. 🙂</p>
      <Link to="/" className="mt-6 font-semibold text-brand-600 hover:underline">
        Kembali ke beranda
      </Link>
    </div>
  );
}
