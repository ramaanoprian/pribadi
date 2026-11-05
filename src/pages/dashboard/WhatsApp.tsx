import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { AlertTriangle, CheckCircle2, Play, RefreshCw, RotateCcw, Send, Smartphone } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/auth/AuthProvider';
import { errorMessage } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';
import { formatPhone } from '@/lib/phone';
import { renderTemplate, unknownVariables, WA_STATUS_LABEL, WA_TAHAP_LABEL, WA_VARIABLES } from '@/lib/whatsapp';
import type { Tables, WaStatus } from '@/lib/database.types';
import { Alert, Card, PageHeader } from '@/components/ui/Card';
import { useDeviceStatus, waAdmin } from '@/hooks/useWhatsApp';
import { WaStatusBadge } from '@/components/WaStatusBadge';
import { Button } from '@/components/ui/Button';
import { Checkbox, Input, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { DataTable, Pagination, type Column } from '@/components/ui/Table';
import { EmptyState, ErrorState, LoadingState, Spinner } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';

type Message = Tables<'whatsapp_messages'> & { orders: { id: string; kode: string } | null };
type Template = Tables<'whatsapp_templates'>;
export function WhatsApp() {
  const { profile } = useAuth();
  const isOwner = profile?.role === 'owner';
  const [params, setParams] = useSearchParams();
  const tabs = [
    { key: 'log', label: 'Log pengiriman' },
    { key: 'template', label: 'Template' },
    ...(isOwner ? [{ key: 'koneksi', label: 'Koneksi Fonnte' }] : []),
  ];
  const tab = tabs.some((t) => t.key === params.get('tab')) ? params.get('tab')! : 'log';
  return (
    <>
      <PageHeader title="WhatsApp" description="Notifikasi transaksional otomatis ke pelanggan (termasuk tamu). Tidak ada pesan promosi." />
      <div className="-mx-4 mb-5 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:inline-flex sm:rounded-xl sm:bg-cream-200/70 sm:p-1" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setParams(t.key === 'log' ? {} : { tab: t.key })}
            className={clsx('h-9 shrink-0 rounded-lg px-4 text-sm font-semibold', tab === t.key ? 'bg-white shadow-sm' : 'text-cocoa-600')}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'log' && <MessageLog />}
      {tab === 'template' && <Templates />}
      {tab === 'koneksi' && isOwner && <Connection />}
    </>
  );
}

const PAGE_SIZE = 25;

