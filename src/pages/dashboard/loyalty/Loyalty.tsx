import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { Gift } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/auth/AuthProvider';
import { errorMessage } from '@/lib/errors';
import { formatDate, formatRupiah } from '@/lib/format';
import { formatPhone } from '@/lib/phone';
import { effectiveStatus, REDEMPTION_STATUS, REWARD_JENIS_LABEL } from '@/lib/loyalty';
import type { RewardJenis, Tables } from '@/lib/database.types';
import { Badge, Card, PageHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Checkbox, Input, Select } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { DataTable, Pagination, SearchInput, type Column } from '@/components/ui/Table';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { AdjustStampModal } from './CustomerLoyalty';

export function Loyalty() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'member';
  const tabs = [
    { key: 'member', label: 'Member & stamp' },
    { key: 'hadiah', label: 'Hadiah' },
    { key: 'aturan', label: 'Aturan' },
  ];
  return (
    <>
      <PageHeader title="Stamp & Hadiah" description="1 pesanan member selesai = 1 stamp. Kartu penuh membuka hadiah yang dipakai di pesanan berikutnya." />
      <div className="mb-5 inline-flex gap-1 rounded-xl bg-cream-200/70 p-1" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setParams(t.key === 'member' ? {} : { tab: t.key })}
            className={clsx('h-9 rounded-lg px-4 text-sm font-semibold', tab === t.key ? 'bg-white shadow-sm' : 'text-cocoa-600')}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'member' && <Members />}
      {tab === 'hadiah' && <Redemptions />}
      {tab === 'aturan' && <Rules />}
    </>
  );
}

type MemberRow = { id: string; nama: string; phone_normalized: string; stamp: number; lencana: number; hadiah: number };
const PAGE = 20;

function Members() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [adjust, setAdjust] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ['loyalty_members', search, page],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('loyalty_members', { p_search: search || null, p_limit: PAGE, p_offset: (page - 1) * PAGE });
      if (error) throw error;
      return data as unknown as { total: number; rows: MemberRow[] };
    },
  });
  const columns: Column<MemberRow>[] = [
    {
      key: 'nama',
      header: 'Member',
      cell: (m) => (
        <Link to={`/dashboard/pelanggan/${m.id}`} className="text-left font-semibold hover:text-brand-600">
          {m.nama}
          <span className="block text-xs font-normal text-cocoa-500">{formatPhone(m.phone_normalized)}</span>
        </Link>
      ),
    },
    { key: 'stamp', header: 'Stamp', cell: (m) => <span className="font-bold tabular-nums">{m.stamp}</span> },
    { key: 'lencana', header: 'Lencana', cell: (m) => m.lencana },
    { key: 'hadiah', header: 'Hadiah tersedia', cell: (m) => (m.hadiah ? <Badge tone="green">{m.hadiah}</Badge> : '-') },
    {
      key: 'aksi',
      header: '',
      className: 'text-right',
      cell: (m) => (
        <Button size="sm" variant="secondary" onClick={() => setAdjust(m.id)}>
          Koreksi stamp
        </Button>
      ),
    },
  ];
  return (
    <div>
      <div className="mb-4">
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Cari nama atau nomor HP member" />
      </div>
      {q.isLoading ? (
        <LoadingState />
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
      ) : !q.data?.rows.length ? (
        <EmptyState title="Belum ada member" />
      ) : (
        <>
          <DataTable rows={q.data.rows} columns={columns} rowKey={(m) => m.id} />
          <Pagination page={page} pageSize={PAGE} total={q.data.total} onPage={setPage} />
        </>
      )}
      {adjust && <AdjustStampModal customerId={adjust} onClose={() => setAdjust(null)} />}
    </div>
  );
}

type Redemption = Tables<'reward_redemptions'> & { customers: { nama: string } | null; orders: { id: string; kode: string } | null };

