import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

/** Kotak pencarian dengan jeda (debounce) agar tidak membebani server. */
export function SearchInput({ value, onChange, placeholder = 'Cari…', delay = 350 }: { value: string; onChange: (v: string) => void; placeholder?: string; delay?: number }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  useEffect(() => {
    if (text === value) return;
    const t = setTimeout(() => onChange(text), delay);
    return () => clearTimeout(t);
  }, [text, value, onChange, delay]);
  return (
    <label className="relative block w-full sm:max-w-xs">
      <span className="sr-only">{placeholder}</span>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-cocoa-400" aria-hidden />
      <input
        type="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        className="h-11 w-full rounded-xl border border-cream-300 bg-white pr-3 pl-9 text-sm focus:border-brand-400 focus:ring-4 focus:ring-brand-100 focus:outline-none"
      />
    </label>
  );
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex items-center justify-between gap-3 pt-4 text-sm text-cocoa-600">
      <span>
        {from}–{to} dari {total}
      </span>
      <div className="flex items-center gap-1">
        <button
          className="rounded-lg p-2 hover:bg-cream-200 disabled:opacity-40"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          aria-label="Halaman sebelumnya"
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="px-2 tabular-nums">
          {page} / {pages}
        </span>
        <button
          className="rounded-lg p-2 hover:bg-cream-200 disabled:opacity-40"
          onClick={() => onPage(page + 1)}
          disabled={page >= pages}
          aria-label="Halaman berikutnya"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  );
}

export type Column<T> = { key: string; header: string; cell: (row: T) => ReactNode; className?: string };

/** Tabel responsif: tabel di layar lebar, kartu bertumpuk di HP. */
export function DataTable<T>({ rows, columns, rowKey, onRowClick }: { rows: T[]; columns: Column<T>[]; rowKey: (row: T) => string; onRowClick?: (row: T) => void }) {
  return (
    <>
      <div className="hidden overflow-x-auto rounded-2xl bg-white ring-1 ring-cream-200 md:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-cream-50 text-xs tracking-wide text-cocoa-600 uppercase">
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={`px-4 py-3 font-semibold ${c.className ?? ''}`}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-cream-200">
            {rows.map((row) => (
              <tr key={rowKey(row)} onClick={onRowClick ? () => onRowClick(row) : undefined} className={onRowClick ? 'cursor-pointer hover:bg-cream-50' : undefined}>
                {columns.map((c) => (
                  <td key={c.key} className={`px-4 py-3 align-top ${c.className ?? ''}`}>
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="space-y-3 md:hidden">
        {rows.map((row) => (
          <li key={rowKey(row)} onClick={onRowClick ? () => onRowClick(row) : undefined} className="rounded-2xl bg-white p-4 ring-1 ring-cream-200">
            <dl className="space-y-1.5 text-sm">
              {columns.map((c) => (
                <div key={c.key} className="flex justify-between gap-3">
                  <dt className="shrink-0 text-cocoa-500">{c.header}</dt>
                  <dd className="text-right">{c.cell(row)}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}
