import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { type Dose, hourLabel, type Insights, type SleepEntry, type Symptom } from '@neurovoice/shared';
import { Card, cx, fmtDate, fmtTime } from '../ui';

const tick = { fontSize: 12, fill: '#8A909C' };

export function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'good' | 'warn' | 'alert' }) {
  return (
    <Card className="!p-4">
      <p className="text-sm font-semibold text-ink-soft">{label}</p>
      <p className={cx('mt-1 text-3xl font-extrabold tracking-tight tabular-nums', tone === 'good' && 'text-good', tone === 'warn' && 'text-warn', tone === 'alert' && 'text-alert')}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-ink-faint">{hint}</p>}
    </Card>
  );
}

export function MedInsights({ data }: { data: Insights }) {
  const peak = data.peakOffWindow;
  const inPeak = (h: number): boolean => !!peak && ((h - peak.fromHour + 24) % 24) < 3;
  const hours = data.offByHour.map((n, h) => ({ h, n }));
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Doses logged" value={data.adherencePct === null ? '–' : `${data.adherencePct}%`} hint={`last ${data.days} days`}
          tone={data.adherencePct === null ? undefined : data.adherencePct >= 85 ? 'good' : data.adherencePct >= 65 ? 'warn' : 'alert'} />
        <Stat label="Off periods" value={String(data.offReports)} hint={`last ${data.days} days`} />
        <Stat label="Kicks in after" value={data.kickInMinutes === null ? '–' : `${data.kickInMinutes} min`} hint="dose to first 'on'" />
        <Stat label="Wears off after" value={data.wearingOffMinutes === null ? '–' : `${Math.floor(data.wearingOffMinutes / 60)}h ${data.wearingOffMinutes % 60}m`} hint="dose to next 'off'" />
      </div>
      <Card>
        <p className="font-bold">When off periods happen</p>
        <p className="mt-0.5 text-sm text-ink-soft">
          {data.peakLabel ? <>Most often between <span className="font-bold text-ink">{data.peakLabel}</span>. Worth showing your doctor.</> : 'No clear pattern yet. Log how you feel through the day to find one.'}
        </p>
        <ResponsiveContainer width="100%" height={150}>
          <BarChart data={hours} margin={{ top: 12, right: 0, bottom: 0, left: -28 }}>
            <CartesianGrid vertical={false} stroke="#EFEAE2" />
            <XAxis dataKey="h" tickFormatter={(h: number) => (h % 6 === 0 ? hourLabel(h) : '')} tick={tick} tickLine={false} axisLine={false} interval={0} />
            <YAxis allowDecimals={false} tick={tick} tickLine={false} axisLine={false} />
            <Tooltip cursor={{ fill: '#F6F2EC' }} formatter={(v: number) => [v, 'off reports']} labelFormatter={(h: number) => hourLabel(h)} />
            <Bar dataKey="n" radius={[4, 4, 0, 0]}>{hours.map(({ h }) => <Cell key={h} fill={inPeak(h) ? '#C4423E' : '#FFD9BF'} />)}</Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}

const STATE_COLOR = { on: '#23876A', off: '#C4423E', dyskinesia: '#B8731A' } as const;

/** A 24-hour strip: doses as pills along the top, on/off reports as coloured segments. */
export function DayTimeline({ doses, symptoms, minutesOf }: { doses: Dose[]; symptoms: Symptom[]; minutesOf: (iso: string) => number }) {
  const pct = (iso: string): number => (minutesOf(iso) / 1440) * 100;
  const sorted = [...symptoms].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return (
    <div>
      <div className="relative h-7">
        {doses.map((d) => (
          <span key={d.id} title={`${d.medicationName} ${fmtTime(d.takenAt)}`} className="absolute top-0 h-6 w-2.5 -translate-x-1/2 rounded-full bg-navy" style={{ left: `${pct(d.takenAt)}%` }} />
        ))}
      </div>
      <div className="relative h-4 overflow-hidden rounded-full bg-black/[.06]">
        {sorted.map((s, i) => {
          const from = pct(s.at);
          const to = sorted[i + 1] ? pct(sorted[i + 1]!.at) : Math.min(100, from + 12.5);
          return <span key={s.id} className="absolute inset-y-0" style={{ left: `${from}%`, width: `${Math.max(1, to - from)}%`, background: STATE_COLOR[s.state] }} />;
        })}
      </div>
      <div className="mt-1.5 flex justify-between text-xs text-ink-faint"><span>12am</span><span>6am</span><span>12pm</span><span>6pm</span><span>12am</span></div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-ink-soft">
        <span className="flex items-center gap-1.5"><span className="h-3 w-1.5 rounded-full bg-navy" />Dose</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-good" />On</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-alert" />Off</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-warn" />Dyskinesia</span>
      </div>
    </div>
  );
}

export function SleepChart({ entries, height = 170 }: { entries: SleepEntry[]; height?: number }) {
  const data = entries.slice(-21);
  if (!data.length) return null;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 0, bottom: 0, left: -24 }}>
        <CartesianGrid vertical={false} stroke="#EFEAE2" />
        <XAxis dataKey="date" tickFormatter={(d: string) => fmtDate(d)} tick={tick} tickLine={false} axisLine={false} minTickGap={28} />
        <YAxis domain={[0, 100]} tick={tick} tickLine={false} axisLine={false} />
        <Tooltip cursor={{ fill: '#F6F2EC' }} formatter={(v: number) => [v, 'sleep score']} labelFormatter={(d: string) => fmtDate(d, { weekday: 'short', day: 'numeric', month: 'short' })} />
        <Bar dataKey="score" radius={[5, 5, 0, 0]}>
          {data.map((e) => <Cell key={e.date} fill={e.rbdFlag ? '#C4423E' : e.score >= 70 ? '#23876A' : e.score >= 45 ? '#D98A1F' : '#C4423E'} fillOpacity={e.rbdFlag ? 1 : 0.8} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