function Redemptions() {
  const qc = useQueryClient();
  const toast = useToast();
  const [status, setStatus] = useState('tersedia');
  const [page, setPage] = useState(1);
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [kode, setKode] = useState('');
  const [catatan, setCatatan] = useState('');
  const q = useQuery({
    queryKey: ['reward_redemptions', 'list', status, page],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let query = supabase.from('reward_redemptions').select('*, customers(nama), orders(id, kode)', { count: 'exact' });
      if (status === 'tersedia') query = query.eq('status', 'tersedia').gt('expires_at', new Date().toISOString());
      else if (status === 'kedaluwarsa') query = query.or(`status.eq.kedaluwarsa,and(status.eq.tersedia,expires_at.lt.${new Date().toISOString()})`);
      else if (status) query = query.eq('status', status as 'dipakai');
      const from = (page - 1) * PAGE;
      const { data, error, count } = await query.order('created_at', { ascending: false }).range(from, from + PAGE - 1);
      if (error) throw error;
      return { rows: data as unknown as Redemption[], total: count ?? 0 };
    },
  });
  const redeem = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('redeem_reward_manual', { p_kode: kode, p_catatan: catatan });
      if (error) throw error;
    },
    onSuccess: () => {
      toast('success', `Hadiah ${kode.toUpperCase()} ditukar.`);
      setRedeemOpen(false);
      setKode('');
      setCatatan('');
      void qc.invalidateQueries({ queryKey: ['reward_redemptions'] });
    },
    onError: (e) => toast('error', errorMessage(e)),
  });
  const columns: Column<Redemption>[] = [
    {
      key: 'kode',
      header: 'Hadiah',
      cell: (r) => (
        <div className="text-left">
          <p className="font-semibold">{r.nama}</p>
          <p className="font-mono text-xs text-cocoa-500">{r.kode}</p>
        </div>
      ),
    },
    { key: 'member', header: 'Member', cell: (r) => r.customers?.nama ?? '-' },
    { key: 'berlaku', header: 'Berlaku hingga', cell: (r) => formatDate(r.expires_at) },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => {
        const st = REDEMPTION_STATUS[effectiveStatus(r.status, r.expires_at)];
        return (
          <div className="flex flex-col items-end gap-0.5 md:items-start">
            <Badge tone={st.tone}>{st.label}</Badge>
            {r.orders ? (
              <Link to={`/dashboard/pesanan/${r.orders.id}`} className="text-xs font-semibold text-brand-600 hover:underline">
                {r.orders.kode}
              </Link>
            ) : r.catatan ? (
              <span className="text-xs text-cocoa-500">{r.catatan}</span>
            ) : null}
          </div>
        );
      },
    },
  ];
  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <select className="h-11 rounded-xl border border-cream-300 bg-white px-3 text-sm" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Filter status">
          <option value="tersedia">Tersedia</option>
          <option value="dipakai">Dipakai</option>
          <option value="kedaluwarsa">Kedaluwarsa</option>
          <option value="">Semua</option>
        </select>
        <Button className="sm:ml-auto" icon={<Gift className="size-4" />} onClick={() => setRedeemOpen(true)}>
          Tukar hadiah di toko
        </Button>
      </div>
      {q.isLoading ? (
        <LoadingState />
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
      ) : !q.data?.rows.length ? (
        <EmptyState icon={<Gift className="size-8" />} title="Tidak ada hadiah" />
      ) : (
        <>
          <DataTable rows={q.data.rows} columns={columns} rowKey={(r) => r.id} />
          <Pagination page={page} pageSize={PAGE} total={q.data.total} onPage={setPage} />
        </>
      )}
      <p className="mt-3 text-xs text-cocoa-500">Hadiah yang dipakai di pesanan online diverifikasi di halaman detail pesanan.</p>
      <Modal
        open={redeemOpen}
        onClose={() => setRedeemOpen(false)}
        title="Tukar hadiah di toko"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRedeemOpen(false)}>
              Batal
            </Button>
            <Button loading={redeem.isPending} disabled={!kode.trim() || catatan.trim().length < 3} onClick={() => redeem.mutate()}>
              Tukar
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input label="Kode hadiah" value={kode} onChange={(e) => setKode(e.target.value.toUpperCase())} placeholder="HD-XXXXXX" className="font-mono" />
          <Input label="Catatan" value={catatan} onChange={(e) => setCatatan(e.target.value)} maxLength={200} hint="Wajib. Mis. ditukar di kasir, produk yang diberikan." />
        </div>
      </Modal>
    </div>
  );
}

