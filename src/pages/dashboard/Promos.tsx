import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgePercent, Plus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/errors';
import { formatDate, formatRupiah } from '@/lib/format';
import { toLocalInput } from '@/lib/orders';
import type { Tables } from '@/lib/database.types';
import { Badge, PageHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Checkbox, Input, Select } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { DataTable, type Column } from '@/components/ui/Table';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';

type Promo = Tables<'promos'>;

function promoState(p: Promo): { label: string; tone: 'green' | 'neutral' | 'amber' | 'red' } {
  const now = Date.now();
  if (!p.aktif) return { label: 'Nonaktif', tone: 'neutral' };
  if (p.mulai && new Date(p.mulai).getTime() > now) return { label: 'Terjadwal', tone: 'amber' };
  if (p.selesai && new Date(p.selesai).getTime() < now) return { label: 'Berakhir', tone: 'red' };
  return { label: 'Berjalan', tone: 'green' };
}

export function Promos() {
  const [editing, setEditing] = useState<Promo | 'baru' | null>(null);
  const q = useQuery({
    queryKey: ['promos'],
    queryFn: async () => {
      const [promos, used] = await Promise.all([
        supabase.from('promos').select('*').order('created_at', { ascending: false }),
        supabase.from('orders').select('promo_id').not('promo_id', 'is', null).neq('status', 'dibatalkan'),
      ]);
      if (promos.error) throw promos.error;
      if (used.error) throw used.error;
      const count = new Map<string, number>();
      for (const o of used.data) count.set(o.promo_id!, (count.get(o.promo_id!) ?? 0) + 1);
      return promos.data.map((p) => ({ ...p, dipakai: count.get(p.id) ?? 0 }));
    },
  });

  type Row = Promo & { dipakai: number };
  const columns: Column<Row>[] = [
    {
      key: 'kode',
      header: 'Kode',
      cell: (p) => (
        <div className="text-left">
          <p className="font-mono font-bold">{p.kode}</p>
          <p className="text-xs text-cocoa-500">{p.nama}</p>
        </div>
      ),
    },
    {
      key: 'nilai',
      header: 'Potongan',
      cell: (p) => (
        <div className="text-left">
          <p>{p.tipe === 'persen' ? `${p.nilai}%` : formatRupiah(p.nilai)}</p>
          <p className="text-xs text-cocoa-500">
            {p.min_belanja > 0 ? `min. ${formatRupiah(p.min_belanja)}` : 'tanpa minimum'}
            {p.maks_diskon ? ` · maks. ${formatRupiah(p.maks_diskon)}` : ''}
          </p>
        </div>
      ),
    },
    { key: 'periode', header: 'Periode', cell: (p) => <span className="text-sm">{p.mulai || p.selesai ? `${formatDate(p.mulai) } – ${formatDate(p.selesai)}` : 'Tanpa batas'}</span> },
    { key: 'kuota', header: 'Dipakai', cell: (p) => <span className="tabular-nums">{p.dipakai}{p.kuota ? ` / ${p.kuota}` : ''}</span> },
    { key: 'status', header: 'Status', cell: (p) => <Badge tone={promoState(p).tone}>{promoState(p).label}</Badge> },
  ];

  return (
    <>
      <PageHeader
        title="Harga & Promo"
        description="Kode promo dihitung di server saat checkout. Harga produk diubah di Katalog."
        actions={
          <Button icon={<Plus className="size-4" />} onClick={() => setEditing('baru')}>
            Buat promo
          </Button>
        }
      />
      {q.isLoading ? (
        <LoadingState />
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
      ) : !q.data?.length ? (
        <EmptyState icon={<BadgePercent className="size-8" />} title="Belum ada promo" />
      ) : (
        <DataTable rows={q.data} columns={columns} rowKey={(p) => p.id} onRowClick={setEditing} />
      )}
      {editing && <PromoModal promo={editing === 'baru' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function PromoModal({ promo, onClose }: { promo: Promo | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [f, setF] = useState({
    kode: promo?.kode ?? '',
    nama: promo?.nama ?? '',
    tipe: promo?.tipe ?? 'persen',
    nilai: promo ? String(promo.nilai) : '',
    min_belanja: String(promo?.min_belanja ?? 0),
    maks_diskon: promo?.maks_diskon ? String(promo.maks_diskon) : '',
    mulai: promo?.mulai ? toLocalInput(new Date(promo.mulai)) : '',
    selesai: promo?.selesai ? toLocalInput(new Date(promo.selesai)) : '',
    kuota: promo?.kuota ? String(promo.kuota) : '',
    aktif: promo?.aktif ?? true,
  });
  const [error, setError] = useState<string | null>(null);

  const m = useMutation({
    mutationFn: async () => {
      const payload = {
        kode: f.kode.trim().toUpperCase(),
        nama: f.nama.trim(),
        tipe: f.tipe as 'persen' | 'nominal',
        nilai: Number(f.nilai),
        min_belanja: Number(f.min_belanja) || 0,
        maks_diskon: f.maks_diskon ? Number(f.maks_diskon) : null,
        mulai: f.mulai ? new Date(f.mulai).toISOString() : null,
        selesai: f.selesai ? new Date(f.selesai).toISOString() : null,
        kuota: f.kuota ? Number(f.kuota) : null,
        aktif: f.aktif,
      };
      const res = promo ? await supabase.from('promos').update(payload).eq('id', promo.id) : await supabase.from('promos').insert(payload);
      if (res.error) throw res.error.code === '23505' ? new Error('Kode promo sudah dipakai.') : res.error;
    },
    onSuccess: () => {
      toast('success', 'Promo tersimpan.');
      void qc.invalidateQueries({ queryKey: ['promos'] });
      onClose();
    },
    onError: (e) => setError(errorMessage(e)),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!/^[A-Z0-9]{3,20}$/.test(f.kode.trim().toUpperCase())) return setError('Kode 3–20 huruf/angka tanpa spasi.');
    const n = Number(f.nilai);
    if (!(n > 0) || (f.tipe === 'persen' && n > 100)) return setError('Nilai potongan tidak valid.');
    if (f.mulai && f.selesai && new Date(f.selesai) <= new Date(f.mulai)) return setError('Tanggal selesai harus setelah tanggal mulai.');
    setError(null);
    m.mutate();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={promo ? `Ubah promo ${promo.kode}` : 'Buat promo'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Batal
          </Button>
          <Button form="promo-form" type="submit" loading={m.isPending}>
            Simpan
          </Button>
        </>
      }
    >
      <form id="promo-form" onSubmit={onSubmit} className="space-y-4">
        {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Kode" value={f.kode} onChange={(e) => setF({ ...f, kode: e.target.value.toUpperCase() })} maxLength={20} className="font-mono uppercase" required />
          <Input label="Nama promo" value={f.nama} onChange={(e) => setF({ ...f, nama: e.target.value })} maxLength={80} required />
          <Select label="Jenis potongan" value={f.tipe} onChange={(e) => setF({ ...f, tipe: e.target.value as 'persen' | 'nominal' })}>
            <option value="persen">Persen (%)</option>
            <option value="nominal">Nominal (Rp)</option>
          </Select>
          <Input label={f.tipe === 'persen' ? 'Potongan (%)' : 'Potongan (Rp)'} type="number" min={1} value={f.nilai} onChange={(e) => setF({ ...f, nilai: e.target.value })} required />
          <Input label="Minimal belanja (Rp)" type="number" min={0} value={f.min_belanja} onChange={(e) => setF({ ...f, min_belanja: e.target.value })} />
          <Input label="Maks. potongan (Rp)" type="number" min={1} value={f.maks_diskon} onChange={(e) => setF({ ...f, maks_diskon: e.target.value })} hint="Kosongkan bila tanpa batas." />
          <Input label="Mulai" type="datetime-local" value={f.mulai} onChange={(e) => setF({ ...f, mulai: e.target.value })} />
          <Input label="Selesai" type="datetime-local" value={f.selesai} onChange={(e) => setF({ ...f, selesai: e.target.value })} />
          <Input label="Kuota pemakaian" type="number" min={1} value={f.kuota} onChange={(e) => setF({ ...f, kuota: e.target.value })} hint="Kosongkan bila tanpa batas." />
        </div>
        <Checkbox label="Promo aktif" checked={f.aktif} onChange={(e) => setF({ ...f, aktif: e.target.checked })} />
      </form>
    </Modal>
  );
}
