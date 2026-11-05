import { supabase } from './supabase';

export type ExportColumn<T> = {
  header: string;
  value: (row: T) => string | number | null | undefined;
  type?: 'teks' | 'angka' | 'rupiah' | 'persen';
  width?: number;
};

export type ExportSpec<T> = {
  /** Judul dokumen, mis. "Laporan Laba Rugi" */
  judul: string;
  /** Baris keterangan, mis. periode */
  subjudul?: string;
  kolom: ExportColumn<T>[];
  baris: T[];
  namaFile: string;
  /** Entitas untuk log aktivitas (huruf kecil & garis bawah) */
  entitas: string;
  /** Baris ringkasan tambahan di bawah tabel (label, nilai) */
  ringkasan?: [string, string | number][];
};

const rupiah = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
const angka = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 });

function display<T>(c: ExportColumn<T>, row: T): string {
  const v = c.value(row);
  if (v === null || v === undefined || v === '') return '-';
  if (typeof v === 'number') {
    if (c.type === 'rupiah') return rupiah.format(v);
    if (c.type === 'persen') return `${angka.format(v)}%`;
    return angka.format(v);
  }
  return String(v);
}

async function logExport(entitas: string, format: string, jumlah: number) {
  // Gagal mencatat tidak membatalkan ekspor, tetapi dicatat di konsol.
  const { error } = await supabase.rpc('log_activity', { p_aksi: 'ekspor_data', p_entitas: entitas, p_meta: { format, baris: jumlah } });
  if (error) console.warn('Gagal mencatat ekspor:', error.message);
}

export async function exportExcel<T>(spec: ExportSpec<T>): Promise<void> {
  const { default: writeExcelFile } = await import('write-excel-file/browser');
  type Cell = { value: string | number | null; fontWeight?: 'bold'; type?: typeof Number | typeof String; format?: string } | null;
  const rows: Cell[][] = [
    [{ value: spec.judul, fontWeight: 'bold' }],
    ...(spec.subjudul ? [[{ value: spec.subjudul }] as Cell[]] : []),
    [],
    spec.kolom.map((c) => ({ value: c.header, fontWeight: 'bold' as const })),
    ...spec.baris.map((r) =>
      spec.kolom.map((c): Cell => {
        const v = c.value(r);
        if (typeof v === 'number') {
          return { value: v, type: Number, format: c.type === 'rupiah' ? '#,##0' : c.type === 'persen' ? '0.0"%"' : '#,##0.##' };
        }
        return { value: v == null ? '' : String(v), type: String };
      }),
    ),
    ...(spec.ringkasan?.length
      ? [[], ...spec.ringkasan.map(([k, v]) => [{ value: k, fontWeight: 'bold' as const }, typeof v === 'number' ? { value: v, type: Number, format: '#,##0' } : { value: v }] as Cell[])]
      : []),
  ];
  await writeExcelFile(rows as never, { columns: spec.kolom.map((c) => ({ width: c.width ?? 18 })) } as never).toFile(`${spec.namaFile}.xlsx`);
  await logExport(spec.entitas, 'xlsx', spec.baris.length);
}

export async function exportPdf<T>(spec: ExportSpec<T>): Promise<void> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: spec.kolom.length > 5 ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(spec.judul, 40, 48);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  if (spec.subjudul) doc.text(spec.subjudul, 40, 66);
  autoTable(doc, {
    startY: 82,
    head: [spec.kolom.map((c) => c.header)],
    body: spec.baris.map((r) => spec.kolom.map((c) => display(c, r))),
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: [74, 47, 33], textColor: 255 },
    columnStyles: Object.fromEntries(spec.kolom.map((c, i) => [i, { halign: c.type && c.type !== 'teks' ? 'right' : 'left' }])),
    // Judul kolom angka ikut rata kanan.
    didParseCell: (data) => {
      const c = spec.kolom[data.column.index];
      if (data.section === 'head' && c?.type && c.type !== 'teks') data.cell.styles.halign = 'right';
    },
  });
  if (spec.ringkasan?.length) {
    autoTable(doc, {
      body: spec.ringkasan.map(([k, v]) => [k, typeof v === 'number' ? rupiah.format(v) : v]),
      styles: { fontSize: 10, fontStyle: 'bold' },
      columnStyles: { 1: { halign: 'right' } },
      theme: 'plain',
    });
  }
  doc.setFontSize(8);
  doc.text(`Dibuat ${new Date().toLocaleString('id-ID')} — GutVibes Bakehouse`, 40, doc.internal.pageSize.getHeight() - 20);
  doc.save(`${spec.namaFile}.pdf`);
  await logExport(spec.entitas, 'pdf', spec.baris.length);
}