function Rules() {
  const { profile } = useAuth();
  const isOwner = profile?.role === 'owner';
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({
    queryKey: ['stamp_rules'],
    queryFn: async () => {
      const [rules, rewards, badges, products] = await Promise.all([
        supabase.from('stamp_rules').select('*').single(),
        supabase.from('rewards').select('*'),
        supabase.from('badges').select('*').order('ambang'),
        supabase.from('products').select('id, nama').eq('aktif', true).order('nama'),
      ]);
      const err = rules.error ?? rewards.error ?? badges.error ?? products.error;
      if (err) throw err;
      return { rules: rules.data!, reward: rewards.data!.find((r) => r.id === rules.data!.reward_id)!, badges: badges.data ?? [], products: products.data ?? [] };
    },
  });
  const [f, setF] = useState({ aktif: true, stamps: '10', min: '0', hari: '180', nama: '', jenis: 'diskon_nominal' as RewardJenis, nilai: '0', maks: '', product: '' });
  useEffect(() => {
    if (!q.data) return;
    const { rules, reward } = q.data;
    setF({
      aktif: rules.aktif,
      stamps: String(rules.stamps_per_reward),
      min: String(rules.min_belanja_per_stamp),
      hari: String(rules.masa_berlaku_hari),
      nama: reward.nama,
      jenis: reward.jenis,
      nilai: String(reward.nilai),
      maks: reward.maks_diskon ? String(reward.maks_diskon) : '',
      product: reward.product_id ?? '',
    });
  }, [q.data]);
  const save = useMutation({
    mutationFn: async () => {
      const r1 = await supabase
        .from('stamp_rules')
        .update({ aktif: f.aktif, stamps_per_reward: Number(f.stamps), min_belanja_per_stamp: Number(f.min) || 0, masa_berlaku_hari: Number(f.hari) })
        .eq('id', 1);
      if (r1.error) throw r1.error;
      const r2 = await supabase
        .from('rewards')
        .update({
          nama: f.nama.trim() || REWARD_JENIS_LABEL[f.jenis],
          jenis: f.jenis,
          nilai: f.jenis === 'gratis_ongkir' || f.jenis === 'produk_gratis' ? 0 : Number(f.nilai),
          maks_diskon: f.jenis === 'diskon_persen' && f.maks ? Number(f.maks) : null,
          product_id: f.jenis === 'produk_gratis' ? f.product || null : null,
        })
        .eq('id', q.data!.reward.id);
      if (r2.error) throw r2.error;
    },
    onSuccess: () => {
      toast('success', 'Aturan stamp tersimpan. Berlaku untuk hadiah yang terbuka berikutnya.');
      void qc.invalidateQueries({ queryKey: ['stamp_rules'] });
    },
    onError: (e) => toast('error', errorMessage(e)),
  });
  if (q.isLoading) return <LoadingState />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />;
  const ro = !isOwner;
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="space-y-4">
        <h2 className="font-sans text-lg font-bold">Aturan stamp & hadiah</h2>
        {ro && <p className="text-sm text-cocoa-500">Hanya Owner yang bisa mengubah aturan.</p>}
        <fieldset disabled={ro} className="space-y-4">
          <Checkbox label="Program stamp aktif" checked={f.aktif} onChange={(e) => setF({ ...f, aktif: e.target.checked })} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Stamp per hadiah" type="number" min={2} max={50} value={f.stamps} onChange={(e) => setF({ ...f, stamps: e.target.value })} />
            <Input label="Masa berlaku hadiah (hari)" type="number" min={7} max={730} value={f.hari} onChange={(e) => setF({ ...f, hari: e.target.value })} />
          </div>
          <Input label="Minimal belanja per stamp (Rp)" type="number" min={0} value={f.min} onChange={(e) => setF({ ...f, min: e.target.value })} hint="0 = setiap pesanan selesai dapat stamp." />
          <Select label="Jenis hadiah" value={f.jenis} onChange={(e) => setF({ ...f, jenis: e.target.value as RewardJenis })}>
            {(Object.keys(REWARD_JENIS_LABEL) as RewardJenis[]).map((j) => (
              <option key={j} value={j}>
                {REWARD_JENIS_LABEL[j]}
              </option>
            ))}
          </Select>
          {(f.jenis === 'diskon_nominal' || f.jenis === 'diskon_persen') && (
            <div className="grid grid-cols-2 gap-4">
              <Input label={f.jenis === 'diskon_persen' ? 'Diskon (%)' : 'Diskon (Rp)'} type="number" min={1} value={f.nilai} onChange={(e) => setF({ ...f, nilai: e.target.value })} />
              {f.jenis === 'diskon_persen' && <Input label="Maks. diskon (Rp)" type="number" min={1} value={f.maks} onChange={(e) => setF({ ...f, maks: e.target.value })} />}
            </div>
          )}
          {f.jenis === 'produk_gratis' && (
            <Select label="Produk gratis" value={f.product} onChange={(e) => setF({ ...f, product: e.target.value })}>
              <option value="">Pilih produk…</option>
              {q.data!.products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nama}
                </option>
              ))}
            </Select>
          )}
          <Input label="Nama hadiah (ditampilkan ke member)" value={f.nama} onChange={(e) => setF({ ...f, nama: e.target.value })} maxLength={80} />
        </fieldset>
        {isOwner && (
          <Button loading={save.isPending} onClick={() => save.mutate()}>
            Simpan aturan
          </Button>
        )}
        <p className="text-xs text-cocoa-500">
          Contoh saat ini: {f.stamps} stamp → {f.jenis === 'diskon_nominal' ? formatRupiah(Number(f.nilai)) : REWARD_JENIS_LABEL[f.jenis]}, berlaku {f.hari} hari.
        </p>
      </Card>
      <BadgesEditor badges={q.data!.badges} readOnly={ro} />
    </div>
  );
}

