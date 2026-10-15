import { FileText, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { type Assessment, type AssessmentType, CANVAS, DISCLAIMER, MODALITIES, VOICE_FEATURE_LABELS, VOICE_MODEL, VOICE_MODEL_SETTLED } from '@neurovoice/shared';
import { MedInsights, SleepChart } from '../components/health';
import { CompositeChart, FeatureHistory, keyLabel, ModalityGrid } from '../components/trends';
import { api, errorText, useLoad } from '../lib/api';
import { ago, Button, Card, cx, ErrorNote, fmtDate, PageHeader, Sheet, Spinner, StatusPill } from '../ui';

const Panel = ({ title, hint, children, className }: { title: string; hint?: string; children: React.ReactNode; className?: string }) => (
  <Card className={className}>
    <div className="mb-4"><h2 className="text-lg font-extrabold">{title}</h2>{hint && <p className="text-sm text-ink-soft">{hint}</p>}</div>
    {children}
  </Card>
);

/** Redraws a saved drawing so a clinician can judge layout, which is not scored automatically. */
function Drawing({ a }: { a: Assessment }) {
  return (
    <div>
      <svg viewBox={`0 0 ${CANVAS} ${CANVAS}`} className="aspect-square w-full rounded-2xl bg-paper">
        {a.strokes?.map((s, i) => <polyline key={i} points={s.map(([x, y]) => `${x},${y}`).join(' ')} fill="none" stroke="#1F2A44" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />)}
      </svg>
      <p className="mt-1.5 text-center text-xs text-ink-faint">{MODALITIES[a.type].short} · {fmtDate(a.takenAt)}</p>
    </div>
  );
}

export default function PatientDetail() {
  const { id = '' } = useParams();
  const p = api.patient(id);
  const overview = useLoad(() => p.overview(), [id]);
  const history = useLoad(() => p.assessments(undefined, 300), [id]);
  const insights = useLoad(() => p.insights(14), [id]);
  const sleep = useLoad(() => p.sleep(30), [id]);
  const reports = useLoad(() => p.reports(), [id]);
  const notes = useLoad(() => p.doctorNotes(), [id]);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (overview.error) return <><PageHeader title="Not available" back="/" /><ErrorNote>This person is not linked to your account, or has removed your access.</ErrorNote></>;
  if (!overview.data) return <Spinner />;
  const o = overview.data;
  const latestDay = [...o.days].reverse().find((d) => d.composite !== null);
  const drawings = (history.data ?? []).filter((a) => a.strokes?.length).slice(0, 3);
  const [type, task] = (open ?? '').split(':') as [AssessmentType, string | undefined];
  const checkins = o.days.filter((d) => d.checkin).slice(-7);
  const voice = (history.data ?? []).find((a) => a.type === 'voice' && a.model)?.model;
  const vm = VOICE_MODEL.metrics;

  async function generate() {
    setBusy(true);
    setError('');
    try {
      await p.buildReport();
      reports.reload();
    } catch (err) {
      setError(errorText(err));
    }
    setBusy(false);
  }

  return (
    <div className="animate-rise">
      <PageHeader back="/" title={o.profile.name}
        subtitle={`${o.profile.diagnosed ? `Hoehn & Yahr ${o.profile.hoehnYahr}${o.profile.diagnosisYear ? `, diagnosed ${o.profile.diagnosisYear}` : ''}` : 'No diagnosis'}${o.profile.birthYear ? ` · born ${o.profile.birthYear}` : ''}`}
        action={<StatusPill status={latestDay?.status ?? 'building'} />} />

      <div className="grid items-start gap-3 lg:grid-cols-3">
        <Panel className="lg:col-span-3" title="Change from personal baseline" hint="All checks combined, last six weeks. Shaded bands mark a little off and clearly different.">
          <CompositeChart days={o.days} height={280} />
        </Panel>
        <Panel className="lg:col-span-3" title="By check" hint="Select one for the underlying measures.">
          <ModalityGrid days={o.days} latest={o.latest} baselines={o.baselines} onOpen={setOpen} columns />
        </Panel>

        <Panel className="lg:col-span-2" title="Medication" hint="From the patient's own log, last 14 days.">
          {insights.data ? <MedInsights data={insights.data} /> : <Spinner />}
        </Panel>
        <div className="space-y-3">
          <Panel title="Sleep" hint="Last three weeks.">
            {sleep.data?.length ? <SleepChart entries={sleep.data} height={150} /> : <p className="text-sm text-ink-soft">No nights logged.</p>}
          </Panel>
          <Panel title="Questions for you" hint="Saved by the patient while talking with the companion.">
            {notes.data?.length ? (
              <ul className="space-y-2.5">
                {notes.data.slice(0, 5).map((n) => (
                  <li key={n.id} className="rounded-2xl bg-paper p-3 text-sm leading-snug">{n.text}<span className="mt-1 block text-xs text-ink-faint">{ago(n.at)}</span></li>
                ))}
              </ul>
            ) : <p className="text-sm text-ink-soft">None saved.</p>}
          </Panel>
          <Panel title="Self-reported" hint="From daily check-in conversations.">
            {checkins.length ? (
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs uppercase tracking-wider text-ink-faint"><th className="pb-2 font-bold">Day</th><th className="pb-2 font-bold">Sleep</th><th className="pb-2 font-bold">Mood</th><th className="pb-2 font-bold">Movement</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {checkins.map((d) => (
                    <tr key={d.date}><td className="py-2 font-semibold">{fmtDate(d.date)}</td><td>{d.checkin?.sleepQuality ?? '–'}/5</td><td>{d.checkin?.mood ?? '–'}/5</td><td>{d.checkin?.motorDifficulty ?? '–'}/5</td></tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="text-sm text-ink-soft">Nothing reported yet.</p>}
          </Panel>
        </div>

        {voice && (
          <Panel className="lg:col-span-3" title="Voice screening model" hint="Population model, averaged over the most recent recordings. Secondary to the personal baseline above.">
            <div className="grid gap-6 sm:grid-cols-3">
              <div>
                <p className="text-5xl font-extrabold tabular-nums">{Math.round(voice.score * 100)}<span className="ml-1 text-lg font-semibold text-ink-faint">/ 100</span></p>
                <p className="mt-1 text-sm text-ink-soft">{voice.recordings >= VOICE_MODEL_SETTLED ? `From ${voice.recordings} recordings` : `Early estimate from ${voice.recordings} of ${VOICE_MODEL_SETTLED} recordings`}</p>
              </div>
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-faint">Pushing the score most</p>
                <ul className="space-y-1.5 text-sm">
                  {voice.factors.slice(0, 4).map((f) => (
                    <li key={f.feature} className="flex items-center justify-between gap-3">
                      <span>{VOICE_FEATURE_LABELS[f.feature] ?? f.feature}</span>
                      <span className={cx('font-bold tabular-nums', f.contribution > 0 ? 'text-alert' : 'text-good')}>{f.contribution > 0 ? '+' : ''}{f.contribution.toFixed(2)}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="text-sm leading-relaxed text-ink-soft">
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-faint">How far to trust it</p>
                AUC {vm.subject_auc.toFixed(2)} (95% CI {vm.subject_auc_ci95[0]!.toFixed(2)} to {vm.subject_auc_ci95[1]!.toFixed(2)}) on {vm.subjects} people recorded in a lab,
                and {vm.auc_by_recordings_averaged['1']!.toFixed(2)} from a single recording. Not validated on phone audio.
              </div>
            </div>
          </Panel>
        )}

        <Panel className="lg:col-span-2" title="Monthly summaries" hint="Written directly from the month's data, with no AI involved. They describe; they do not diagnose.">
          {error && <div className="mb-3"><ErrorNote>{error}</ErrorNote></div>}
          {reports.data?.length ? (
            <div className="space-y-4">
              {reports.data.slice(0, 3).map((r) => (
                <article key={r.month} className="rounded-2xl bg-paper p-4">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <h3 className="flex items-center gap-2 font-bold"><FileText className="h-4 w-4 text-brand-deep" />{fmtDate(`${r.month}-15`, { month: 'long', year: 'numeric' })}</h3>
                  </div>
                  <p className="whitespace-pre-line text-sm leading-relaxed text-ink-soft">{r.summary.replace(DISCLAIMER, '').trim()}</p>
                  <p className="mt-2 text-xs text-ink-faint">{r.stats.assessments} checks on {r.stats.activeDays} days · generated {ago(r.generatedAt)}</p>
                </article>
              ))}
            </div>
          ) : <p className="text-sm text-ink-soft">No summaries yet.</p>}
          <Button variant="secondary" className="mt-4" busy={busy} onClick={generate}><RefreshCw className="h-5 w-5" />Generate this month's summary</Button>
        </Panel>
        <Panel title="Drawings" hint="Most recent, for visual review.">
          {drawings.length ? <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">{drawings.map((a) => <Drawing key={a.id} a={a} />)}</div> : <p className="text-sm text-ink-soft">No drawings yet.</p>}
        </Panel>
      </div>
      <p className="mt-8 text-center text-xs leading-relaxed text-ink-faint">{DISCLAIMER}</p>

      <Sheet open={!!open} onClose={() => setOpen(null)} title={open ? keyLabel(open) : ''}>
        {open && (history.data ? <FeatureHistory type={type} task={task} assessments={history.data} baseline={o.baselines.find((b) => b.key === open)} /> : <Spinner />)}
      </Sheet>
    </div>
  );
}
