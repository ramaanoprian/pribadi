import { useState } from 'react';
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { formatRupiah } from '@/lib/format';

/** Warna seri (tervalidasi buta warna & kontras terhadap latar putih). */
export const SERIES = { a: '#f25a0e', b: '#3a7fc1' } as const;

const juta = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 });
export function shortRupiah(v: number): string {
  const a = Math.abs(v);
  const sign = v < 0 ? '−' : '';
  if (a >= 1_000_000_000) return `${sign}${juta.format(a / 1_000_000_000)} M`;
  if (a >= 1_000_000) return `${sign}${juta.format(a / 1_000_000)} jt`;
  if (a >= 1_000) return `${sign}${juta.format(a / 1_000)} rb`;
  return `${sign}${a}`;
}

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

type GroupedDatum = { label: string; a: number; b: number; extra?: string };

/** Kolom berkelompok 2 seri (mis. pendapatan vs total biaya) dengan tooltip. */
export function GroupedBarChart({ data, labels, height = 220 }: { data: GroupedDatum[]; labels: { a: string; b: string }; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = height;
  const pad = { l: 52, r: 8, t: 12, b: 28 };
  const max = niceMax(Math.max(1, ...data.flatMap((d) => [d.a, d.b])));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const group = innerW / Math.max(1, data.length);
  const barW = Math.min(28, (group - 18) / 2);
  const y = (v: number) => pad.t + innerH - (Math.max(0, v) / max) * innerH;
  const bar = (x: number, v: number, color: string) => {
    const top = y(v);
    const h = pad.t + innerH - top;
    if (h <= 0) return null;
    const r = Math.min(4, h, barW / 2);
    // Ujung data membulat 4px, menempel pada garis dasar.
    return <path d={`M${x},${top + h} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${top + h} Z`} fill={color} />;
  };
  const h = hover !== null ? data[hover] : null;
  return (
    <div className="relative">
      <div className="mb-2 flex flex-wrap gap-4 text-xs text-cocoa-700" aria-hidden>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: SERIES.a }} /> {labels.a}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: SERIES.b }} /> {labels.b}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Grafik ${labels.a} dan ${labels.b}`} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="#eedcc3" strokeWidth={1} strokeDasharray={t === 0 ? undefined : '3 4'} />
            <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" fontSize={11} fill="#9a7258">
              {shortRupiah(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const gx = pad.l + i * group + (group - (barW * 2 + 2)) / 2;
          return (
            <g key={d.label}>
              {hover === i && <rect x={pad.l + i * group + 2} y={pad.t} width={group - 4} height={innerH} fill="#fff3ea" rx={6} />}
              {bar(gx, d.a, SERIES.a)}
              {bar(gx + barW + 2, d.b, SERIES.b)}
              <text x={pad.l + i * group + group / 2} y={H - 8} textAnchor="middle" fontSize={11} fill="#7d5640">
                {d.label}
              </text>
              {/* Area sentuh lebih besar dari batang */}
              <rect x={pad.l + i * group} y={pad.t} width={group} height={innerH + 20} fill="transparent" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onClick={() => setHover(i)} tabIndex={0} aria-label={`${d.label}: ${labels.a} ${formatRupiah(d.a)}, ${labels.b} ${formatRupiah(d.b)}`} />
            </g>
          );
        })}
      </svg>
      {h && (
        <div className="pointer-events-none absolute top-6 right-2 rounded-xl bg-cocoa-900 px-3 py-2 text-xs text-white shadow-lg">
          <p className="font-semibold">{h.label}</p>
          <p className="flex items-center gap-1.5">
            <span className="size-2 rounded-sm" style={{ background: SERIES.a }} /> {labels.a}: {formatRupiah(h.a)}
          </p>
          <p className="flex items-center gap-1.5">
            <span className="size-2 rounded-sm" style={{ background: SERIES.b }} /> {labels.b}: {formatRupiah(h.b)}
          </p>
          {h.extra && <p className="mt-1 border-t border-white/20 pt-1">{h.extra}</p>}
        </div>
      )}
    </div>
  );
}

/** Batang horizontal satu seri, diurutkan, dengan label & nilai langsung. */
export function HBarList({ data }: { data: { label: string; value: number }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <ul className="space-y-2.5">
      {data.map((d) => (
        <li key={d.label} className="text-sm" title={`${d.label}: ${formatRupiah(d.value)}`}>
          <div className="flex justify-between gap-3">
            <span className="text-cocoa-800">{d.label}</span>
            <span className="tabular-nums text-cocoa-700">
              {formatRupiah(d.value)} <span className="text-xs text-cocoa-500">({total ? Math.round((d.value / total) * 100) : 0}%)</span>
            </span>
          </div>
          <div className="mt-1 h-2.5 rounded-full bg-cream-200">
            <div className="h-full rounded-full" style={{ width: `${(d.value / max) * 100}%`, background: SERIES.a }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Status anggaran: hijau < 80%, kuning 80–100%, merah > 100% (dengan ikon + label). */
export function budgetStatus(realisasi: number, anggaran: number) {
  const pct = anggaran > 0 ? (realisasi / anggaran) * 100 : realisasi > 0 ? 999 : 0;
  if (pct > 100) return { pct, label: 'Melebihi', color: '#dc2626', text: 'text-red-700', Icon: XCircle };
  if (pct >= 80) return { pct, label: 'Hampir habis', color: '#d97706', text: 'text-amber-700', Icon: AlertTriangle };
  return { pct, label: 'Aman', color: '#059669', text: 'text-emerald-700', Icon: CheckCircle2 };
}

export function BudgetBars({ data }: { data: { kategori: string; anggaran: number; realisasi: number }[] }) {
  return (
    <ul className="space-y-3">
      {data.map((d) => {
        const s = budgetStatus(d.realisasi, d.anggaran);
        return (
          <li key={d.kategori} className="text-sm">
            <div className="flex items-center justify-between gap-3">
              <span>{d.kategori}</span>
              <span className={`flex items-center gap-1 text-xs font-semibold ${s.text}`}>
                <s.Icon className="size-3.5" aria-hidden /> {s.label} · {Math.round(s.pct)}%
              </span>
            </div>
            <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-cream-200">
              <div className="h-full rounded-full" style={{ width: `${Math.min(100, s.pct)}%`, background: s.color }} />
            </div>
            <p className="mt-0.5 text-xs text-cocoa-500 tabular-nums">
              {formatRupiah(d.realisasi)} dari {formatRupiah(d.anggaran)}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
