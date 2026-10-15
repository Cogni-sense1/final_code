import { ArrowLeft, Loader2, X } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { type DeviationStatus, DISCLAIMER, STATUS_COPY } from '@neurovoice/shared';

export const cx = (...parts: (string | false | null | undefined)[]): string => parts.filter(Boolean).join(' ');

// ── Status colours ───────────────────────────────────────────────────────────

export const TONE = {
  building: { text: 'text-calm', bg: 'bg-calm-soft', stroke: '#5B6B8C', dot: 'bg-calm' },
  steady: { text: 'text-good', bg: 'bg-good-soft', stroke: '#23876A', dot: 'bg-good' },
  watch: { text: 'text-warn', bg: 'bg-warn-soft', stroke: '#D98A1F', dot: 'bg-warn' },
  changed: { text: 'text-alert', bg: 'bg-alert-soft', stroke: '#C4423E', dot: 'bg-alert' },
} as const satisfies Record<DeviationStatus, object>;

export function StatusPill({ status, small }: { status: DeviationStatus; small?: boolean }) {
  const t = TONE[status];
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full font-semibold', t.bg, t.text, small ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm')}>
      <span className={cx('h-1.5 w-1.5 rounded-full', t.dot)} />
      {STATUS_COPY[status].label}
    </span>
  );
}

// ── Building blocks ──────────────────────────────────────────────────────────

export function Card({ children, className, onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  // White unless the caller asks for a tint.
  const base = cx('rounded-xl3 p-5 shadow-card', !/(^|\s)bg-/.test(className ?? '') && 'bg-white', className);
  return onClick
    ? <button type="button" onClick={onClick} className={cx(base, 'block w-full text-left transition active:scale-[.99] hover:shadow-lift')}>{children}</button>
    : <div className={base}>{children}</div>;
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dark';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-deep shadow-[0_8px_20px_-8px_rgba(240,128,60,.7)]',
  dark: 'bg-navy text-white hover:bg-navy-deep',
  secondary: 'bg-white text-ink border border-line hover:bg-paper',
  ghost: 'text-ink-soft hover:bg-black/5',
  danger: 'bg-alert-soft text-alert hover:bg-alert/15',
};

export function Button({ variant = 'primary', busy, full, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; busy?: boolean; full?: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      disabled={rest.disabled || busy}
      className={cx(
        'inline-flex min-h-[3rem] items-center justify-center gap-2 rounded-2xl px-5 text-base font-semibold transition active:scale-[.98] disabled:opacity-50 disabled:active:scale-100',
        VARIANTS[variant], full && 'w-full', className,
      )}
    >
      {busy && <Loader2 className="h-5 w-5 animate-spin" />}
      {children}
    </button>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-ink-soft">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-faint">{hint}</span>}
    </label>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex w-full items-start gap-4 rounded-2xl p-1 text-left">
      <span className={cx('mt-0.5 flex h-7 w-12 shrink-0 items-center rounded-full p-0.5 transition', checked ? 'bg-brand' : 'bg-line')}>
        <span className={cx('h-6 w-6 rounded-full bg-white shadow transition', checked && 'translate-x-5')} />
      </span>
      <span>
        <span className="block font-semibold">{label}</span>
        {hint && <span className="mt-0.5 block text-sm text-ink-soft">{hint}</span>}
      </span>
    </button>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="flex gap-1 rounded-2xl bg-black/5 p-1">
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)}
          className={cx('min-h-[2.5rem] flex-1 rounded-xl px-3 text-sm font-semibold transition', value === o.value ? 'bg-white text-ink shadow-card' : 'text-ink-soft')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function PageHeader({ title, subtitle, back, action }: { title: string; subtitle?: string; back?: boolean | string; action?: ReactNode }) {
  const nav = useNavigate();
  return (
    <header className="mb-5 flex items-start gap-3">
      {back && (
        <button type="button" aria-label="Back" onClick={() => (typeof back === 'string' ? nav(back) : nav(-1))}
          className="-ml-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white shadow-card">
          <ArrowLeft className="h-5 w-5" />
        </button>
      )}
      <div className="min-w-0 flex-1 pt-0.5">
        <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-ink-soft">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 mt-7 flex items-center justify-between">
      <h2 className="text-sm font-bold uppercase tracking-wider text-ink-faint">{children}</h2>
      {action}
    </div>
  );
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy-deep/50 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}
        className="max-h-[92dvh] w-full max-w-md animate-rise overflow-y-auto rounded-t-xl3 bg-paper p-6 safe-bottom sm:rounded-xl3">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-extrabold">{title}</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-card"><X className="h-5 w-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-ink-soft">
      <Loader2 className="h-7 w-7 animate-spin text-brand" />
      {label && <p>{label}</p>}
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return <p role="alert" className="rounded-2xl bg-alert-soft px-4 py-3 text-sm font-medium text-alert">{children}</p>;
}

export function Empty({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-xl3 border border-dashed border-line px-6 py-10 text-center">
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-brand-soft text-brand">{icon}</div>
      <p className="font-bold">{title}</p>
      {children && <div className="mt-1 text-sm text-ink-soft">{children}</div>}
    </div>
  );
}

export const Disclaimer = () => <p className="mt-8 text-center text-xs leading-relaxed text-ink-faint">{DISCLAIMER}</p>;

export function DemoBadge() {
  return <span className="rounded-full bg-navy px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-white">Demo data</span>;
}

// ── Small charts ─────────────────────────────────────────────────────────────

/** Progress ring. `value` runs 0 to 1. */
export function Ring({ value, size = 120, stroke = 10, color, children }: { value: number; size?: number; stroke?: number; color: string; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-black/[.07]" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, Math.min(1, value)))} style={{ transition: 'stroke-dashoffset .6s ease' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}

export function Spark({ values, color = '#F0803C', width = 96, height = 32 }: { values: (number | null)[]; color?: string; width?: number; height?: number }) {
  const pts = values.map((v, i) => [i, v] as const).filter((p): p is readonly [number, number] => p[1] !== null);
  if (pts.length < 2) return <div style={{ width, height }} className="flex items-center text-xs text-ink-faint">Not enough data</div>;
  const lo = Math.min(-0.5, ...pts.map((p) => p[1]));
  const hi = Math.max(2.5, ...pts.map((p) => p[1]));
  const x = (i: number): number => (i / Math.max(values.length - 1, 1)) * (width - 4) + 2;
  const y = (v: number): number => height - 3 - ((v - lo) / (hi - lo)) * (height - 6);
  const last = pts[pts.length - 1]!;
  return (
    <svg width={width} height={height} aria-hidden>
      <line x1={0} x2={width} y1={y(0)} y2={y(0)} stroke="#E9E3DA" strokeDasharray="3 3" />
      <polyline fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" points={pts.map((p) => `${x(p[0])},${y(p[1])}`).join(' ')} />
      <circle cx={x(last[0])} cy={y(last[1])} r={3} fill={color} />
    </svg>
  );
}

// ── Formatting ───────────────────────────────────────────────────────────────

export const fmtDate = (iso: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }): string =>
  new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString(undefined, opts);

export const fmtTime = (iso: string): string => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

export function ago(iso: string): string {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)} h ago`;
  const days = Math.round(mins / 1440);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

export const time12 = (hhmm: string): string => {
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h! + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h! < 12 ? 'am' : 'pm'}`;
};
