import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { Bike, MessageCircle, Store, Tag, UserRound } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/auth/AuthProvider';
import { useCart } from '@/lib/cart';
import { errorMessage } from '@/lib/errors';
import { formatPhone, normalizePhone } from '@/lib/phone';
import { formatRupiah } from '@/lib/format';
import { toLocalInput, type PublicOrder } from '@/lib/orders';
import { useContent, usePublicSettings } from '@/hooks/usePublic';
import { useMyLoyalty } from '@/components/account/LoyaltyCard';
import { effectiveStatus } from '@/lib/loyalty';
import type { Fulfillment } from '@/lib/database.types';
import { Alert, Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Field';

type Promo = { kode: string; nama: string; diskon: number } | null;

function defaultSchedule(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  return toLocalInput(d);
}

export function Checkout() {
  const { session, profile } = useAuth();
  const cart = useCart();
  const navigate = useNavigate();
  const { c } = useContent();
  const { freeShippingMin } = usePublicSettings();
  const isMember = profile?.role === 'member';

  const [guest, setGuest] = useState(false);
  const [form, setForm] = useState({ nama: '', no_hp: '', fulfillment: 'ambil' as Fulfillment, jadwal: defaultSchedule(), alamat: '', catatan: '' });
  const [addressId, setAddressId] = useState<string>('');
  const [promoInput, setPromoInput] = useState('');
  const [promo, setPromo] = useState<Promo>(null);
  const [promoMsg, setPromoMsg] = useState<string | null>(null);
  const [checkingPromo, setCheckingPromo] = useState(false);
  const [hadiah, setHadiah] = useState('');
  const loyalty = useMyLoyalty();
  const availableRewards = (loyalty.data?.hadiah_saya ?? []).filter((h) => effectiveStatus(h.status, h.expires_at) === 'tersedia');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  /** true setelah pesanan dibuat: cegah alih ke /keranjang saat keranjang dikosongkan. */
  const placed = useRef(false);

  const addresses = useQuery({
    queryKey: ['addresses', profile?.id],
    enabled: isMember,
    queryFn: async () => {
      const { data, error } = await supabase.from('addresses').select('*').eq('user_id', profile!.id).order('is_default', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Isi otomatis dari akun member.
  useEffect(() => {
    if (!profile) return;
    setForm((f) => ({ ...f, nama: f.nama || profile.nama, no_hp: f.no_hp || (profile.no_hp ? formatPhone(profile.no_hp) : '') }));
  }, [profile]);
  useEffect(() => {
    const def = addresses.data?.[0];
    if (def && !addressId) {
      setAddressId(def.id);
      setForm((f) => ({ ...f, alamat: f.alamat || `${def.alamat}${def.catatan ? ` (${def.catatan})` : ''}` }));
    }
  }, [addresses.data, addressId]);

  // Promo dihitung ulang bila subtotal berubah.
  useEffect(() => {
    setPromo(null);
    setPromoMsg(null);
  }, [cart.subtotal]);

  const diskon = promo?.diskon ?? 0;
  const free = form.fulfillment === 'antar' && freeShippingMin > 0 && cart.subtotal - diskon >= freeShippingMin;
  const total = cart.subtotal - diskon;
  const minSchedule = useMemo(() => toLocalInput(new Date(Date.now() + 60 * 60 * 1000)), []);

  if (cart.items.length === 0) return placed.current ? null : <Navigate to="/keranjang" replace />;

  // Pilihan: lanjut sebagai tamu atau masuk/daftar.
  if (!session && !guest) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
        <h1 className="text-3xl font-bold">Checkout</h1>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Card className="flex flex-col">
            <UserRound className="size-7 text-brand-500" />
            <h2 className="mt-3 font-sans text-lg font-bold">Masuk / Daftar member</h2>
            <p className="mt-1 flex-1 text-sm text-cocoa-600">Data & alamat terisi otomatis, riwayat pesanan tersimpan, dan setiap pesanan selesai dapat stamp.</p>
            <div className="mt-4 flex gap-2">
              <Link to="/masuk?next=/checkout" className="flex h-11 flex-1 items-center justify-center rounded-xl bg-brand-500 font-semibold text-white hover:bg-brand-600">
                Masuk
              </Link>
              <Link to="/daftar?next=/checkout" className="flex h-11 flex-1 items-center justify-center rounded-xl bg-white font-semibold ring-1 ring-cream-300 hover:bg-cream-50">
                Daftar
              </Link>
            </div>
          </Card>
          <Card className="flex flex-col">
            <Store className="size-7 text-cocoa-500" />
            <h2 className="mt-3 font-sans text-lg font-bold">Lanjut sebagai tamu</h2>
            <p className="mt-1 flex-1 text-sm text-cocoa-600">Cukup isi nama, nomor WhatsApp, dan jadwal. Tanpa membuat akun.</p>
            <Button variant="secondary" className="mt-4" onClick={() => setGuest(true)}>
              Lanjut sebagai tamu
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  async function applyPromo() {
    if (!promoInput.trim()) return;
    setCheckingPromo(true);
    setPromoMsg(null);
    const { data, error } = await supabase.rpc('check_promo', { p_kode: promoInput.trim(), p_subtotal: cart.subtotal });
    setCheckingPromo(false);
    if (error) return setPromoMsg(errorMessage(error));
    const r = data as { valid: boolean; pesan?: string; kode?: string; nama?: string; diskon?: number };
    if (!r.valid) {
      setPromo(null);
      setPromoMsg(r.pesan ?? 'Kode promo tidak berlaku');
    } else {
      setPromo({ kode: r.kode!, nama: r.nama!, diskon: r.diskon! });
      setPromoMsg(null);
    }
  }

  function validate() {
    const v: Record<string, string> = {};
    if (form.nama.trim().length < 2) v.nama = 'Nama wajib diisi.';
    if (!normalizePhone(form.no_hp)) v.no_hp = 'Nomor WhatsApp tidak valid. Contoh: 0812xxxxxxxx.';
    const j = new Date(form.jadwal);
    if (!form.jadwal || Number.isNaN(j.getTime()) || j.getTime() < Date.now() + 30 * 60 * 1000) v.jadwal = 'Pilih jadwal minimal 30 menit dari sekarang.';
    if (form.fulfillment === 'antar' && form.alamat.trim().length < 10) v.alamat = 'Alamat pengantaran wajib diisi lengkap.';
    return v;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const v = validate();
    setErrors(v);
    if (Object.keys(v).length) return;
    setSubmitting(true);
    setServerError(null);
    const { data, error } = await supabase.rpc('create_order', {
      p_nama: form.nama.trim(),
      p_no_hp: form.no_hp,
      p_fulfillment: form.fulfillment,
      p_jadwal: new Date(form.jadwal).toISOString(),
      p_items: cart.items.map((i) => ({ product_id: i.product_id, qty: i.qty })),
      p_alamat: form.fulfillment === 'antar' ? form.alamat.trim() : null,
      p_catatan: form.catatan.trim() || null,
      p_kode_promo: promo?.kode ?? null,
      p_persetujuan_wa: true,
      p_kode_hadiah: hadiah || null,
    });
    setSubmitting(false);
    if (error) return setServerError(errorMessage(error));
    const order = data as unknown as PublicOrder;
    placed.current = true;
    navigate(`/lacak/${order.tracking_code}?baru=1`, { replace: true });
    cart.clear();
  }

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    // Pesan galat hilang begitu kolomnya diperbaiki.
    if (errors[k]) setErrors(({ [k]: _, ...rest }) => rest);
  };
  const opt = (on: boolean) =>
    clsx('flex flex-1 items-center gap-3 rounded-xl p-4 text-left ring-1 transition', on ? 'bg-brand-50 ring-2 ring-brand-500' : 'bg-white ring-cream-300 hover:bg-cream-50');

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
      <h1 className="text-3xl font-bold">Checkout</h1>
      {!session && <p className="mt-1 text-sm text-cocoa-600">Memesan sebagai tamu.</p>}
      <form onSubmit={onSubmit} className="mt-6 grid gap-6 lg:grid-cols-[1fr_22rem]" noValidate>
        <div className="space-y-5">
          <Card className="space-y-4">
            <h2 className="font-sans text-lg font-bold">Data pemesan</h2>
            <Input label="Nama" value={form.nama} onChange={set('nama')} error={errors.nama} autoComplete="name" required />
            <Input label="Nomor WhatsApp" type="tel" inputMode="tel" value={form.no_hp} onChange={set('no_hp')} error={errors.no_hp} placeholder="0812xxxxxxxx" autoComplete="tel" required />
          </Card>

          <Card className="space-y-4">
            <h2 className="font-sans text-lg font-bold">Pengambilan</h2>
            <div className="flex flex-col gap-3 sm:flex-row" role="radiogroup" aria-label="Ambil atau antar">
              <button type="button" role="radio" aria-checked={form.fulfillment === 'ambil'} className={opt(form.fulfillment === 'ambil')} onClick={() => setForm({ ...form, fulfillment: 'ambil' })}>
                <Store className="size-6 text-brand-500" />
                <span>
                  <span className="block font-semibold">Ambil di toko</span>
                  <span className="text-xs text-cocoa-500">Tanpa ongkir</span>
                </span>
              </button>
              <button type="button" role="radio" aria-checked={form.fulfillment === 'antar'} className={opt(form.fulfillment === 'antar')} onClick={() => setForm({ ...form, fulfillment: 'antar' })}>
                <Bike className="size-6 text-brand-500" />
                <span>
                  <span className="block font-semibold">Diantar</span>
                  <span className="text-xs text-cocoa-500">{freeShippingMin > 0 ? `Gratis ongkir mulai ${formatRupiah(freeShippingMin)}` : 'Ongkir dikonfirmasi admin'}</span>
                </span>
              </button>
            </div>
            <Input
              label={form.fulfillment === 'antar' ? 'Jadwal pengantaran' : 'Jadwal pengambilan'}
              type="datetime-local"
              value={form.jadwal}
              min={minSchedule}
              onChange={set('jadwal')}
              error={errors.jadwal}
              required
            />
            {form.fulfillment === 'antar' && (
              <>
                {isMember && (addresses.data?.length ?? 0) > 0 && (
                  <Select
                    label="Alamat tersimpan"
                    value={addressId}
                    onChange={(e) => {
                      const a = addresses.data!.find((x) => x.id === e.target.value);
                      setAddressId(e.target.value);
                      if (a) setForm((f) => ({ ...f, alamat: `${a.alamat}${a.catatan ? ` (${a.catatan})` : ''}` }));
                    }}
                  >
                    {addresses.data!.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label} — {a.alamat.slice(0, 50)}
                      </option>
                    ))}
                  </Select>
                )}
                <Textarea label="Alamat pengantaran" value={form.alamat} onChange={set('alamat')} error={errors.alamat} maxLength={500} required />
                <p className="text-xs text-cocoa-500">{c('pesanan.catatan_ongkir')}</p>
              </>
            )}
            <Textarea label="Catatan (opsional)" value={form.catatan} onChange={set('catatan')} maxLength={500} placeholder="Mis. tulisan di kue, tanpa kacang, dll." />
          </Card>
        </div>

        <div className="space-y-4 lg:sticky lg:top-24 lg:h-fit">
          <Card className="space-y-3">
            <h2 className="font-sans text-lg font-bold">Ringkasan</h2>
            <ul className="divide-y divide-cream-200 text-sm">
              {cart.items.map((i) => (
                <li key={i.product_id} className="flex justify-between gap-2 py-2">
                  <span>
                    {i.nama} <span className="text-cocoa-500">× {i.qty}</span>
                  </span>
                  <span className="tabular-nums">{formatRupiah(i.harga * i.qty)}</span>
                </li>
              ))}
            </ul>
            {isMember && availableRewards.length > 0 && (
              <label className="block text-sm">
                <span className="font-semibold">Pakai hadiah stamp</span>
                <select
                  className="mt-1 h-11 w-full rounded-xl border border-cream-300 bg-white px-3 text-sm"
                  value={hadiah}
                  onChange={(e) => {
                    setHadiah(e.target.value);
                    if (e.target.value) {
                      setPromo(null);
                      setPromoInput('');
                    }
                  }}
                >
                  <option value="">Tidak memakai hadiah</option>
                  {availableRewards.map((h) => (
                    <option key={h.kode} value={h.kode}>
                      {h.nama} ({h.kode})
                    </option>
                  ))}
                </select>
                {hadiah && <span className="mt-1 block text-xs text-cocoa-500">Potongan dihitung saat pesanan dibuat & diverifikasi Admin. Tidak bisa digabung promo.</span>}
              </label>
            )}
            <div className={clsx('flex gap-2', hadiah && 'pointer-events-none opacity-50')}>
              <label className="relative flex-1">
                <span className="sr-only">Kode promo</span>
                <Tag className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-cocoa-400" />
                <input
                  value={promoInput}
                  onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
                  placeholder="Kode promo"
                  className="h-11 w-full rounded-xl border border-cream-300 bg-white pr-3 pl-9 text-sm uppercase focus:border-brand-400 focus:ring-4 focus:ring-brand-100 focus:outline-none"
                />
              </label>
              <Button type="button" variant="secondary" loading={checkingPromo} onClick={() => void applyPromo()}>
                Pakai
              </Button>
            </div>
            {promoMsg && <p className="text-sm text-red-600">{promoMsg}</p>}
            {promo && <p className="text-sm text-emerald-700">Promo “{promo.nama}” dipakai.</p>}
            <dl className="space-y-1 border-t border-cream-200 pt-3 text-sm">
              <div className="flex justify-between">
                <dt>Subtotal</dt>
                <dd className="tabular-nums">{formatRupiah(cart.subtotal)}</dd>
              </div>
              {diskon > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <dt>Diskon</dt>
                  <dd className="tabular-nums">−{formatRupiah(diskon)}</dd>
                </div>
              )}
              {form.fulfillment === 'antar' && (
                <div className="flex justify-between">
                  <dt>Ongkir</dt>
                  <dd>{free ? 'Gratis' : 'Dikonfirmasi admin'}</dd>
                </div>
              )}
              <div className="flex justify-between pt-1 text-base font-bold">
                <dt>Total{form.fulfillment === 'antar' && !free ? ' (+ ongkir)' : ''}</dt>
                <dd className="tabular-nums">{formatRupiah(total)}</dd>
              </div>
            </dl>
          </Card>
          {serverError && <Alert tone="red">{serverError}</Alert>}
          <p className="flex items-start gap-2 text-xs text-cocoa-600">
            <MessageCircle className="mt-0.5 size-4 shrink-0 text-emerald-600" />
            Kami mengirim konfirmasi pesanan lewat WhatsApp ke nomor di atas.
          </p>
          <Button type="submit" size="lg" block loading={submitting}>
            Buat pesanan
          </Button>
          <p className="text-center text-xs text-cocoa-500">Harga final dihitung ulang oleh sistem saat pesanan dibuat.</p>
        </div>
      </form>
    </div>
  );
}