function BadgesEditor({ badges, readOnly }: { badges: Tables<'badges'>[]; readOnly: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [rows, setRows] = useState(badges);
  useEffect(() => setRows(badges), [badges]);
  const save = useMutation({
    mutationFn: async (b: Tables<'badges'>) => {
      const { error } = await supabase.from('badges').update({ nama: b.nama, ambang: b.ambang, aktif: b.aktif, deskripsi: b.deskripsi }).eq('id', b.id);
      if (error) throw error.code === '23505' ? new Error('Ambang lencana harus berbeda-beda.') : error;
    },
    onSuccess: () => {
      toast('success', 'Lencana tersimpan.');
      void qc.invalidateQueries({ queryKey: ['stamp_rules'] });
    },
    onError: (e) => toast('error', errorMessage(e)),
  });
  return (
    <Card>
      <h2 className="font-sans text-lg font-bold">Lencana & ambang</h2>
      <p className="text-sm text-cocoa-600">Diberikan otomatis saat jumlah pesanan selesai member mencapai ambang.</p>
      <ul className="mt-3 space-y-3">
        {rows.map((b, idx) => (
          <li key={b.id} className="grid grid-cols-[1fr_6rem_auto] items-end gap-2">
            <Input label={idx === 0 ? 'Nama' : undefined} value={b.nama} disabled={readOnly} onChange={(e) => setRows(rows.map((x) => (x.id === b.id ? { ...x, nama: e.target.value } : x)))} />
            <Input label={idx === 0 ? 'Pesanan' : undefined} type="number" min={1} value={b.ambang} disabled={readOnly} onChange={(e) => setRows(rows.map((x) => (x.id === b.id ? { ...x, ambang: Number(e.target.value) } : x)))} />
            {!readOnly && (
              <Button size="sm" variant="secondary" className="h-11" loading={save.isPending && save.variables?.id === b.id} onClick={() => save.mutate(b)}>
                Simpan
              </Button>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
