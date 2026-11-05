import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { CalendarCheck, ChevronLeft, ChevronRight, FileImage, Lock, LockOpen, Pencil, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/errors';
import { formatDate, formatDateTime, formatRupiah } from '@/lib/format';
import { isoDate, monthEnd, monthLabel } from '@/lib/finance';
import { uploadFile } from '@/lib/storage';
import { exportExcel, exportPdf } from '@/lib/export';
import type { Tables } from '@/lib/database.types';
import { budgetStatus } from '@/components/charts/charts';
import { Alert, Badge, Card, PageHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Checkbox, Input, Select } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { DataTable, type Column } from '@/components/ui/Table';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';

type Expense = Tables<'expenses'>;
type Category = Tables<'expense_categories'>;
type Recurring = Tables<'recurring_expenses'>;
type Rincian = { nama: string; nominal: number }[];

function useFinanceMeta() {
  return useQuery({
    queryKey: ['finance_meta'],
    queryFn: async () => {
      const [cats, rec, closings] = await Promise.all([
        supabase.from('expense_categories').select('*').order('urutan'),
        supabase.from('recurring_expenses').select('*').order('tanggal'),
        supabase.from('period_closings').select('*').order('periode', { ascending: false }),
      ]);
      const err = cats.error ?? rec.error ?? closings.error;
      if (err) throw err;
      return { cats: cats.data ?? [], rec: rec.data ?? [], closings: closings.data ?? [] };
    },
  });
}

export function Expenses() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'pengeluaran';
  const [bulan, setBulan] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const meta = useFinanceMeta();
  const periode = isoDate(bulan);
  const closed = meta.data?.closings.some((c) => c.periode === periode && c.status === 'ditutup') ?? false;
  const tabs = [
    { key: 'pengeluaran', label: 'Pengeluaran' },
    { key: 'rutin', label: 'Biaya rutin' },
    { key: 'anggaran', label: 'Anggaran' },
    { key: 'periode', label: 'Tutup periode' },
  ];
  return (
    <>
      <PageHeader title="Biaya Operasional" description="Catat pengeluaran, biaya rutin bulanan, anggaran per kategori, dan tutup buku per bulan." />
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="-mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:rounded-xl sm:bg-cream-200/70 sm:p-1" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setParams(t.key === 'pengeluaran' ? {} : { tab: t.key })}
              className={clsx('h-9 shrink-0 rounded-lg px-4 text-sm font-semibold', tab === t.key ? 'bg-white shadow-sm' : 'text-cocoa-600')}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tab !== 'periode' && (
          <div className="flex items-center gap-1 self-start rounded-xl bg-white p-1 ring-1 ring-cream-300">
            <button className="rounded-lg p-2 hover:bg-cream-100" onClick={() => setBulan(new Date(bulan.getFullYear(), bulan.getMonth() - 1, 1))} aria-label="Bulan sebelumnya">
              <ChevronLeft className="size-4" />
            </button>
            <span className="min-w-32 text-center text-sm font-semibold capitalize">{monthLabel(periode)}</span>
            <button className="rounded-lg p-2 hover:bg-cream-100" onClick={() => setBulan(new Date(bulan.getFullYear(), bulan.getMonth() + 1, 1))} aria-label="Bulan berikutnya">
              <ChevronRight className="size-4" />
            </button>
          </div>
        )}
      </div>
      {closed && tab !== 'periode' && (
        <Alert tone="blue" className="mb-4" title="Periode ini sudah ditutup">
          Data hanya bisa dilihat. Buka kembali periode di tab “Tutup periode” bila perlu koreksi.
        </Alert>
      )}
      {meta.isLoading ? (
        <LoadingState />
      ) : meta.isError ? (
        <ErrorState message={errorMessage(meta.error)} onRetry={() => void meta.refetch()} />
      ) : tab === 'pengeluaran' ? (
        <ExpenseList periode={periode} cats={meta.data!.cats} closed={closed} />
      ) : tab === 'rutin' ? (
        <RecurringList periode={periode} cats={meta.data!.cats} rec={meta.data!.rec} closed={closed} />
      ) : tab === 'anggaran' ? (
        <BudgetEditor periode={periode} cats={meta.data!.cats} closed={closed} />
      ) : (
        <Periods closings={meta.data!.closings} />
      )}
    </>
  );
}

