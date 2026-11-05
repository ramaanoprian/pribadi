/** Status stok bahan berdasarkan min_stock. */
export function ingredientStatus(stok: number, min: number): { label: 'Aman' | 'Menipis' | 'Habis'; tone: 'green' | 'amber' | 'red' } {
  if (stok <= 0) return { label: 'Habis', tone: 'red' };
  if (stok <= min) return { label: 'Menipis', tone: 'amber' };
  return { label: 'Aman', tone: 'green' };
}

const num = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 3 });
export const formatQty = (n: number | null | undefined) => num.format(Number(n ?? 0));

export type ProductionPreview = {
  hasil: number;
  mode_bahan_kurang: 'peringatan' | 'blokir';
  ada_kurang: boolean;
  bahan: { nama: string; satuan: string; dibutuhkan: number; tersedia: number; kurang: number }[];
};
