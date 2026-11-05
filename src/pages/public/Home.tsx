import { Link } from 'react-router-dom';
import { ArrowRight, Clock, MessageCircle, Stamp } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { useCatalog, useContent } from '@/hooks/usePublic';
import { ProductCard } from '@/components/product/ProductCard';
import { LoadingState } from '@/components/ui/States';

export function Home() {
  const { session } = useAuth();
  const { c } = useContent();
  const catalog = useCatalog();
  const title = c('beranda.hero_judul', 'Kue & roti rumahan dengan good vibes.');
  const featured = catalog.data?.products.slice(0, 4) ?? [];

  return (
    <>
      <section className="relative overflow-hidden">
        <div className="absolute -top-24 -right-24 size-80 rounded-full bg-brand-100/70 blur-3xl" aria-hidden />
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 sm:py-20 md:grid-cols-[1.2fr_1fr]">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-brand-600 ring-1 ring-brand-100">Dipanggang segar setiap hari</p>
            <h1 className="mt-4 text-4xl leading-tight font-extrabold text-cocoa-900 sm:text-5xl">{title}</h1>
            <p className="mt-4 max-w-lg whitespace-pre-line text-cocoa-700">{c('beranda.hero_sub')}</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link to="/menu" className="inline-flex h-12 items-center gap-2 rounded-xl bg-brand-500 px-5 font-semibold text-white shadow-sm hover:bg-brand-600">
                Lihat menu <ArrowRight className="size-4" />
              </Link>
              {!session && (
                <Link to="/daftar" className="inline-flex h-12 items-center rounded-xl bg-white px-5 font-semibold text-cocoa-800 ring-1 ring-cream-300 hover:bg-cream-50">
                  Daftar jadi member
                </Link>
              )}
            </div>
          </div>
          <div className="flex justify-center">
            <div className="grid aspect-square w-60 place-items-center rounded-[2.5rem] bg-white shadow-xl shadow-brand-500/10 ring-1 ring-cream-200 sm:w-80">
              <img src="/brand/symbol.png" alt="" className="w-2/3" />
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-14">
        <div className="mb-5 flex items-end justify-between">
          <h2 className="text-2xl font-bold sm:text-3xl">Favorit minggu ini</h2>
          <Link to="/menu" className="text-sm font-semibold text-brand-600 hover:underline">
            Semua menu
          </Link>
        </div>
        {catalog.isLoading ? (
          <LoadingState />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {featured.map((p) => (
              <ProductCard key={p.id} p={p} />
            ))}
          </div>
        )}
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-4 pb-16 sm:grid-cols-3">
        {[
          { icon: Clock, title: 'Ready stock & pre-order', text: 'Ambil yang tersedia hari ini atau pesan untuk tanggal tertentu.' },
          { icon: MessageCircle, title: 'Konfirmasi via WhatsApp', text: 'Status pesanan dikirim langsung ke WhatsApp Anda.' },
          { icon: Stamp, title: 'Kartu stamp member', text: 'Setiap pesanan selesai = 1 stamp. Kartu penuh, hadiah menanti.' },
        ].map(({ icon: Icon, title: t, text }) => (
          <div key={t} className="rounded-2xl bg-white p-5 ring-1 ring-cream-200">
            <Icon className="size-6 text-brand-500" aria-hidden />
            <h3 className="mt-3 font-sans text-base font-bold">{t}</h3>
            <p className="mt-1 text-sm text-cocoa-600">{text}</p>
          </div>
        ))}
      </section>
    </>
  );
}
