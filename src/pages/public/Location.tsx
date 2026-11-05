import { Clock, MapPin, MessageCircle, AtSign, Mail } from 'lucide-react';
import { useContent } from '@/hooks/usePublic';
import { formatPhone, normalizePhone } from '@/lib/phone';
import { Card } from '@/components/ui/Card';
import { LoadingState } from '@/components/ui/States';
import { useSeo } from '@/hooks/useSeo';

export function Location() {
  const { c, isLoading } = useContent();
  useSeo({ title: 'Lokasi & Kontak', description: `${c('lokasi.alamat')} ${c('lokasi.jam_buka')}`.trim() || undefined });
  const wa = normalizePhone(c('kontak.whatsapp'));
  const maps = c('lokasi.maps_url');
  const ig = c('kontak.instagram');
  const email = c('kontak.email');
  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:py-14">
      <h1 className="text-4xl font-bold">Lokasi & Kontak</h1>
      {isLoading ? (
        <div className="mt-6">
          <LoadingState />
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Card>
            <MapPin className="size-6 text-brand-500" />
            <h2 className="mt-2 font-sans font-bold">Alamat</h2>
            <p className="mt-1 whitespace-pre-line text-cocoa-700">{c('lokasi.alamat', 'Alamat akan segera diumumkan.')}</p>
            {maps && (
              <a href={maps} target="_blank" rel="noreferrer" className="mt-3 inline-block font-semibold text-brand-600 hover:underline">
                Buka di Google Maps
              </a>
            )}
          </Card>
          <Card>
            <Clock className="size-6 text-brand-500" />
            <h2 className="mt-2 font-sans font-bold">Jam buka</h2>
            <p className="mt-1 whitespace-pre-line text-cocoa-700">{c('lokasi.jam_buka', '-')}</p>
          </Card>
          <Card className="space-y-2 sm:col-span-2">
            <h2 className="font-sans font-bold">Hubungi kami</h2>
            {wa && (
              <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-cocoa-800 hover:text-brand-600">
                <MessageCircle className="size-5 text-emerald-600" /> WhatsApp {formatPhone(wa)}
              </a>
            )}
            {ig && (
              <a href={`https://instagram.com/${ig}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-cocoa-800 hover:text-brand-600">
                <AtSign className="size-5 text-brand-500" /> @{ig}
              </a>
            )}
            {email && (
              <a href={`mailto:${email}`} className="flex items-center gap-2 text-cocoa-800 hover:text-brand-600">
                <Mail className="size-5 text-cocoa-500" /> {email}
              </a>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
