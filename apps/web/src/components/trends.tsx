import { Area, CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  type Assessment, type AssessmentType, type Baseline, baselineKey, BASELINE_MIN, CHANGED_AT, type DailyProfile, type DeviationStatus,
  MODALITIES, statusFor, trackedFeatures, WATCH_AT,
} from '@neurovoice/shared';
import { Card, cx, fmtDate, Spark, StatusPill, TONE } from '../ui';

export const CHECK_PATH: Record<AssessmentType, string> = {
  voice: '/check/voice', face: '/check/face', tap: '/check/tap', spiral: '/check/draw/spiral', wave: '/check/draw/wave',
  clock: '/check/draw/clock', gait: '/check/gait', lsvt: '/check/big',
};

export const keyLabel = (key: string): string => {
  const [type, task] = key.split(':') as [AssessmentType, string | undefined];
  const name = MODALITIES[type]?.name ?? type;
  return task ? `${name} · ${MODALITIES[type]?.tasks?.find((t) => t.id === task)?.name ?? task}` : name;
};

const tick = { fontSize: 12, fill: '#8A909C' };

/** The composite index over time with the watch and changed bands marked. */
export function CompositeChart({ days, height = 220 }: { days: DailyProfile[]; height?: number }) {
  const data = days.map((d) => ({ date: d.date, index: d.composite }));
  const scored = data.filter((d) => d.index !== null);
  if (scored.length < 2) {
    return <div className="flex items-center justify-center rounded-2xl bg-paper text-center text-sm text-ink-soft" style={{ height }}>The trend appears once a baseline is built<br />({BASELINE_MIN} sessions of a check).</div>;
  }
  const top = Math.max(3, ...scored.map((d) => d.index as number)) + 0.3;
  const bottom = Math.min(-1, ...scored.map((d) => d.index as number)) - 0.3;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
        <defs>
          <linearGradient id="nvFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#F0803C" stopOpacity={0.28} /><stop offset="100%" stopColor="#F0803C" stopOpacity={0} /></linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="#EFEAE2" />
        <ReferenceArea y1={WATCH_AT} y2={CHANGED_AT} fill="#FCF1DC" fillOpacity={0.7} />
        <ReferenceArea y1={CHANGED_AT} y2={top} fill="#FBE6E4" fillOpacity={0.7} />
        <ReferenceLine y={0} stroke="#23876A" strokeDasharray="4 4" label={{ value: 'your baseline', position: 'insideBottomLeft', fontSize: 11, fill: '#23876A' }} />
        <XAxis dataKey="date" tickFormatter={(d: string) => fmtDate(d)} tick={tick} tickLine={false} axisLine={false} minTickGap={32} />
        <YAxis domain={[bottom, top]} tick={tick} tickLine={false} axisLine={false} tickFormatter={(v: number) => v.toFixed(0)} />
        <Tooltip
          cursor={{ stroke: '#1F2A44', strokeDasharray: '3 3' }}
          content={({ active, payload }) => {
            const p = payload?.[0]?.payload as { date: string; index: number | null } | undefined;
            if (!active || !p || p.index === null) return null;
            return (
              <div className="rounded-xl bg-navy px-3 py-2 text-sm text-white shadow-lift">
                <p className="font-bold">{fmtDate(p.date, { weekday: 'short', day: 'numeric', month: 'short' })}</p>
                <p>{p.index >= 0 ? '+' : ''}{p.index.toFixed(2)} from baseline</p>
              </div>
            );
          }}
        />
        <Area type="monotone" dataKey="index" stroke="none" fill="url(#nvFill)" connectNulls />
        <Line type="monotone" dataKey="index" stroke="#F0803C" strokeWidth={3} dot={{ r: 3, fill: '#F0803C', strokeWidth: 0 }} activeDot={{ r: 6 }} connectNulls />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** One card per check with its own trend. */
export function ModalityGrid({ days, latest, baselines, onOpen, columns }: {
  days: DailyProfile[]; latest: Record<string, Assessment>; baselines: Baseline[]; onOpen?: (key: string) => void; columns?: boolean;
}) {
  const keys = [...new Set([...Object.keys(latest), ...days.flatMap((d) => Object.keys(d.modalities))])].sort();
  if (!keys.length) return null;
  return (
    <div className={cx('grid gap-3', columns && 'sm:grid-cols-2 lg:grid-cols-3')}>
      {keys.map((key) => {
        const series = days.slice(-21).map((d) => d.modalities[key]?.index ?? null);
        const recent = series.filter((v): v is number => v !== null).slice(-3);
        const status: DeviationStatus = recent.length ? statusFor(recent.reduce((s, v) => s + v, 0) / recent.length) : 'building';
        const sessions = baselines.find((b) => b.key === key)?.sessions ?? 0;
        return (
          <Card key={key} className="!p-4" onClick={onOpen ? () => onOpen(key) : undefined}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-bold">{keyLabel(key)}</p>
                <div className="mt-1.5">
                  {status === 'building'
                    ? <span className="text-sm text-ink-soft">Baseline: {Math.min(sessions, BASELINE_MIN)} of {BASELINE_MIN} sessions</span>
                    : <StatusPill status={status} small />}
                </div>
              </div>
              <Spark values={series} color={TONE[status].stroke} />
            </div>
          </Card>
        );
      })}
    </div>
  );
}

/** How each tracked measure of one check has moved, session by session. */
export function FeatureHistory({ type, task, assessments, baseline }: { type: AssessmentType; task?: string; assessments: Assessment[]; baseline?: Baseline }) {
  const key = baselineKey(type, task);
  const rows = assessments.filter((a) => baselineKey(a.type, a.task) === key && a.quality.usable).reverse();
  if (rows.length < 2) return <p className="text-sm text-ink-soft">At least two sessions are needed to draw this.</p>;
  return (
    <div className="space-y-5">
      {trackedFeatures(type, task).map((f) => {
        const data = rows.map((a) => ({ at: a.takenAt, v: a.features[f.key] ?? null }));
        if (data.filter((d) => d.v !== null).length < 2) return null;
        const base = baseline?.stats[f.key];
        return (
          <div key={f.key}>
            <div className="flex items-baseline justify-between">
              <p className="font-semibold">{f.label}</p>
              <p className="text-xs text-ink-faint">{f.worse === 'up' ? 'lower is better' : 'higher is better'}{f.unit ? ` · ${f.unit}` : ''}</p>
            </div>
            <ResponsiveContainer width="100%" height={110}>
              <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                <CartesianGrid vertical={false} stroke="#EFEAE2" />
                {base && <ReferenceArea y1={base.median - base.mad} y2={base.median + base.mad} fill="#E3F5EE" fillOpacity={0.8} />}
                {base && <ReferenceLine y={base.median} stroke="#23876A" strokeDasharray="4 4" />}
                <XAxis dataKey="at" tickFormatter={(d: string) => fmtDate(d)} tick={tick} tickLine={false} axisLine={false} minTickGap={40} />
                <YAxis tick={tick} tickLine={false} axisLine={false} domain={['auto', 'auto']} width={52} />
                <Tooltip formatter={(v: number) => [v.toFixed(f.dp ?? 2), f.label]} labelFormatter={(d: string) => fmtDate(d)} />
                <Line type="monotone" dataKey="v" stroke="#1F2A44" strokeWidth={2.5} dot={{ r: 2.5, fill: '#1F2A44', strokeWidth: 0 }} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        );
      })}
      <p className="text-xs text-ink-faint">The green band is the usual range from the baseline sessions.</p>
    </div>
  );
}
