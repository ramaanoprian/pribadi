import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { MailPlus, MoreHorizontal } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';
import { formatPhone } from '@/lib/phone';
import { isEmail } from '@/lib/validation';
import { ilikeValue } from '@/lib/postgrest';
import { ROLE_LABEL, STAFF_ROLES } from '@/lib/permissions';
import type { AppRole, Tables } from '@/lib/database.types';
import { useAuth } from '@/auth/AuthProvider';
import { Badge, PageHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { DataTable, Pagination, SearchInput, type Column } from '@/components/ui/Table';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';

type Profile = Tables<'profiles'>;
type Invitation = Tables<'staff_invitations'>;
type Tab = 'staf' | 'member' | 'undangan';
const PAGE_SIZE = 20;

const roleTone = (r: AppRole) => (r === 'owner' ? 'brand' : r === 'admin' ? 'blue' : r === 'admin_baking' ? 'amber' : 'neutral');


export function Accounts() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'staf';
  const [inviteOpen, setInviteOpen] = useState(false);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'staf', label: 'Staf' },
    { key: 'member', label: 'Member' },
    { key: 'undangan', label: 'Undangan' },
  ];

  return (
    <>
      <PageHeader
        title="Akun & Peran"
        description="Kelola akun staf (lewat undangan email) dan lihat akun member."
        actions={
          <Button icon={<MailPlus className="size-4" />} onClick={() => setInviteOpen(true)}>
            Undang staf
          </Button>
        }
      />
      <div className="mb-5 flex gap-1 rounded-xl bg-cream-200/70 p-1 sm:inline-flex" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setParams({ tab: t.key })}
            className={clsx('h-9 flex-1 rounded-lg px-4 text-sm font-semibold transition', tab === t.key ? 'bg-white shadow-sm' : 'text-cocoa-600 hover:text-cocoa-900')}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'undangan' ? <InvitationList /> : <AccountList key={tab} kind={tab} />}
      <InviteModal open={inviteOpen} onClose={() => setInviteOpen(false)} onDone={() => setParams({ tab: 'undangan' })} />
    </>
  );
}

function AccountList({ kind }: { kind: 'staf' | 'member' }) {
  const { profile: me } = useAuth();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'' | AppRole>('');
  const [statusFilter, setStatusFilter] = useState<'' | 'aktif' | 'nonaktif'>('');
  const [page, setPage] = useState(1);
  const [action, setAction] = useState<{ type: 'peran' | 'status'; target: Profile } | null>(null);

  const q = useQuery({
    queryKey: ['accounts', kind, search, roleFilter, statusFilter, page],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let query = supabase.from('profiles').select('*', { count: 'exact' });
      query = kind === 'member' ? query.eq('role', 'member') : query.neq('role', 'member');
      if (roleFilter) query = query.eq('role', roleFilter);
      if (statusFilter) query = query.eq('aktif', statusFilter === 'aktif');
      if (search.trim()) {
        const s = ilikeValue(search);
        query = query.or(`nama.ilike.${s},email.ilike.${s},no_hp.ilike.${s}`);
      }
      const from = (page - 1) * PAGE_SIZE;
      const { data, error, count } = await query.order('created_at', { ascending: false }).range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      return { rows: data, total: count ?? 0 };
    },
  });

  const columns: Column<Profile>[] = [
    {
      key: 'nama',
      header: 'Nama',
      cell: (p) => (
        <div className="text-left">
          <p className="font-semibold">
            {p.nama || '-'} {p.id === me?.id && <span className="text-xs font-normal text-cocoa-500">(Anda)</span>}
          </p>
          <p className="text-xs text-cocoa-500">{p.email}</p>
        </div>
      ),
    },
    { key: 'hp', header: 'No. HP', cell: (p) => <span className="whitespace-nowrap">{formatPhone(p.no_hp)}</span> },
    { key: 'peran', header: 'Peran', cell: (p) => <Badge tone={roleTone(p.role)}>{ROLE_LABEL[p.role]}</Badge> },
    { key: 'status', header: 'Status', cell: (p) => (p.aktif ? <Badge tone="green">Aktif</Badge> : <Badge tone="red">Nonaktif</Badge>) },
    { key: 'login', header: 'Terakhir masuk', cell: (p) => <span className="text-cocoa-600">{p.last_sign_in_at ? formatDateTime(p.last_sign_in_at) : 'Belum pernah'}</span> },
    {
      key: 'aksi',
      header: '',
      className: 'text-right',
      cell: (p) =>
        p.id === me?.id ? null : (
          <div className="flex justify-end gap-1.5">
            <Button size="sm" variant="secondary" onClick={() => setAction({ type: 'peran', target: p })}>
              Ubah peran
            </Button>
            <Button size="sm" variant={p.aktif ? 'ghost' : 'secondary'} onClick={() => setAction({ type: 'status', target: p })}>
              {p.aktif ? 'Nonaktifkan' : 'Aktifkan'}
            </Button>
          </div>
        ),
    },
  ];

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder="Cari nama, email, atau nomor HP"
        />
        {kind === 'staf' && (
          <select
            className="h-11 rounded-xl border border-cream-300 bg-white px-3 text-sm"
            value={roleFilter}
            onChange={(e) => {
              setRoleFilter(e.target.value as AppRole | '');
              setPage(1);
            }}
            aria-label="Filter peran"
          >
            <option value="">Semua peran</option>
            {STAFF_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        )}
        <select
          className="h-11 rounded-xl border border-cream-300 bg-white px-3 text-sm"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as typeof statusFilter);
            setPage(1);
          }}
          aria-label="Filter status"
        >
          <option value="">Semua status</option>
          <option value="aktif">Aktif</option>
          <option value="nonaktif">Nonaktif</option>
        </select>
      </div>

      {q.isLoading ? (
        <LoadingState />
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
      ) : !q.data?.rows.length ? (
        <EmptyState title={search || roleFilter || statusFilter ? 'Tidak ada yang cocok' : kind === 'member' ? 'Belum ada member' : 'Belum ada staf'} description={search ? 'Coba kata kunci lain.' : undefined} />
      ) : (
        <>
          <DataTable rows={q.data.rows} columns={columns} rowKey={(p) => p.id} />
          <Pagination page={page} pageSize={PAGE_SIZE} total={q.data.total} onPage={setPage} />
        </>
      )}

      {action?.type === 'peran' && <ChangeRoleModal target={action.target} onClose={() => setAction(null)} />}
      {action?.type === 'status' && <ToggleActiveModal target={action.target} onClose={() => setAction(null)} />}
    </div>
  );
}

