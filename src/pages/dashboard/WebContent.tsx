import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';
import type { Tables } from '@/lib/database.types';
import { Card, PageHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ErrorState, LoadingState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';

type Content = Tables<'site_content'>;
const PREVIEW: Record<string, string> = { Beranda: '/', 'Cerita Kami': '/cerita', 'Lokasi & Kontak': '/lokasi', Pesanan: '/lacak' };

function ContentRow({ item }: { item: Content }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [value, setValue] = useState(item.value);
  useEffect(() => setValue(item.value), [item.value]);
  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('site_content').update({ value }).eq('key', item.key);
      if (error) throw error;
    },
    onSuccess: () => {
      toast('success', `“${item.label}” tersimpan.`);
      void qc.invalidateQueries({ queryKey: ['site_content'] });
      void qc.invalidateQueries({ queryKey: ['konten_publik'] });
    },
    onError: (e) => toast('error', errorMessage(e)),
  });
  const cls = 'w-full rounded-xl border border-cream-300 bg-white px-3 text-sm focus:border-brand-400 focus:ring-4 focus:ring-brand-100 focus:outline-none';
  return (
    <div className="space-y-2 py-4">
      <label htmlFor={item.key} className="block font-semibold">
        {item.label}
      </label>
      {item.tipe === 'paragraf' ? (
        <textarea id={item.key} className={`${cls} min-h-28 py-2.5`} value={value} maxLength={5000} onChange={(e) => setValue(e.target.value)} />
      ) : (
        <input id={item.key} className={`${cls} h-11`} value={value} maxLength={500} placeholder={item.tipe === 'url' ? 'https://…' : undefined} onChange={(e) => setValue(e.target.value)} />
      )}
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-cocoa-400">Diubah {formatDateTime(item.updated_at)}</span>
        <Button size="sm" variant={value !== item.value ? 'primary' : 'secondary'} disabled={value === item.value} loading={m.isPending} onClick={() => m.mutate()}>
          Simpan
        </Button>
      </div>
    </div>
  );
}

export function WebContent() {
  const q = useQuery({
    queryKey: ['site_content'],
    queryFn: async () => {
      const { data, error } = await supabase.from('site_content').select('*').order('grup').order('urutan');
      if (error) throw error;
      return data;
    },
  });
  const groups = new Map<string, Content[]>();
  for (const c of q.data ?? []) groups.set(c.grup, [...(groups.get(c.grup) ?? []), c]);
  return (
    <>
      <PageHeader title="Konten Web" description="Teks di website publik: beranda, cerita, lokasi & kontak, instruksi pembayaran." />
      {q.isLoading ? (
        <LoadingState />
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {[...groups.entries()].map(([grup, items]) => (
            <Card key={grup}>
              <div className="flex items-center justify-between">
                <h2 className="font-sans text-lg font-bold">{grup}</h2>
                {PREVIEW[grup] && (
                  <a href={PREVIEW[grup]} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline">
                    Lihat <ExternalLink className="size-3.5" />
                  </a>
                )}
              </div>
              <div className="divide-y divide-cream-200">
                {items.map((c) => (
                  <ContentRow key={c.key} item={c} />
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
