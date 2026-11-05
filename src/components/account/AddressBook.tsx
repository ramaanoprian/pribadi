import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MapPin, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/errors';
import { formatPhone, normalizePhone } from '@/lib/phone';
import { useAuth } from '@/auth/AuthProvider';
import type { Tables } from '@/lib/database.types';
import { Badge, Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Checkbox, Input, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';

type Address = Tables<'addresses'>;
const empty = { label: 'Rumah', penerima: '', no_hp: '', alamat: '', catatan: '', is_default: false };

export function AddressBook() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<Address | 'baru' | null>(null);
  const [form, setForm] = useState(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [toDelete, setToDelete] = useState<Address | null>(null);

  const q = useQuery({
    queryKey: ['addresses', profile?.id],
    enabled: Boolean(profile),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('addresses')
        .select('*')
        .eq('user_id', profile!.id)
        .order('is_default', { ascending: false })
        .order('created_at');
      if (error) throw error;
      return data;
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        label: form.label.trim() || 'Rumah',
        penerima: form.penerima.trim(),
        no_hp: normalizePhone(form.no_hp)!,
        alamat: form.alamat.trim(),
        catatan: form.catatan.trim() || null,
        is_default: form.is_default || (q.data?.length ?? 0) === 0,
      };
      const res = editing && editing !== 'baru' ? await supabase.from('addresses').update(payload).eq('id', editing.id) : await supabase.from('addresses').insert(payload);
      if (res.error) throw res.error;
    },
    onSuccess: () => {
      toast('success', 'Alamat tersimpan.');
      setEditing(null);
      void qc.invalidateQueries({ queryKey: ['addresses'] });
    },
    onError: (e) => toast('error', errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('addresses').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast('success', 'Alamat dihapus.');
      setToDelete(null);
      void qc.invalidateQueries({ queryKey: ['addresses'] });
    },
    onError: (e) => toast('error', errorMessage(e)),
  });

  const makeDefault = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('addresses').update({ is_default: true }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['addresses'] }),
    onError: (e) => toast('error', errorMessage(e)),
  });

  function open(a: Address | 'baru') {
    setErrors({});
    setEditing(a);
    setForm(
      a === 'baru'
        ? { ...empty, penerima: profile?.nama ?? '', no_hp: profile?.no_hp ? formatPhone(profile.no_hp) : '' }
        : { label: a.label, penerima: a.penerima, no_hp: formatPhone(a.no_hp), alamat: a.alamat, catatan: a.catatan ?? '', is_default: a.is_default },
    );
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const v: Record<string, string> = {};
    if (!form.penerima.trim()) v.penerima = 'Nama penerima wajib diisi.';
    if (!normalizePhone(form.no_hp)) v.no_hp = 'Nomor HP tidak valid.';
    if (form.alamat.trim().length < 5) v.alamat = 'Alamat terlalu pendek.';
    setErrors(v);
    if (!Object.keys(v).length) save.mutate();
  }

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-sans text-lg font-bold">Alamat tersimpan</h2>
        <Button size="sm" variant="secondary" icon={<Plus className="size-4" />} onClick={() => open('baru')}>
          Tambah
        </Button>
      </div>
      <div className="mt-4">
        {q.isLoading ? (
          <LoadingState />
        ) : q.isError ? (
          <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
        ) : !q.data?.length ? (
          <EmptyState icon={<MapPin className="size-8" />} title="Belum ada alamat" description="Simpan alamat agar checkout lebih cepat." />
        ) : (
          <ul className="space-y-3">
            {q.data.map((a) => (
              <li key={a.id} className="rounded-xl border border-cream-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-semibold">
                      {a.label} {a.is_default && <Badge tone="brand">Utama</Badge>}
                    </p>
                    <p className="mt-1 text-sm">
                      {a.penerima} · {formatPhone(a.no_hp)}
                    </p>
                    <p className="text-sm text-cocoa-600">{a.alamat}</p>
                    {a.catatan && <p className="text-xs text-cocoa-500">Catatan: {a.catatan}</p>}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {!a.is_default && (
                      <button className="rounded-lg p-2 text-cocoa-500 hover:bg-cream-100" onClick={() => makeDefault.mutate(a.id)} aria-label="Jadikan alamat utama" title="Jadikan utama">
                        <Star className="size-4" />
                      </button>
                    )}
                    <button className="rounded-lg p-2 text-cocoa-500 hover:bg-cream-100" onClick={() => open(a)} aria-label="Ubah alamat">
                      <Pencil className="size-4" />
                    </button>
                    <button className="rounded-lg p-2 text-red-600 hover:bg-red-50" onClick={() => setToDelete(a)} aria-label="Hapus alamat">
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'baru' ? 'Tambah alamat' : 'Ubah alamat'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Batal
            </Button>
            <Button form="address-form" type="submit" loading={save.isPending}>
              Simpan
            </Button>
          </>
        }
      >
        <form id="address-form" onSubmit={onSubmit} className="space-y-4">
          <Input label="Label" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Rumah, Kantor, …" maxLength={40} />
          <Input label="Nama penerima" value={form.penerima} onChange={(e) => setForm({ ...form, penerima: e.target.value })} error={errors.penerima} required />
          <Input label="Nomor HP penerima" type="tel" inputMode="tel" value={form.no_hp} onChange={(e) => setForm({ ...form, no_hp: e.target.value })} error={errors.no_hp} required />
          <Textarea label="Alamat lengkap" value={form.alamat} onChange={(e) => setForm({ ...form, alamat: e.target.value })} error={errors.alamat} maxLength={500} required />
          <Input label="Catatan untuk kurir" value={form.catatan} onChange={(e) => setForm({ ...form, catatan: e.target.value })} maxLength={300} placeholder="Opsional" />
          <Checkbox label="Jadikan alamat utama" checked={form.is_default} onChange={(e) => setForm({ ...form, is_default: e.target.checked })} />
        </form>
      </Modal>

      <Modal
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        title="Hapus alamat?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setToDelete(null)}>
              Batal
            </Button>
            <Button variant="danger" loading={remove.isPending} onClick={() => toDelete && remove.mutate(toDelete.id)}>
              Hapus
            </Button>
          </>
        }
      >
        <p className="text-sm">Alamat “{toDelete?.label}” akan dihapus permanen.</p>
      </Modal>
    </Card>
  );
}