function MessageLog() {
  const qc = useQueryClient();
  const toast = useToast();
  const [status, setStatus] = useState<'' | WaStatus>('');
  const [tahap, setTahap] = useState('');
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<Message | null>(null);

  const q = useQuery({
    queryKey: ['wa_messages', status, tahap, page],
    placeholderData: keepPreviousData,
    refetchInterval: 15_000,
    queryFn: async () => {
      let query = supabase.from('whatsapp_messages').select('*, orders(id, kode)', { count: 'exact' });
      if (status) query = query.eq('status', status);
      if (tahap) query = query.eq('tahap', tahap);
      const from = (page - 1) * PAGE_SIZE;
      const { data, error, count } = await query.order('created_at', { ascending: false }).range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      return { rows: data as Message[], total: count ?? 0 };
    },
  });

  const proses = useMutation({
    mutationFn: () => waAdmin<{ diproses: number; terkirim: number; gagal: number }>({ action: 'proses' }),
    onSuccess: (r) => {
      toast('success', r.diproses ? `${r.terkirim} terkirim, ${r.gagal} gagal dari ${r.diproses} pesan.` : 'Tidak ada pesan yang perlu dikirim saat ini.');
      void qc.invalidateQueries({ queryKey: ['wa_messages'] });
    },
    onError: (e) => toast('error', errorMessage(e)),
  });

  const resend = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('wa_resend', { p_id: id });
      if (error) throw error;
      await waAdmin({ action: 'proses' }).catch(() => null);
    },
    onSuccess: () => {
      toast('success', 'Pesan dikirim ulang.');
      setDetail(null);
      void qc.invalidateQueries({ queryKey: ['wa_messages'] });
    },
    onError: (e) => toast('error', errorMessage(e)),
  });

  const columns: Column<Message>[] = [
    { key: 'waktu', header: 'Waktu', cell: (m) => <span className="whitespace-nowrap text-cocoa-600">{formatDateTime(m.created_at)}</span> },
    {
      key: 'tujuan',
      header: 'Tujuan',
      cell: (m) => (
        <div className="text-left">
          <p className="whitespace-nowrap">{formatPhone(m.to_phone)}</p>
          {m.orders && (
            <Link to={`/dashboard/pesanan/${m.orders.id}`} onClick={(e) => e.stopPropagation()} className="text-xs font-semibold text-brand-600 hover:underline">
              {m.orders.kode}
            </Link>
          )}
        </div>
      ),
    },
    { key: 'tahap', header: 'Tahap', cell: (m) => WA_TAHAP_LABEL[m.tahap] ?? m.tahap },
    {
      key: 'status',
      header: 'Status',
      cell: (m) => (
        <div className="flex flex-col items-end gap-0.5 md:items-start">
          <WaStatusBadge status={m.status} />
          <span className="text-xs text-cocoa-500">
            {m.attempts}/{m.max_attempts} percobaan
          </span>
        </div>
      ),
    },
    {
      key: 'aksi',
      header: '',
      className: 'text-right',
      cell: (m) =>
        m.status === 'gagal' ? (
          <Button
            size="sm"
            variant="secondary"
            icon={<RotateCcw className="size-4" />}
            loading={resend.isPending && resend.variables === m.id}
            onClick={(e) => {
              e.stopPropagation();
              resend.mutate(m.id);
            }}
          >
            Kirim ulang
          </Button>
        ) : null,
    },
  ];

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <select className="h-11 rounded-xl border border-cream-300 bg-white px-3 text-sm" value={status} onChange={(e) => { setStatus(e.target.value as '' | WaStatus); setPage(1); }} aria-label="Filter status">
          <option value="">Semua status</option>
          {(Object.keys(WA_STATUS_LABEL) as WaStatus[]).map((s) => (
            <option key={s} value={s}>
              {WA_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <select className="h-11 rounded-xl border border-cream-300 bg-white px-3 text-sm" value={tahap} onChange={(e) => { setTahap(e.target.value); setPage(1); }} aria-label="Filter tahap">
          <option value="">Semua tahap</option>
          {Object.entries(WA_TAHAP_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <Button className="sm:ml-auto" variant="secondary" icon={<Play className="size-4" />} loading={proses.isPending} onClick={() => proses.mutate()}>
          Proses antrean sekarang
        </Button>
      </div>
      {q.isLoading ? (
        <LoadingState />
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
      ) : !q.data?.rows.length ? (
        <EmptyState title="Belum ada pesan" description={status || tahap ? 'Coba ubah filter.' : 'Pesan muncul di sini saat ada pesanan baru.'} />
      ) : (
        <>
          <DataTable rows={q.data.rows} columns={columns} rowKey={(m) => m.id} onRowClick={setDetail} />
          <Pagination page={page} pageSize={PAGE_SIZE} total={q.data.total} onPage={setPage} />
        </>
      )}
      <p className="mt-3 text-xs text-cocoa-500">Antrean diproses otomatis tiap menit. Pesan gagal dicoba ulang hingga 3 kali (jeda 1 lalu 5 menit) sebelum ditandai gagal.</p>

      <Modal
        open={detail !== null}
        onClose={() => setDetail(null)}
        title="Detail pesan"
        footer={
          detail?.status === 'gagal' ? (
            <Button icon={<RotateCcw className="size-4" />} loading={resend.isPending} onClick={() => resend.mutate(detail.id)}>
              Kirim ulang
            </Button>
          ) : undefined
        }
      >
        {detail && (
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <WaStatusBadge status={detail.status} />
              <span className="text-cocoa-600">
                ke {formatPhone(detail.to_phone)} · {WA_TAHAP_LABEL[detail.tahap] ?? detail.tahap}
              </span>
            </div>
            <pre className="rounded-xl bg-[#e7f8dc] p-3 font-sans text-sm whitespace-pre-wrap text-cocoa-900">{detail.body}</pre>
            <dl className="grid grid-cols-2 gap-2 text-xs text-cocoa-600">
              <dt>Dibuat</dt>
              <dd>{formatDateTime(detail.created_at)}</dd>
              <dt>Percobaan</dt>
              <dd>
                {detail.attempts}/{detail.max_attempts}
              </dd>
              {detail.sent_at && (
                <>
                  <dt>Terkirim</dt>
                  <dd>{formatDateTime(detail.sent_at)}</dd>
                </>
              )}
              {detail.status === 'pending' && detail.attempts > 0 && (
                <>
                  <dt>Coba lagi</dt>
                  <dd>{formatDateTime(detail.next_attempt_at)}</dd>
                </>
              )}
              {detail.provider && (
                <>
                  <dt>Penyedia</dt>
                  <dd>{detail.provider}</dd>
                </>
              )}
            </dl>
            {detail.last_error && <Alert tone="red" title="Galat terakhir">{detail.last_error}</Alert>}
          </div>
        )}
      </Modal>
    </div>
  );
}

function Templates() {
  const q = useQuery({
    queryKey: ['wa_templates'],
    queryFn: async () => {
      const { data, error } = await supabase.from('whatsapp_templates').select('*').order('urutan');
      if (error) throw error;
      return data;
    },
  });
  if (q.isLoading) return <LoadingState />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />;
  return (
    <div className="space-y-5">
      <Card className="text-sm">
        <p className="font-semibold">Variabel yang tersedia</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {WA_VARIABLES.map((v) => (
            <span key={v.key} className="rounded-lg bg-cream-100 px-2 py-1 font-mono text-xs" title={v.label}>
              {`{${v.key}}`}
            </span>
          ))}
        </div>
        <p className="mt-2 text-xs text-cocoa-500">Alamat dan nomor HP sengaja tidak tersedia agar pesan tidak memuat data sensitif. Format *teks* = tebal di WhatsApp.</p>
      </Card>
      {q.data?.map((t) => (
        <TemplateEditor key={t.tahap} t={t} />
      ))}
    </div>
  );
}

function TemplateEditor({ t }: { t: Template }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [isi, setIsi] = useState(t.isi);
  const [aktif, setAktif] = useState(t.aktif);
  useEffect(() => {
    setIsi(t.isi);
    setAktif(t.aktif);
  }, [t.isi, t.aktif]);
  const unknown = unknownVariables(isi);
  const dirty = isi !== t.isi || aktif !== t.aktif;
  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('whatsapp_templates').update({ isi, aktif }).eq('tahap', t.tahap);
      if (error) throw error;
    },
    onSuccess: () => {
      toast('success', `Template “${t.judul}” tersimpan.`);
      void qc.invalidateQueries({ queryKey: ['wa_templates'] });
    },
    onError: (e) => toast('error', errorMessage(e)),
  });
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-sans text-lg font-bold">{t.judul}</h2>
        <Checkbox label="Aktif" checked={aktif} onChange={(e) => setAktif(e.target.checked)} />
      </div>
      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        <Textarea label="Isi pesan" value={isi} onChange={(e) => setIsi(e.target.value)} maxLength={2000} className="min-h-48 font-mono text-xs" error={unknown.length ? `Variabel tidak dikenal: ${unknown.map((u) => `{${u}}`).join(', ')}` : null} />
        <div>
          <p className="mb-1.5 text-sm font-semibold text-cocoa-800">Pratinjau (data contoh)</p>
          <div className="rounded-2xl bg-[#efeae2] p-3">
            <pre className="ml-auto max-w-[95%] rounded-xl rounded-tr-sm bg-[#d9fdd3] p-3 font-sans text-sm whitespace-pre-wrap text-cocoa-900 shadow-sm">{renderTemplate(isi)}</pre>
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-xs text-cocoa-400">Diubah {formatDateTime(t.updated_at)}</span>
        <Button size="sm" disabled={!dirty || unknown.length > 0} loading={m.isPending} onClick={() => m.mutate()}>
          Simpan
        </Button>
      </div>
    </Card>
  );
}