function useMonthExpenses(periode: string) {
  return useQuery({
    queryKey: ['expenses', periode],
    queryFn: async () => {
      const { data, error } = await supabase.from('expenses').select('*').eq('periode', periode).order('tanggal', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

function ExpenseList({ periode, cats, closed }: { periode: string; cats: Category[]; closed: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useMonthExpenses(periode);
  const [cat, setCat] = useState('');
  const [editing, setEditing] = useState<Expense | 'baru' | null>(null);
  const [toDelete, setToDelete] = useState<Expense | null>(null);
  const catName = new Map(cats.map((c) => [c.id, c.nama]));
  const rows = (q.data ?? []).filter((e) => !cat || e.category_id === cat);
  const total = rows.reduce((s, e) => s + e.nominal, 0);

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('expenses').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast('success', 'Biaya dihapus.');
      setToDelete(null);
      void qc.invalidateQueries({ queryKey: ['expenses'] });
      void qc.invalidateQueries({ queryKey: ['owner_dashboard'] });
    },
    onError: (e) => toast('error', errorMessage(e)),
  });
  const openNota = async (path: string) => {
    const { data, error } = await supabase.storage.from('nota').createSignedUrl(path, 300);
    if (error) return toast('error', errorMessage(error));
    window.open(data.signedUrl, '_blank', 'noopener');
  };
  const spec = {
    judul: 'Biaya Operasional',
    subjudul: `Periode ${monthLabel(periode)}`,
    namaFile: `biaya-${periode.slice(0, 7)}`,
    entitas: 'biaya',
    baris: rows,
    kolom: [
      { header: 'Tanggal', value: (e: Expense) => formatDate(e.tanggal), width: 18 },
      { header: 'Kategori', value: (e: Expense) => catName.get(e.category_id) ?? '-', width: 16 },
      { header: 'Keterangan', value: (e: Expense) => e.keterangan ?? '', width: 32 },
      { header: 'Nominal', value: (e: Expense) => e.nominal, type: 'rupiah' as const, width: 16 },
    ],
    ringkasan: [['Total', total]] as [string, number][],
  };

  const columns: Column<Expense>[] = [
    { key: 'tgl', header: 'Tanggal', cell: (e) => <span className="whitespace-nowrap">{formatDate(e.tanggal)}</span> },
    { key: 'kat', header: 'Kategori', cell: (e) => <Badge>{catName.get(e.category_id) ?? '-'}</Badge> },
    {
      key: 'ket',
      header: 'Keterangan',
      cell: (e) => (
        <div className="text-left">
          <p>{e.keterangan || '-'}</p>
          {Array.isArray(e.rincian) && <p className="text-xs text-cocoa-500">{(e.rincian as Rincian).map((r) => `${r.nama}: ${formatRupiah(r.nominal)}`).join(' · ')}</p>}
          {e.recurring_id && <span className="text-xs text-cocoa-500">Biaya rutin</span>}
        </div>
      ),
    },
    { key: 'nom', header: 'Nominal', className: 'text-right', cell: (e) => <span className="font-semibold tabular-nums">{formatRupiah(e.nominal)}</span> },
    {
      key: 'aksi',
      header: '',
      className: 'text-right',
      cell: (e) => (
        <div className="flex justify-end gap-1">
          {e.nota_path && (
            <button className="rounded-lg p-2 text-cocoa-500 hover:bg-cream-100" onClick={() => void openNota(e.nota_path!)} aria-label="Lihat nota" title="Lihat nota">
              <FileImage className="size-4" />
            </button>
          )}
          {!closed && (
            <>
              <button className="rounded-lg p-2 text-cocoa-500 hover:bg-cream-100" onClick={() => setEditing(e)} aria-label="Ubah biaya">
                <Pencil className="size-4" />
              </button>
              <button className="rounded-lg p-2 text-red-600 hover:bg-red-50" onClick={() => setToDelete(e)} aria-label="Hapus biaya">
                <Trash2 className="size-4" />
              </button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <select className="h-11 rounded-xl border border-cream-300 bg-white px-3 text-sm" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Filter kategori">
          <option value="">Semua kategori</option>
          {cats.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nama}
            </option>
          ))}
        </select>
        <p className="text-sm">
          Total: <strong className="tabular-nums">{formatRupiah(total)}</strong>
        </p>
        <div className="flex gap-2 sm:ml-auto">
          <Button variant="secondary" size="sm" disabled={!rows.length} onClick={() => void exportExcel(spec).catch((e) => toast('error', errorMessage(e)))}>
            Excel
          </Button>
          <Button variant="secondary" size="sm" disabled={!rows.length} onClick={() => void exportPdf(spec).catch((e) => toast('error', errorMessage(e)))}>
            PDF
          </Button>
          {!closed && (
            <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setEditing('baru')}>
              Catat biaya
            </Button>
          )}
        </div>
      </div>
      {q.isLoading ? (
        <LoadingState />
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState title="Belum ada biaya di bulan ini" />
      ) : (
        <DataTable rows={rows} columns={columns} rowKey={(e) => e.id} />
      )}
      {editing && <ExpenseModal expense={editing === 'baru' ? null : editing} periode={periode} cats={cats} onClose={() => setEditing(null)} />}
      <Modal
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        title="Hapus biaya?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setToDelete(null)}>
              Batal
            </Button>
            <Button variant="danger" loading={del.isPending} onClick={() => toDelete && del.mutate(toDelete.id)}>
              Hapus
            </Button>
          </>
        }
      >
        <p className="text-sm">
          {toDelete?.keterangan || catName.get(toDelete?.category_id ?? '')} — {formatRupiah(toDelete?.nominal ?? 0)}. Tercatat di log aktivitas.
        </p>
      </Modal>
    </div>
  );
}

export function ExpenseModal({
  expense,
  periode,
  cats,
  onClose,
  preset,
}: {
  expense: Expense | null;
  periode: string;
  cats: Category[];
  onClose: () => void;
  preset?: { category_id: string; nominal: number; keterangan: string; recurring_id: string; tanggal: string };
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const defaultDate = (() => {
    const today = isoDate(new Date());
    return today.startsWith(periode.slice(0, 7)) ? today : periode;
  })();
  const [f, setF] = useState({
    tanggal: expense?.tanggal ?? preset?.tanggal ?? defaultDate,
    category_id: expense?.category_id ?? preset?.category_id ?? cats[0]?.id ?? '',
    nominal: String(expense?.nominal ?? preset?.nominal ?? ''),
    keterangan: expense?.keterangan ?? preset?.keterangan ?? '',
  });
  const [pakaiRincian, setPakaiRincian] = useState(Array.isArray(expense?.rincian));
  const [rincian, setRincian] = useState<{ nama: string; nominal: string }[]>(
    Array.isArray(expense?.rincian) ? (expense!.rincian as Rincian).map((r) => ({ nama: r.nama, nominal: String(r.nominal) })) : [{ nama: '', nominal: '' }],
  );
  const [file, setFile] = useState<File | null>(null);
  const rincianTotal = rincian.reduce((s, r) => s + (Number(r.nominal) || 0), 0);
  useEffect(() => {
    if (pakaiRincian) setF((x) => ({ ...x, nominal: String(rincianTotal) }));
  }, [pakaiRincian, rincianTotal]);

  const m = useMutation({
    mutationFn: async () => {
      const nota_path = file ? await uploadFile('nota', `${f.tanggal.slice(0, 7)}`, file, 3 * 1024 * 1024) : (expense?.nota_path ?? null);
      const payload = {
        tanggal: f.tanggal,
        category_id: f.category_id,
        nominal: Number(f.nominal),
        keterangan: f.keterangan.trim() || null,
        nota_path,
        rincian: pakaiRincian ? rincian.filter((r) => r.nama.trim() && Number(r.nominal) > 0).map((r) => ({ nama: r.nama.trim(), nominal: Number(r.nominal) })) : null,
      };
      const res = expense
        ? await supabase.from('expenses').update(payload).eq('id', expense.id)
        : await supabase.from('expenses').insert({ ...payload, recurring_id: preset?.recurring_id ?? null });
      if (res.error) throw res.error.code === '23505' ? new Error('Biaya rutin ini sudah dikonfirmasi untuk bulan tersebut.') : res.error;
    },
    onSuccess: () => {
      toast('success', 'Biaya tersimpan.');
      void qc.invalidateQueries({ queryKey: ['expenses'] });
      void qc.invalidateQueries({ queryKey: ['owner_dashboard'] });
      onClose();
    },
    onError: (e) => toast('error', errorMessage(e)),
  });
  const valid = f.tanggal && f.category_id && Number(f.nominal) > 0;
  return (
    <Modal
      open
      onClose={onClose}
      title={expense ? 'Ubah biaya' : preset ? `Konfirmasi ${preset.keterangan}` : 'Catat biaya'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Batal
          </Button>
          <Button loading={m.isPending} disabled={!valid} onClick={() => m.mutate()}>
            Simpan
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Input label="Tanggal" type="date" value={f.tanggal} min={periode} max={isoDate(monthEnd(new Date(`${periode}T00:00:00`)))} onChange={(e) => setF({ ...f, tanggal: e.target.value })} />
          <Select label="Kategori" value={f.category_id} onChange={(e) => setF({ ...f, category_id: e.target.value })}>
            {cats.filter((c) => c.aktif || c.id === f.category_id).map((c) => (
              <option key={c.id} value={c.id}>
                {c.nama}
              </option>
            ))}
          </Select>
        </div>
        <Input label="Nominal (Rp)" type="number" inputMode="numeric" min={1} value={f.nominal} disabled={pakaiRincian} onChange={(e) => setF({ ...f, nominal: e.target.value })} />
        <Input label="Keterangan" value={f.keterangan} onChange={(e) => setF({ ...f, keterangan: e.target.value })} maxLength={500} />
        <Checkbox label="Rincian per orang (mis. gaji)" checked={pakaiRincian} onChange={(e) => setPakaiRincian(e.target.checked)} />
        {pakaiRincian && (
          <div className="space-y-2 rounded-xl bg-cream-50 p-3">
            {rincian.map((r, i) => (
              <div key={i} className="flex gap-2">
                <input className="h-10 min-w-0 flex-1 rounded-lg border border-cream-300 bg-white px-2 text-sm" placeholder="Nama" value={r.nama} onChange={(e) => setRincian(rincian.map((x, j) => (j === i ? { ...x, nama: e.target.value } : x)))} aria-label="Nama" />
                <input className="h-10 w-32 rounded-lg border border-cream-300 bg-white px-2 text-right text-sm" type="number" placeholder="Nominal" value={r.nominal} onChange={(e) => setRincian(rincian.map((x, j) => (j === i ? { ...x, nominal: e.target.value } : x)))} aria-label="Nominal" />
                <button className="rounded-lg p-2 text-red-600 hover:bg-red-50" onClick={() => setRincian(rincian.filter((_, j) => j !== i))} disabled={rincian.length === 1} aria-label="Hapus baris">
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
            <Button size="sm" variant="ghost" icon={<Plus className="size-4" />} onClick={() => setRincian([...rincian, { nama: '', nominal: '' }])}>
              Tambah orang
            </Button>
          </div>
        )}
        <label className="block text-sm">
          <span className="font-semibold">Foto nota (opsional)</span>
          <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="mt-1 block w-full text-sm" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          {expense?.nota_path && !file && <span className="text-xs text-cocoa-500">Nota sudah terlampir.</span>}
        </label>
      </div>
    </Modal>
  );
}

function RecurringList({ periode, cats, rec, closed }: { periode: string; cats: Category[]; rec: Recurring[]; closed: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const expenses = useMonthExpenses(periode);
  const [confirming, setConfirming] = useState<Recurring | null>(null);
  const [editing, setEditing] = useState<Recurring | 'baru' | null>(null);
  const catName = new Map(cats.map((c) => [c.id, c.nama]));
  const done = new Map((expenses.data ?? []).filter((e) => e.recurring_id).map((e) => [e.recurring_id!, e]));
  const save = useMutation({
    mutationFn: async (r: { id?: string; nama: string; category_id: string; nominal_perkiraan: number; tanggal: number; aktif: boolean }) => {
      const { id, ...payload } = r;
      const res = id ? await supabase.from('recurring_expenses').update(payload).eq('id', id) : await supabase.from('recurring_expenses').insert(payload);
      if (res.error) throw res.error;
    },
    onSuccess: () => {
      toast('success', 'Biaya rutin tersimpan.');
      setEditing(null);
      void qc.invalidateQueries({ queryKey: ['finance_meta'] });
    },
    onError: (e) => toast('error', errorMessage(e)),
  });
  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center justify-between">
          <h2 className="font-sans text-lg font-bold capitalize">Konfirmasi {monthLabel(periode)}</h2>
          <Button size="sm" variant="secondary" icon={<Plus className="size-4" />} onClick={() => setEditing('baru')}>
            Biaya rutin baru
          </Button>
        </div>
        <p className="text-sm text-cocoa-600">Tagihan bulanan yang tinggal dikonfirmasi nominalnya.</p>
        {rec.length === 0 ? (
          <EmptyState title="Belum ada biaya rutin" />
        ) : (
          <ul className="mt-3 divide-y divide-cream-200">
            {rec.map((r) => {
              const e = done.get(r.id);
              return (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-semibold">
                      {r.nama} {!r.aktif && <Badge>Nonaktif</Badge>}
                    </p>
                    <p className="text-xs text-cocoa-500">
                      {catName.get(r.category_id)} · tiap tanggal {r.tanggal} · perkiraan {formatRupiah(r.nominal_perkiraan)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {e ? (
                      <Badge tone="green">Dikonfirmasi {formatRupiah(e.nominal)}</Badge>
                    ) : r.aktif && !closed ? (
                      <Button size="sm" icon={<CalendarCheck className="size-4" />} onClick={() => setConfirming(r)}>
                        Konfirmasi
                      </Button>
                    ) : (
                      <Badge tone="amber">Belum</Badge>
                    )}
                    <button className="rounded-lg p-2 text-cocoa-500 hover:bg-cream-100" onClick={() => setEditing(r)} aria-label={`Ubah ${r.nama}`}>
                      <Pencil className="size-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      {confirming && (
        <ExpenseModal
          expense={null}
          periode={periode}
          cats={cats}
          onClose={() => setConfirming(null)}
          preset={{
            category_id: confirming.category_id,
            nominal: confirming.nominal_perkiraan,
            keterangan: confirming.nama,
            recurring_id: confirming.id,
            tanggal: isoDate(new Date(`${periode.slice(0, 7)}-${String(confirming.tanggal).padStart(2, '0')}T00:00:00`)),
          }}
        />
      )}
      {editing && <RecurringModal item={editing === 'baru' ? null : editing} cats={cats} saving={save.isPending} onSave={(r) => save.mutate(r)} onClose={() => setEditing(null)} />}
    </div>
  );
}

function RecurringModal({
  item,
  cats,
  saving,
  onSave,
  onClose,
}: {
  item: Recurring | null;
  cats: Category[];
  saving: boolean;
  onSave: (r: { id?: string; nama: string; category_id: string; nominal_perkiraan: number; tanggal: number; aktif: boolean }) => void;
  onClose: () => void;
}) {
  const [f, setF] = useState({
    nama: item?.nama ?? '',
    category_id: item?.category_id ?? cats[0]?.id ?? '',
    nominal: String(item?.nominal_perkiraan ?? ''),
    tanggal: String(item?.tanggal ?? 1),
    aktif: item?.aktif ?? true,
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={item ? `Ubah ${item.nama}` : 'Biaya rutin baru'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Batal
          </Button>
          <Button
            loading={saving}
            disabled={!f.nama.trim() || !(Number(f.nominal) >= 0)}
            onClick={() => onSave({ id: item?.id, nama: f.nama.trim(), category_id: f.category_id, nominal_perkiraan: Number(f.nominal) || 0, tanggal: Math.min(28, Math.max(1, Number(f.tanggal) || 1)), aktif: f.aktif })}
          >
            Simpan
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input label="Nama" value={f.nama} onChange={(e) => setF({ ...f, nama: e.target.value })} placeholder="Gaji, sewa, listrik…" maxLength={80} />
        <Select label="Kategori" value={f.category_id} onChange={(e) => setF({ ...f, category_id: e.target.value })}>
          {cats.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nama}
            </option>
          ))}
        </Select>
        <div className="grid grid-cols-2 gap-4">
          <Input label="Perkiraan nominal (Rp)" type="number" min={0} value={f.nominal} onChange={(e) => setF({ ...f, nominal: e.target.value })} />
          <Input label="Tanggal jatuh tempo" type="number" min={1} max={28} value={f.tanggal} onChange={(e) => setF({ ...f, tanggal: e.target.value })} />
        </div>
        <Checkbox label="Aktif" checked={f.aktif} onChange={(e) => setF({ ...f, aktif: e.target.checked })} />
      </div>
    </Modal>
  );
}

function BudgetEditor({ periode, cats, closed }: { periode: string; cats: Category[]; closed: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const budgets = useQuery({
    queryKey: ['budgets', periode],
    queryFn: async () => {
      const { data, error } = await supabase.from('budgets').select('*').eq('periode', periode);
      if (error) throw error;
      return data;
    },
  });
  const expenses = useMonthExpenses(periode);
  const [draft, setDraft] = useState<Record<string, string>>({});
  useEffect(() => {
    setDraft(Object.fromEntries((budgets.data ?? []).map((b) => [b.category_id, String(b.nominal)])));
  }, [budgets.data]);
  const realisasi = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of expenses.data ?? []) m.set(e.category_id, (m.get(e.category_id) ?? 0) + e.nominal);
    return m;
  }, [expenses.data]);
  const save = useMutation({
    mutationFn: async () => {
      const rows = cats.filter((c) => draft[c.id] !== undefined && draft[c.id] !== '').map((c) => ({ periode, category_id: c.id, nominal: Number(draft[c.id]) || 0 }));
      const { error } = await supabase.from('budgets').upsert(rows, { onConflict: 'periode,category_id' });
      if (error) throw error;
    },
    onSuccess: () => {
      toast('success', 'Anggaran tersimpan.');
      void qc.invalidateQueries({ queryKey: ['budgets'] });
      void qc.invalidateQueries({ queryKey: ['owner_dashboard'] });
    },
    onError: (e) => toast('error', errorMessage(e)),
  });
  const copyPrev = async () => {
    const d = new Date(`${periode}T00:00:00`);
    const prev = isoDate(new Date(d.getFullYear(), d.getMonth() - 1, 1));
    const { data, error } = await supabase.from('budgets').select('*').eq('periode', prev);
    if (error) return toast('error', errorMessage(error));
    if (!data.length) return toast('error', 'Bulan sebelumnya belum punya anggaran.');
    setDraft(Object.fromEntries(data.map((b) => [b.category_id, String(b.nominal)])));
  };
  if (budgets.isLoading || expenses.isLoading) return <LoadingState />;
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-sans text-lg font-bold capitalize">Anggaran {monthLabel(periode)}</h2>
        {!closed && (
          <Button size="sm" variant="ghost" onClick={() => void copyPrev()}>
            Salin dari bulan lalu
          </Button>
        )}
      </div>
      <p className="text-sm text-cocoa-600">Hijau &lt; 80%, kuning 80–100%, merah &gt; 100% dari anggaran.</p>
      <ul className="mt-4 divide-y divide-cream-200">
        {cats.map((c) => {
          const real = realisasi.get(c.id) ?? 0;
          const ang = Number(draft[c.id] ?? 0);
          const s = budgetStatus(real, ang);
          return (
            <li key={c.id} className="grid items-center gap-2 py-3 sm:grid-cols-[1fr_10rem_12rem]">
              <span className="font-semibold">{c.nama}</span>
              <input
                type="number"
                min={0}
                className="h-10 rounded-lg border border-cream-300 bg-white px-2 text-right text-sm disabled:bg-cream-100"
                value={draft[c.id] ?? ''}
                placeholder="Tanpa anggaran"
                disabled={closed}
                onChange={(e) => setDraft({ ...draft, [c.id]: e.target.value })}
                aria-label={`Anggaran ${c.nama}`}
              />
              <span className={`flex items-center gap-1 text-xs ${draft[c.id] ? s.text : 'text-cocoa-500'}`}>
                {draft[c.id] ? <s.Icon className="size-3.5" aria-hidden /> : null}
                Realisasi {formatRupiah(real)}
                {draft[c.id] ? ` (${Math.round(s.pct)}%)` : ''}
              </span>
            </li>
          );
        })}
      </ul>
      {!closed && (
        <Button className="mt-4" loading={save.isPending} onClick={() => save.mutate()}>
          Simpan anggaran
        </Button>
      )}
    </Card>
  );
}

function Periods({ closings }: { closings: Tables<'period_closings'>[] }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [reopen, setReopen] = useState<string | null>(null);
  const [alasan, setAlasan] = useState('');
  const now = new Date();
  const months = Array.from({ length: 12 }, (_, i) => isoDate(new Date(now.getFullYear(), now.getMonth() - 1 - i, 1)));
  const byMonth = new Map(closings.map((c) => [c.periode, c]));
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['finance_meta'] });
  };
  const close = useMutation({
    mutationFn: async (p: string) => {
      const { error } = await supabase.rpc('close_period', { p_periode: p });
      if (error) throw error;
    },
    onSuccess: () => {
      toast('success', 'Periode ditutup.');
      invalidate();
    },
    onError: (e) => toast('error', errorMessage(e)),
  });
  const open = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('reopen_period', { p_periode: reopen!, p_alasan: alasan });
      if (error) throw error;
    },
    onSuccess: () => {
      toast('success', 'Periode dibuka kembali.');
      setReopen(null);
      setAlasan('');
      invalidate();
    },
    onError: (e) => toast('error', errorMessage(e)),
  });
  return (
    <Card>
      <h2 className="font-sans text-lg font-bold">Tutup buku per bulan</h2>
      <p className="text-sm text-cocoa-600">Bulan yang ditutup tidak bisa diubah (biaya & anggaran). Buka kembali hanya dengan alasan; tercatat di log aktivitas.</p>
      <ul className="mt-3 divide-y divide-cream-200">
        {months.map((m) => {
          const c = byMonth.get(m);
          const isClosed = c?.status === 'ditutup';
          return (
            <li key={m} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="font-semibold capitalize">{monthLabel(m)}</p>
                {c && (
                  <p className="text-xs text-cocoa-500">
                    {isClosed ? `Ditutup ${formatDateTime(c.closed_at)}` : `Dibuka kembali ${formatDateTime(c.reopened_at)} — ${c.alasan_buka}`}
                  </p>
                )}
              </div>
              {isClosed ? (
                <Button size="sm" variant="ghost" icon={<LockOpen className="size-4" />} onClick={() => setReopen(m)}>
                  Buka kembali
                </Button>
              ) : (
                <Button size="sm" variant="secondary" icon={<Lock className="size-4" />} loading={close.isPending && close.variables === m} onClick={() => close.mutate(m)}>
                  Tutup periode
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      <Modal
        open={reopen !== null}
        onClose={() => setReopen(null)}
        title={`Buka kembali ${reopen ? monthLabel(reopen) : ''}?`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setReopen(null)}>
              Batal
            </Button>
            <Button loading={open.isPending} disabled={alasan.trim().length < 3} onClick={() => open.mutate()}>
              Buka kembali
            </Button>
          </>
        }
      >
        <Input label="Alasan" value={alasan} onChange={(e) => setAlasan(e.target.value)} maxLength={200} hint="Wajib. Mis. ada nota susulan." />
      </Modal>
    </Card>
  );
}