function ChangeRoleModal({ target, onClose }: { target: Profile; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [role, setRole] = useState<AppRole>(target.role);
  const [alasan, setAlasan] = useState('');
  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('set_user_role', { p_user_id: target.id, p_role: role, p_alasan: alasan.trim() || undefined });
      if (error) throw error;
    },
    onSuccess: () => {
      toast('success', `Peran ${target.nama || target.email} diubah menjadi ${ROLE_LABEL[role]}.`);
      void qc.invalidateQueries({ queryKey: ['accounts'] });
      onClose();
    },
    onError: (e) => toast('error', errorMessage(e)),
  });
  return (
    <Modal
      open
      onClose={onClose}
      title="Ubah peran"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Batal
          </Button>
          <Button loading={m.isPending} disabled={role === target.role} onClick={() => m.mutate()}>
            Simpan
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm">
          Akun: <strong>{target.nama || target.email}</strong> ({target.email})
        </p>
        <Select label="Peran baru" value={role} onChange={(e) => setRole(e.target.value as AppRole)}>
          {(['owner', 'admin', 'admin_baking', 'member'] as AppRole[]).map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </Select>
        {role === 'owner' && <p className="text-sm text-amber-700">Owner punya akses penuh, termasuk keuangan dan pengaturan.</p>}
        <Input label="Alasan (opsional)" value={alasan} onChange={(e) => setAlasan(e.target.value)} maxLength={200} hint="Tercatat di log aktivitas." />
      </div>
    </Modal>
  );
}