function Connection() {
  const qc = useQueryClient();
  const toast = useToast();
  const status = useDeviceStatus();
  const [testOpen, setTestOpen] = useState(false);
  const [to, setTo] = useState('');
  const test = useMutation({
    mutationFn: () => waAdmin<{ terkirim: number; gagal: number }>({ action: 'test', to }),
    onSuccess: (r) => {
      toast(r.terkirim ? 'success' : 'error', r.terkirim ? 'Pesan uji terkirim.' : 'Pesan uji gagal. Lihat detail di log.');
      setTestOpen(false);
      void qc.invalidateQueries({ queryKey: ['wa_messages'] });
    },
    onError: (e) => toast('error', errorMessage(e)),
  });
  const s = status.data;
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-sans text-lg font-bold">
            <Smartphone className="size-5 text-cocoa-500" /> Status perangkat
          </h2>
          <Button size="sm" variant="ghost" icon={<RefreshCw className="size-4" />} loading={status.isFetching} onClick={() => void status.refetch()}>
            Periksa
          </Button>
        </div>
        <div className="mt-4">
          {status.isLoading ? (
            <Spinner label="Menghubungi penyedia…" />
          ) : status.isError ? (
            <Alert tone="red" title="Gagal memeriksa status">{errorMessage(status.error)}</Alert>
          ) : s && !s.configured ? (
            <Alert tone="amber" title="Token Fonnte belum diatur">
              Simpan token perangkat sebagai secret server (bukan di website):
              <code className="mt-2 block rounded bg-white/70 p-2 text-xs">npx supabase secrets set FONNTE_TOKEN=token-anda</code>
            </Alert>
          ) : s?.connected ? (
            <Alert tone="green" title="Perangkat terhubung">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="size-4" /> {s.name ?? s.device} {s.provider === 'dummy' && '(mode simulasi — pesan tidak benar-benar dikirim)'}
              </span>
            </Alert>
          ) : (
            <Alert tone="red" title="Perangkat terputus">
              <span className="flex items-start gap-1">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" /> Pesan akan gagal sampai perangkat dihubungkan ulang di dashboard Fonnte (pindai QR). {s?.detail && `Detail: ${s.detail}`}
              </span>
            </Alert>
          )}
          {s && s.configured && (
            <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
              <dt className="text-cocoa-500">Penyedia</dt>
              <dd>{s.provider}</dd>
              {s.device && (
                <>
                  <dt className="text-cocoa-500">Nomor perangkat</dt>
                  <dd>{s.device}</dd>
                </>
              )}
              {s.quota && (
                <>
                  <dt className="text-cocoa-500">Kuota</dt>
                  <dd>{s.quota}</dd>
                </>
              )}
              {s.expired && (
                <>
                  <dt className="text-cocoa-500">Berlaku hingga</dt>
                  <dd>{s.expired}</dd>
                </>
              )}
            </dl>
          )}
        </div>
      </Card>
      <Card className="space-y-3">
        <h2 className="flex items-center gap-2 font-sans text-lg font-bold">
          <Send className="size-5 text-cocoa-500" /> Uji kirim
        </h2>
        <p className="text-sm text-cocoa-600">Kirim satu pesan uji ke nomor Anda untuk memastikan koneksi berjalan. Tercatat di log & log aktivitas.</p>
        <Button variant="secondary" onClick={() => setTestOpen(true)}>
          Kirim pesan uji
        </Button>
        <div className="border-t border-cream-200 pt-3 text-xs text-cocoa-500">
          Jeda antarpesan, batas per menit, dan sakelar notifikasi diatur di{' '}
          <Link to="/dashboard/pengaturan" className="font-semibold text-brand-600 hover:underline">
            Pengaturan
          </Link>
          .
        </div>
      </Card>
      <Modal
        open={testOpen}
        onClose={() => setTestOpen(false)}
        title="Kirim pesan uji"
        footer={
          <>
            <Button variant="ghost" onClick={() => setTestOpen(false)}>
              Batal
            </Button>
            <Button loading={test.isPending} disabled={!to.trim()} onClick={() => test.mutate()}>
              Kirim
            </Button>
          </>
        }
      >
        <Input label="Nomor WhatsApp tujuan" type="tel" inputMode="tel" value={to} onChange={(e) => setTo(e.target.value)} placeholder="0812xxxxxxxx" />
      </Modal>
    </div>
  );
}
