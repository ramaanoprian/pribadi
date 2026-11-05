import { useQuery } from '@tanstack/react-query';
import { Crown, MessageCircle, Moon } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatDate, formatRupiah } from '@/lib/format';
import { comeBackLink } from '@/lib/analytics';
import { settingValue, useSettings } from '@/hooks/useSettings';
import { Badge, Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/States';

/** Statistik pelanggan (khusus Owner) di halaman profil pelanggan. */
export function CustomerStats({ customerId }: { customerId: string }) {
  const settings = useSettings();
  const q = useQuery({
    queryKey: ['analisis_pelanggan', customerId],
    queryFn: async () => {
      const { data, error } = await supabase.from('analisis_pelanggan').select('*').eq('id', customerId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  if (q.isLoading) return <Spinner />;
  const a = q.data;
  if (!a) return null;
  const link = comeBackLink(
    { nama: a.nama, no_hp: a.phone_normalized, produk_favorit: a.produk_favorit },
    settingValue<string>(settings.data, 'toko.nama', 'GutVibes'),
    settingValue<string>(settings.data, 'toko.url_situs', window.location.origin),
  );
  return (
    <Card className="mb-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-sans font-bold">
          Ringkasan pelanggan
          {a.is_vip && (
            <Badge tone="amber" className="gap-1">
              <Crown className="size-3" /> VIP
            </Badge>
          )}
          {a.is_tidur && (
            <Badge className="gap-1">
              <Moon className="size-3" /> Tidur
            </Badge>
          )}
          {a.is_repeat && <Badge tone="green">Repeat</Badge>}
        </h2>
        {link && (
          <a href={link} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-emerald-600 px-3 text-sm font-semibold text-white hover:bg-emerald-700">
            <MessageCircle className="size-4" /> Ajak kembali
          </a>
        )}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-cocoa-500">Pesanan selesai</dt>
          <dd className="text-xl font-bold">{a.jumlah_pesanan}</dd>
        </div>
        <div>
          <dt className="text-cocoa-500">Total belanja</dt>
          <dd className="text-xl font-bold">{formatRupiah(a.total_belanja)}</dd>
        </div>
        <div>
          <dt className="text-cocoa-500">Pertama / terakhir</dt>
          <dd>
            {formatDate(a.pesanan_pertama)}
            <br />
            {formatDate(a.pesanan_terakhir)}
          </dd>
        </div>
        <div>
          <dt className="text-cocoa-500">Produk favorit</dt>
          <dd>{a.produk_favorit ?? '-'}</dd>
        </div>
      </dl>
    </Card>
  );
}
