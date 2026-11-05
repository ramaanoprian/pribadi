const dateTime = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const dateOnly = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
const rupiah = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });

export const formatDateTime = (v: string | Date | null | undefined) => (v ? dateTime.format(new Date(v)) : '-');
export const formatDate = (v: string | Date | null | undefined) => (v ? dateOnly.format(new Date(v)) : '-');
export const formatRupiah = (v: number | null | undefined) => rupiah.format(v ?? 0);