function ToggleActiveModal({ target, onClose }: { target: Profile; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [alasan, setAlasan] = useState('');
  const next = !target.aktif;
  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('set_user_active', { p_user_id: target.id, p_aktif: next, p_alasan: alasan.trim() || undefined });
      if (error) throw error;
    },
    onSuccess: () => {
      toast('success', next ? 'Akun diaktifkan.' : 'Akun dinonaktifkan.');
      void qc.invalidateQueries({ queryKey: ['accounts'] });
      onClose();
    },
    onError: (e) => toast('error', errorMessage(e)),
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={next ? 'Aktifkan akun?' : 'Nonaktifkan akun?'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Batal
          </Button>
          <Button variant={next ? 'primary' : 'danger'} loading={m.isPending} onClick={() => m.mutate()}>
            {next ? 'Aktifkan' : 'Nonaktifkan'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm">
          {next
            ? `${target.nama || target.email} akan bisa memakai sistem lagi sesuai perannya.`
            : `${target.nama || target.email} langsung kehilangan akses ke semua data, meskipun sedang masuk.`}
        </p>
        <Input label="Alasan (opsional)" value={alasan} onChange={(e) => setAlasan(e.target.value)} maxLength={200} hint="Tercatat di log aktivitas." />
      </div>
    </Modal>
  );
}

const INV_STATUS: Record<Invitation['status'], { label: string; tone: 'amber' | 'green' | 'neutral' | 'red' }> = {
  menunggu: { label: 'Menunggu', tone: 'amber' },
  terkirim: { label: 'Terkirim', tone: 'green' },
  dibatalkan: { label: 'Dibatalkan', tone: 'neutral' },
  gagal: { label: 'Gagal', tone: 'red' },
};

function InvitationList() {
  const qc = useQueryClient();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ['invitations', page],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const from = (page - 1) * PAGE_SIZE;
      const { data, error, count } = await supabase
        .from('staff_invitations')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      return { rows: data, total: count ?? 0 };
    },
  });
  const cancel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('cancel_staff_invitation', { p_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast('success', 'Undangan dibatalkan.');
      void qc.invalidateQueries({ queryKey: ['invitations'] });
    },
    onError: (e) => toast('error', errorMessage(e)),
  });

  const columns: Column<Invitation>[] = [
    {
      key: 'email',
      header: 'Email',
      cell: (i) => (
        <div className="text-left">
          <p className="font-semibold">{i.email}</p>
          {i.nama && <p className="text-xs text-cocoa-500">{i.nama}</p>}
        </div>
      ),
    },
    { key: 'peran', header: 'Peran', cell: (i) => <Badge tone={roleTone(i.role)}>{ROLE_LABEL[i.role]}</Badge> },
    {
      key: 'status',
      header: 'Status',
      cell: (i) => (
        <span title={i.catatan ?? undefined}>
          <Badge tone={INV_STATUS[i.status].tone}>{INV_STATUS[i.status].label}</Badge>
        </span>
      ),
    },
    { key: 'tgl', header: 'Dibuat', cell: (i) => formatDateTime(i.created_at) },
    {
      key: 'aksi',
      header: '',
      className: 'text-right',
      cell: (i) =>
        i.status === 'menunggu' || i.status === 'gagal' ? (
          <Button size="sm" variant="ghost" loading={cancel.isPending && cancel.variables === i.id} onClick={() => cancel.mutate(i.id)}>
            Batalkan
          </Button>
        ) : (
          <MoreHorizontal className="ml-auto size-4 text-cream-300" aria-hidden />
        ),
    },
  ];

  if (q.isLoading) return <LoadingState />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />;
  if (!q.data?.rows.length) return <EmptyState title="Belum ada undangan" description="Undang staf baru lewat tombol “Undang staf”." />;
  return (
    <>
      <DataTable rows={q.data.rows} columns={columns} rowKey={(i) => i.id} />
      <Pagination page={page} pageSize={PAGE_SIZE} total={q.data.total} onPage={setPage} />
      <p className="mt-3 text-xs text-cocoa-500">
        “Terkirim” = email undangan sudah dikirim dan akun staf dibuat. Staf membuat kata sandinya sendiri dari tautan di email. Untuk mencabut akses staf yang sudah diundang, nonaktifkan akunnya di tab Staf.
      </p>
    </>
  );
}

function InviteModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState({ email: '', nama: '', role: 'admin' as AppRole });
  const [error, setError] = useState<string | null>(null);

  const m = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('invite-staff', {
        body: { email: form.email.trim().toLowerCase(), nama: form.nama.trim(), role: form.role },
      });
      if (error) {
        // Ambil pesan galat dari badan respons Edge Function bila ada.
        const ctx = (error as { context?: Response }).context;
        const body = ctx && typeof ctx.json === 'function' ? await ctx.json().catch(() => null) : null;
        throw new Error(body?.error ?? error.message);
      }
      return data;
    },
    onSuccess: () => {
      toast('success', `Undangan dikirim ke ${form.email}.`);
      void qc.invalidateQueries({ queryKey: ['invitations'] });
      void qc.invalidateQueries({ queryKey: ['accounts'] });
      setForm({ email: '', nama: '', role: 'admin' });
      onClose();
      onDone();
    },
    onError: (e) => setError(errorMessage(e)),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!isEmail(form.email)) return setError('Email tidak valid.');
    setError(null);
    m.mutate();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Undang staf"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Batal
          </Button>
          <Button form="invite-form" type="submit" loading={m.isPending}>
            Kirim undangan
          </Button>
        </>
      }
    >
      <form id="invite-form" onSubmit={onSubmit} className="space-y-4">
        {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        <Input label="Nama" value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })} maxLength={120} />
        <Select label="Peran" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as AppRole })}>
          {STAFF_ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </Select>
        <p className="text-xs text-cocoa-500">Staf menerima email berisi tautan untuk membuat kata sandi. Tidak ada pendaftaran publik untuk akun staf.</p>
      </form>
    </Modal>
  );
}
