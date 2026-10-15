import { Moon, Plus, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { rbdPattern, type Dystonia, type SleepInput } from '@neurovoice/shared';
import { SleepChart, Stat } from '../components/health';
import { api, errorText, useLoad } from '../lib/api';
import { ago, Button, Card, cx, Empty, ErrorNote, Field, fmtDate, PageHeader, SectionTitle, Sheet, Spinner, Toggle } from '../ui';

const yesterday = (): string => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const REGIONS: Dystonia['region'][] = ['hand', 'foot', 'leg', 'arm', 'neck', 'trunk', 'face'];

/** Accepts a CSV with a header row: date,bedtime,wakeTime,awakenings[,restingHr,remPct,deepPct] */
function parseCsv(text: string): SleepInput[] {
  const [head, ...rows] = text.trim().split(/\r?\n/);
  const cols = (head ?? '').split(',').map((c) => c.trim());
  return rows.map((row) => {
    const cell = Object.fromEntries(row.split(',').map((v, i) => [cols[i], v.trim()]));
    const num = (k: string): number | undefined => (cell[k] ? Number(cell[k]) : undefined);
    return {
      date: cell.date!, bedtime: cell.bedtime!, wakeTime: cell.wakeTime!, awakenings: num('awakenings') ?? 0,
      actedOutDreams: false, vocalised: false, restingHr: num('restingHr'), remPct: num('remPct'), deepPct: num('deepPct'), source: 'import' as const,
    };
  });
}

export default function Sleep() {
  const sleep = useLoad(() => api.sleep(30));
  const dystonia = useLoad(() => api.dystonia(30));
  const file = useRef<HTMLInputElement>(null);
  const [sheet, setSheet] = useState<'night' | 'cramp' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [night, setNight] = useState({ date: yesterday(), bedtime: '22:30', wakeTime: '06:30', awakenings: 1, actedOutDreams: false, vocalised: false, restingHr: '' });
  const [cramp, setCramp] = useState({ region: 'foot' as Dystonia['region'], severity: 2, minutes: '10' });

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await fn();
      setSheet(null);
      sleep.reload();
      dystonia.reload();
    } catch (err) {
      setError(errorText(err));
    }
    setBusy(false);
  }

  if (!sleep.data) return sleep.error ? <ErrorNote>{sleep.error}</ErrorNote> : <Spinner />;
  const entries = sleep.data;
  const week = entries.slice(-7);
  const avg = (xs: number[]): number => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 0);
  const rbd = rbdPattern(entries);

  return (
    <div className="animate-rise">
      <PageHeader title="Sleep" back="/" action={<Button className="!min-h-[2.75rem] !px-4" onClick={() => setSheet('night')}><Plus className="h-5 w-5" />Log</Button>} />
      {error && !sheet && <div className="mb-3"><ErrorNote>{error}</ErrorNote></div>}
      {note && <p className="mb-3 rounded-2xl bg-good-soft px-4 py-3 text-sm font-semibold text-good">{note}</p>}

      {entries.length === 0 ? (
        <Empty icon={<Moon className="h-7 w-7" />} title="No nights logged yet"><p>Log last night in a few taps. It takes under a minute.</p><Button className="mt-4" onClick={() => setSheet('night')}>Log last night</Button></Empty>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Avg score" value={String(Math.round(avg(week.map((e) => e.score))))} hint="last 7 nights" />
            <Stat label="Avg sleep" value={`${avg(week.map((e) => e.hours)).toFixed(1)}h`} hint="last 7 nights" />
            <Stat label="Dream nights" value={String(rbd.nights)} hint="last 14 nights" tone={rbd.flagged ? 'alert' : undefined} />
          </div>
          {rbd.flagged && (
            <Card className="mt-3 bg-alert-soft">
              <p className="font-bold text-alert">Acting out dreams on several nights</p>
              <p className="mt-1 text-sm text-ink-soft">This has come up on {rbd.nights} of the last 14 nights. It can have many causes and is worth raising with your doctor. This is not a diagnosis.</p>
            </Card>
          )}
          <Card className="mt-3">
            <p className="font-bold">Sleep score</p>
            <p className="mb-2 text-sm text-ink-soft">Red bars are nights with dream enactment or very poor sleep.</p>
            <SleepChart entries={entries} />
          </Card>
          <SectionTitle>Recent nights</SectionTitle>
          <div className="space-y-2.5">
            {[...entries].reverse().slice(0, 7).map((e) => (
              <Card key={e.date} className="flex items-center gap-4 !p-4">
                <span className={cx('flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-lg font-extrabold', e.score >= 70 ? 'bg-good-soft text-good' : e.score >= 45 ? 'bg-warn-soft text-warn' : 'bg-alert-soft text-alert')}>{e.score}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{fmtDate(e.date, { weekday: 'long', day: 'numeric', month: 'short' })}</p>
                  <p className="text-sm text-ink-soft">{e.hours.toFixed(1)} h · woke {e.awakenings}×{e.restingHr ? ` · ${e.restingHr} bpm` : ''}{e.source === 'import' ? ' · imported' : ''}</p>
                </div>
                {e.rbdFlag && <span className="rounded-full bg-alert-soft px-2.5 py-1 text-xs font-bold text-alert">Dreams</span>}
              </Card>
            ))}
          </div>
        </>
      )}

      <SectionTitle action={<button type="button" className="text-sm font-bold text-brand-deep" onClick={() => setSheet('cramp')}>Log one</button>}>Cramps and dystonia</SectionTitle>
      {dystonia.data?.length ? (
        <div className="space-y-2.5">
          {[...dystonia.data].reverse().slice(0, 5).map((d) => (
            <Card key={d.id} className="flex items-center justify-between !p-4">
              <div><p className="font-bold capitalize">{d.region}</p><p className="text-sm text-ink-soft">{d.minutes} min · {ago(d.at)}</p></div>
              <span className="flex gap-1">{[1, 2, 3, 4, 5].map((n) => <span key={n} className={cx('h-2.5 w-2.5 rounded-full', n <= d.severity ? 'bg-brand' : 'bg-line')} />)}</span>
            </Card>
          ))}
        </div>
      ) : <p className="text-sm text-ink-soft">Painful cramps or curling toes, often in the early morning. Log them here so the pattern is visible.</p>}

      <SectionTitle>From a wearable</SectionTitle>
      <Card className="!p-4">
        <p className="text-sm text-ink-soft">Export your sleep from your watch app as CSV with the columns <code className="text-xs">date, bedtime, wakeTime, awakenings, restingHr, remPct, deepPct</code> and import it here.</p>
        <input ref={file} type="file" accept=".csv,text/csv" className="hidden" onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          setNote('');
          await run(async () => setNote(`Imported ${(await api.importSleep(parseCsv(await f.text()))).imported} nights.`));
          e.target.value = '';
        }} />
        <Button variant="secondary" className="mt-3" busy={busy && !sheet} onClick={() => file.current?.click()}><Upload className="h-5 w-5" />Import CSV</Button>
      </Card>

      <Sheet open={sheet === 'night'} onClose={() => setSheet(null)} title="Log a night">
        <div className="space-y-4">
          <Field label="Night of"><input type="date" className="w-full" value={night.date} max={yesterday()} onChange={(e) => setNight({ ...night, date: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Went to bed"><input type="time" className="w-full" value={night.bedtime} onChange={(e) => setNight({ ...night, bedtime: e.target.value })} /></Field>
            <Field label="Woke up"><input type="time" className="w-full" value={night.wakeTime} onChange={(e) => setNight({ ...night, wakeTime: e.target.value })} /></Field>
          </div>
          <Field label="Times you woke in the night">
            <div className="flex gap-1.5">
              {[0, 1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" onClick={() => setNight({ ...night, awakenings: n })} className={cx('min-h-[3rem] flex-1 rounded-xl font-bold', night.awakenings === n ? 'bg-navy text-white' : 'bg-white shadow-card')}>{n === 5 ? '5+' : n}</button>
              ))}
            </div>
          </Field>
          <Card className="space-y-4 !p-4">
            <Toggle checked={night.actedOutDreams} onChange={(v) => setNight({ ...night, actedOutDreams: v })} label="Acted out a dream" hint="Kicking, punching, or falling out of bed while asleep. A bed partner may have noticed." />
            <Toggle checked={night.vocalised} onChange={(v) => setNight({ ...night, vocalised: v })} label="Shouted or talked in sleep" />
          </Card>
          <Field label="Resting heart rate (optional)"><input className="w-full" inputMode="numeric" placeholder="bpm" value={night.restingHr} onChange={(e) => setNight({ ...night, restingHr: e.target.value.replace(/\D/g, '').slice(0, 3) })} /></Field>
          {error && <ErrorNote>{error}</ErrorNote>}
          <Button full busy={busy} onClick={() => run(() => api.saveSleep({ ...night, restingHr: night.restingHr ? Number(night.restingHr) : undefined, source: 'manual' }))}>Save night</Button>
        </div>
      </Sheet>

      <Sheet open={sheet === 'cramp'} onClose={() => setSheet(null)} title="Log a cramp">
        <div className="space-y-4">
          <Field label="Where">
            <div className="flex flex-wrap gap-2">
              {REGIONS.map((r) => <button key={r} type="button" onClick={() => setCramp({ ...cramp, region: r })} className={cx('min-h-[2.75rem] rounded-full px-4 font-semibold capitalize', cramp.region === r ? 'bg-navy text-white' : 'bg-white shadow-card')}>{r}</button>)}
            </div>
          </Field>
          <Field label="How bad">
            <div className="flex gap-1.5">
              {[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" onClick={() => setCramp({ ...cramp, severity: n })} className={cx('min-h-[3rem] flex-1 rounded-xl font-bold', cramp.severity === n ? 'bg-navy text-white' : 'bg-white shadow-card')}>{n}</button>)}
            </div>
          </Field>
          <Field label="How long, in minutes"><input className="w-full" inputMode="numeric" value={cramp.minutes} onChange={(e) => setCramp({ ...cramp, minutes: e.target.value.replace(/\D/g, '').slice(0, 3) })} /></Field>
          {error && <ErrorNote>{error}</ErrorNote>}
          <Button full busy={busy} disabled={!(Number(cramp.minutes) > 0)} onClick={() => run(() => api.logDystonia({ region: cramp.region, severity: cramp.severity, minutes: Number(cramp.minutes) }))}>Save</Button>
        </div>
      </Sheet>
    </div>
  );
}
