import { Check, Pill, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { MotorState } from '@neurovoice/shared';
import { DayTimeline, MedInsights } from '../components/health';
import { api, errorText, useLoad, useProfile } from '../lib/api';
import { Button, Card, cx, Empty, ErrorNote, Field, PageHeader, SectionTitle, Segmented, Sheet, Spinner, time12, Toggle } from '../ui';

const STATES: { value: MotorState; label: string; hint: string; cls: string }[] = [
  { value: 'on', label: 'On', hint: 'Moving well', cls: 'bg-good-soft text-good' },
  { value: 'off', label: 'Off', hint: 'Stiff or slow', cls: 'bg-alert-soft text-alert' },
  { value: 'dyskinesia', label: 'Dyskinesia', hint: 'Extra movement', cls: 'bg-warn-soft text-warn' },
];

function Scale({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <p className="mb-2 font-semibold">{label}</p>
      <div className="flex gap-1.5">
        {['None', 'Slight', 'Mild', 'Moderate', 'Severe'].map((name, i) => (
          <button key={name} type="button" onClick={() => onChange(i)}
            className={cx('min-h-[3rem] flex-1 rounded-xl text-xs font-bold transition', value === i ? 'bg-navy text-white' : 'bg-white text-ink-soft shadow-card')}>
            {name}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Meds() {
  const profile = useProfile();
  const [tab, setTab] = useState<'today' | 'insights' | 'list'>('today');
  const day = useLoad(() => api.medicationDay());
  const meds = useLoad(() => api.medications());
  const insights = useLoad(() => api.insights(14), [tab === 'insights']);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [feeling, setFeeling] = useState<MotorState | null>(null);
  const [ratings, setRatings] = useState({ tremor: 1, stiffness: 1, slowness: 1 });
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', dose: '', unit: 'mg' as const, times: ['08:00'], levodopa: false });

  const active = (meds.data ?? []).filter((m) => m.active);
  const minutesOf = (iso: string): number => {
    const p = new Intl.DateTimeFormat('en-GB', { timeZone: profile.timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso));
    return Number(p.find((x) => x.type === 'hour')!.value) * 60 + Number(p.find((x) => x.type === 'minute')!.value);
  };

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setError('');
    try {
      await fn();
      day.reload();
      meds.reload();
    } catch (err) {
      setError(errorText(err));
    }
    setBusy('');
  }

  const saveMed = () => run('save', async () => {
    await api.saveMedication({ name: form.name.trim(), dose: Number(form.dose), unit: form.unit, times: form.times, levodopa: form.levodopa });
    setAdding(false);
    setForm({ name: '', dose: '', unit: 'mg', times: ['08:00'], levodopa: false });
  });

  return (
    <div className="animate-rise">
      <PageHeader title="Medication" action={<Button variant="secondary" className="!min-h-[2.75rem] !px-3.5" onClick={() => setAdding(true)}><Plus className="h-5 w-5" /></Button>} />
      <Segmented value={tab} onChange={setTab} options={[{ value: 'today', label: 'Today' }, { value: 'insights', label: 'Patterns' }, { value: 'list', label: 'Medicines' }]} />
      {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}

      {tab === 'today' && (!day.data ? <Spinner /> : (
        <>
          <SectionTitle>How are you right now?</SectionTitle>
          <div className="grid grid-cols-3 gap-2.5">
            {STATES.map((s) => (
              <button key={s.value} type="button" onClick={() => setFeeling(s.value)} className={cx('min-w-0 rounded-2xl px-3 py-3.5 text-left transition active:scale-[.98]', s.cls)}>
                <span className="block truncate text-base font-extrabold">{s.label}</span><span className="block truncate text-xs font-semibold opacity-80">{s.hint}</span>
              </button>
            ))}
          </div>

          <SectionTitle>Today's doses</SectionTitle>
          {day.data.schedule.length === 0 ? (
            <Empty icon={<Pill className="h-7 w-7" />} title="No medicines yet"><p>Add what you take and when, and your day's schedule appears here.</p><Button className="mt-4" onClick={() => setAdding(true)}>Add a medicine</Button></Empty>
          ) : (
            <div className="space-y-2.5">
              {day.data.schedule.map((s) => (
                <Card key={s.medicationId + s.time} className="flex items-center gap-3 !p-4">
                  <span className="w-[4.5rem] shrink-0 text-lg font-extrabold tabular-nums">{time12(s.time).replace(' ', '')}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{s.name}</p>
                    <p className={cx('text-sm font-semibold', s.status === 'taken' ? 'text-good' : s.status === 'missed' ? 'text-alert' : s.status === 'due' ? 'text-warn' : 'text-ink-faint')}>
                      {s.dose} {s.unit} · {s.status === 'taken' ? 'Taken' : s.status === 'missed' ? 'Not logged' : s.status === 'due' ? 'Due now' : 'Later'}
                    </p>
                  </div>
                  {s.status === 'taken'
                    ? <span className="flex h-11 w-11 items-center justify-center rounded-full bg-good-soft text-good"><Check className="h-5 w-5" strokeWidth={3} /></span>
                    : <Button variant={s.status === 'upcoming' ? 'secondary' : 'primary'} className="!min-h-[2.75rem] !px-4" busy={busy === s.medicationId + s.time}
                        onClick={() => run(s.medicationId + s.time, () => api.logDose(s.medicationId, s.time))}>Taken</Button>}
                </Card>
              ))}
            </div>
          )}

          {(day.data.doses.length > 0 || day.data.symptoms.length > 0) && (
            <>
              <SectionTitle>Your day so far</SectionTitle>
              <Card><DayTimeline doses={day.data.doses} symptoms={day.data.symptoms} minutesOf={minutesOf} /></Card>
            </>
          )}
        </>
      ))}

      {tab === 'insights' && <div className="mt-5">{insights.data ? <MedInsights data={insights.data} /> : <Spinner />}</div>}

      {tab === 'list' && (
        <div className="mt-5 space-y-2.5">
          {active.length === 0 && <Empty icon={<Pill className="h-7 w-7" />} title="No medicines yet"><Button className="mt-3" onClick={() => setAdding(true)}>Add a medicine</Button></Empty>}
          {active.map((m) => (
            <Card key={m.id} className="flex items-center gap-3 !p-4">
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{m.name} <span className="font-medium text-ink-soft">{m.dose} {m.unit}</span></p>
                <p className="text-sm text-ink-soft">{m.times.map(time12).join(' · ')}{m.levodopa ? ' · levodopa' : ''}</p>
              </div>
              <Button variant="ghost" aria-label={`Stop ${m.name}`} className="!px-3" busy={busy === m.id} onClick={() => run(m.id, () => api.stopMedication(m.id))}><Trash2 className="h-5 w-5" /></Button>
            </Card>
          ))}
          <p className="pt-2 text-xs leading-relaxed text-ink-faint">This is a log of what your doctor prescribed. NeuroVoice never suggests changing a medicine or dose.</p>
        </div>
      )}

      <Sheet open={!!feeling} onClose={() => setFeeling(null)} title={`Feeling ${STATES.find((s) => s.value === feeling)?.label.toLowerCase() ?? ''}`}>
        <div className="space-y-5">
          <Scale label="Tremor" value={ratings.tremor} onChange={(v) => setRatings({ ...ratings, tremor: v })} />
          <Scale label="Stiffness" value={ratings.stiffness} onChange={(v) => setRatings({ ...ratings, stiffness: v })} />
          <Scale label="Slowness" value={ratings.slowness} onChange={(v) => setRatings({ ...ratings, slowness: v })} />
          <Button full busy={busy === 'feel'} onClick={() => run('feel', async () => { await api.logSymptom({ state: feeling!, ...ratings }); setFeeling(null); })}>Save</Button>
        </div>
      </Sheet>

      <Sheet open={adding} onClose={() => setAdding(false)} title="Add a medicine">
        <div className="space-y-4">
          <Field label="Name"><input className="w-full" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Levodopa/Carbidopa" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Dose"><input className="w-full" inputMode="decimal" value={form.dose} onChange={(e) => setForm({ ...form, dose: e.target.value.replace(/[^\d.]/g, '') })} /></Field>
            <Field label="Unit">
              <select className="w-full" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value as typeof form.unit })}>
                {['mg', 'mcg', 'ml', 'tablet'].map((u) => <option key={u}>{u}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Times each day">
            <div className="space-y-2">
              {form.times.map((t, i) => (
                <div key={i} className="flex gap-2">
                  <input type="time" className="flex-1" value={t} onChange={(e) => setForm({ ...form, times: form.times.map((x, j) => (j === i ? e.target.value : x)) })} />
                  {form.times.length > 1 && <Button variant="ghost" className="!px-3" aria-label="Remove time" onClick={() => setForm({ ...form, times: form.times.filter((_, j) => j !== i) })}><Trash2 className="h-5 w-5" /></Button>}
                </div>
              ))}
              <Button variant="secondary" className="!min-h-[2.5rem]" onClick={() => setForm({ ...form, times: [...form.times, '12:00'] })}><Plus className="h-4 w-4" />Add a time</Button>
            </div>
          </Field>
          <Toggle checked={form.levodopa} onChange={(v) => setForm({ ...form, levodopa: v })} label="This is a levodopa medicine" hint="Used to work out how long each dose lasts for you." />
          <Button full busy={busy === 'save'} disabled={!form.name.trim() || !(Number(form.dose) > 0) || form.times.some((t) => !t)} onClick={saveMed}>Save medicine</Button>
        </div>
      </Sheet>
    </div>
  );
}
