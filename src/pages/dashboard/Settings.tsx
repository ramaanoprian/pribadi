import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useDeviceStatus } from '@/hooks/useWhatsApp';
import { MessageCircle, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/errors';
import { formatDateTime, formatRupiah } from '@/lib/format';
import type { Json } from '@/lib/database.types';
import { useSettings, type Setting } from '@/hooks/useSettings';
import { Alert, Card, PageHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, LoadingState, Spinner } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';

type Opsi = { min?: number; max?: number; satuan?: string; maks_panjang?: number; pilihan?: { nilai: Json; label: string }[] };

function SettingRow({ s }: { s: Setting }) {
  const qc = useQueryClient();
  const toast = useToast();
  const opsi = (s.opsi ?? {}) as Opsi;
  const [draft, setDraft] = useState<string>('');

  const fromValue = (v: Json) => (s.tipe === 'pilihan' ? JSON.stringify(v) : String(v ?? ''));
  useEffect(() => setDraft(fromValue(s.value)), [s.value]); // eslint-disable-line react-hooks/exhaustive-deps

  const parsed = (): Json => {
    if (s.tipe === 'angka') return draft.trim() === '' ? NaN : Number(draft);
    if (s.tipe === 'boolean') return draft === 'true';
    if (s.tipe === 'pilihan') return JSON.parse(draft) as Json;
    return draft;
  };
  const dirty = draft !== fromValue(s.value);

  const save = useMutation({
    mutationFn: async () => {
      const value = parsed();
      if (typeof value === 'number' && Number.isNaN(value)) throw new Error('Isi dengan angka.');
      const { error } = await supabase.from('app_settings').update({ value }).eq('key', s.key);
      if (error) throw error;
    },
    onSuccess: () => {
      toast('success', `“${s.label}” tersimpan.`);
      void qc.invalidateQueries({ queryKey: ['app_settings'] });
    },
    onError: (e) => toast('error', errorMessage(e)),
  });

  const control = 'h-11 w-full rounded-xl border border-cream-300 bg-white px-3 text-sm focus:border-brand-400 focus:ring-4 focus:ring-brand-100 focus:outline-none';
  let input: React.ReactNode;
  if (s.tipe === 'boolean') {
    input = (
      <label className="inline-flex cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          className="peer sr-only"
          checked={draft === 'true'}
          onChange={(e) => setDraft(e.target.checked ? 'true' : 'false')}
        />
        <span className="relative h-7 w-12 rounded-full bg-cream-300 transition peer-checked:bg-brand-500 after:absolute after:top-1 after:left-1 after:size-5 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-5" />
        <span className="text-sm font-semibold">{draft === 'true' ? 'Aktif' : 'Nonaktif'}</span>
      </label>
    );
  } else if (s.tipe === 'pilihan') {
    input = (
      <select className={control} value={draft} onChange={(e) => setDraft(e.target.value)}>
        {opsi.pilihan?.map((p) => (
          <option key={JSON.stringify(p.nilai)} value={JSON.stringify(p.nilai)}>
            {p.label}
          </option>
        ))}
      </select>
    );
  } else {
    input = (
      <div className="flex items-center gap-2">
        <input
          className={control}
          type={s.tipe === 'angka' ? 'number' : 'text'}
          inputMode={s.tipe === 'angka' ? 'numeric' : undefined}
          min={opsi.min}
          max={opsi.max}
          maxLength={opsi.maks_panjang}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        {opsi.satuan && <span className="shrink-0 text-sm text-cocoa-500">{opsi.satuan}</span>}
      </div>
    );
  }

  return (
    <div className="grid gap-3 py-4 sm:grid-cols-[1fr_minmax(0,18rem)_auto] sm:items-center">
      <div>
        <p className="font-semibold">{s.label}</p>
        {s.deskripsi && <p className="text-sm text-cocoa-600">{s.deskripsi}</p>}
        {s.key === 'pesanan.gratis_ongkir_min' && Number(s.value) > 0 && <p className="text-xs text-cocoa-500">Saat ini: {formatRupiah(Number(s.value))}</p>}
        <p className="text-xs text-cocoa-400">Diubah {formatDateTime(s.updated_at)}</p>
      </div>
      {input}
      <Button size="sm" variant={dirty ? 'primary' : 'secondary'} disabled={!dirty} loading={save.isPending} onClick={() => save.mutate()}>
        Simpan
      </Button>
    </div>
  );
}

function WhatsAppStatusCard() {
  const status = useDeviceStatus();
  const s = status.data;
  return (
    <Card className="flex items-start gap-3">
      <MessageCircle className="mt-0.5 size-5 shrink-0 text-emerald-600" />
      <div className="flex-1 space-y-2">
        <p className="font-semibold">Koneksi WhatsApp (Fonnte)</p>
        {status.isLoading ? (
          <Spinner label="Memeriksa perangkat…" />
        ) : status.isError ? (
          <Alert tone="red">Gagal memeriksa status: {errorMessage(status.error)}</Alert>
        ) : !s?.configured ? (
          <Alert tone="amber">Token Fonnte belum diatur. Notifikasi tidak akan terkirim.</Alert>
        ) : s.connected ? (
          <p className="text-sm text-emerald-700">Perangkat terhubung{s.provider === 'dummy' ? ' (mode simulasi)' : ''}.</p>
        ) : (
          <Alert tone="red" title="Perangkat terputus">Pesan WhatsApp akan gagal sampai perangkat dihubungkan ulang di Fonnte.</Alert>
        )}
        <Link to="/dashboard/whatsapp?tab=koneksi" className="inline-block text-sm font-semibold text-brand-600 hover:underline">
          Kelola koneksi, template & uji kirim
        </Link>
      </div>
    </Card>
  );
}

export function Settings() {
  const q = useSettings();
  const groups = new Map<string, Setting[]>();
  for (const s of q.data ?? []) groups.set(s.kategori, [...(groups.get(s.kategori) ?? []), s]);

  return (
    <>
      <PageHeader title="Pengaturan" description="Nilai default sistem yang bisa Anda ubah. Setiap perubahan tercatat di log aktivitas." />
      <div className="space-y-5">
        <Card className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-emerald-600" />
          <div>
            <p className="font-semibold">Verifikasi 2 langkah Owner: aktif</p>
            <p className="text-sm text-cocoa-600">Akun Owner selalu diminta kode authenticator saat masuk. Tanpa 2FA, database menolak semua akses Owner.</p>
          </div>
        </Card>
        <WhatsAppStatusCard />
        {q.isLoading ? (
          <LoadingState />
        ) : q.isError ? (
          <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
        ) : groups.size === 0 ? (
          <EmptyState title="Belum ada pengaturan" />
        ) : (
          [...groups.entries()].map(([kategori, items]) => (
            <Card key={kategori}>
              <h2 className="font-sans text-lg font-bold">{kategori}</h2>
              <div className="divide-y divide-cream-200">
                {items.map((s) => (
                  <SettingRow key={s.key} s={s} />
                ))}
              </div>
            </Card>
          ))
        )}
      </div>
    </>
  );
}
