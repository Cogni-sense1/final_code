import { Check, Info, ShieldCheck, X } from 'lucide-react';
import { forwardRef, type ReactNode, type RefObject } from 'react';
import { useNavigate } from 'react-router-dom';
import { type Assessment, BASELINE_MIN, MODALITIES, PROBLEM_COPY, STATUS_COPY, trackedFeatures, VOICE_MODEL_SETTLED, voiceModelNote } from '@neurovoice/shared';
import type { CameraState } from '../lib/vision';
import { Button, Card, cx, Spinner, TONE } from '../ui';

export function CheckLayout({ title, step, children }: { title: string; step?: string; children: ReactNode }) {
  const nav = useNavigate();
  return (
    <div className="flex min-h-[calc(100dvh-3.5rem)] flex-col">
      <header className="mb-4 flex items-center gap-3">
        <button type="button" aria-label="Close" onClick={() => nav('/checks')} className="flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-card"><X className="h-5 w-5" /></button>
        <div className="flex-1">
          <h1 className="text-lg font-extrabold leading-tight">{title}</h1>
          {step && <p className="text-sm text-ink-soft">{step}</p>}
        </div>
      </header>
      {children}
    </div>
  );
}

export function Intro({ icon, title, steps, privacy, onStart, startLabel = 'Start' }: { icon: ReactNode; title: string; steps: string[]; privacy?: string; onStart: () => void; startLabel?: string }) {
  return (
    <div className="flex flex-1 flex-col animate-rise">
      <div className="flex h-20 w-20 items-center justify-center rounded-xl3 bg-brand-soft text-brand-deep">{icon}</div>
      <h2 className="mt-5 text-3xl font-extrabold tracking-tight">{title}</h2>
      <ol className="mt-5 space-y-3">
        {steps.map((s, i) => (
          <li key={s} className="flex gap-3.5 text-lg">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-navy text-sm font-bold text-white">{i + 1}</span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
      {privacy && (
        <p className="mt-6 flex items-start gap-2.5 rounded-2xl bg-good-soft p-3.5 text-sm font-medium text-good">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />{privacy}
        </p>
      )}
      <div className="mt-auto pt-8"><Button full onClick={onStart}>{startLabel}</Button></div>
    </div>
  );
}

/** Mirrored camera view with a drawing layer on top. */
export const CameraStage = forwardRef<HTMLVideoElement, { canvas?: RefObject<HTMLCanvasElement | null>; state: CameraState; message: string; tall?: boolean; children?: ReactNode }>(
  function CameraStage({ canvas, state, message, tall, children }, ref) {
    return (
      <div className={cx('relative w-full overflow-hidden rounded-xl3 bg-navy-deep', tall ? 'aspect-[3/4]' : 'aspect-[4/5] sm:aspect-[4/3]')}>
        <video ref={ref} playsInline muted className="absolute inset-0 h-full w-full -scale-x-100 object-cover" />
        {canvas && <canvas ref={canvas} className="absolute inset-0 h-full w-full -scale-x-100 object-cover" />}
        {state !== 'ready' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-navy-deep/85 px-8 text-center text-white">
            {state === 'starting' && <Spinner />}
            <p className="font-medium">{message}</p>
          </div>
        )}
        {state === 'ready' && children}
      </div>
    );
  },
);

export const Hud = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={cx('absolute rounded-2xl bg-navy-deep/70 px-3.5 py-2 text-white backdrop-blur', className)}>{children}</div>
);

export const Working = ({ label = 'Working out your result' }: { label?: string }) => (
  <div className="flex flex-1 items-center justify-center"><Spinner label={label} /></div>
);

/** Shown when a capture could not be used. Nothing is saved to the trend. */
export function Unusable({ problems, onRetry }: { problems: string[]; onRetry: () => void }) {
  return (
    <div className="flex flex-1 flex-col animate-rise">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-warn-soft text-warn"><Info className="h-7 w-7" /></div>
      <h2 className="mt-5 text-2xl font-extrabold">Let's try that once more</h2>
      <ul className="mt-3 space-y-2 text-lg text-ink-soft">
        {(problems.length ? problems : ['unknown']).map((p) => <li key={p}>{PROBLEM_COPY[p] ?? 'We could not get a clear reading.'}</li>)}
      </ul>
      <p className="mt-4 text-sm text-ink-faint">This attempt was not added to your trend.</p>
      <div className="mt-auto pt-8"><Button full onClick={onRetry}>Try again</Button></div>
    </div>
  );
}

/** The population voice model's output, kept visually secondary to the personal baseline. */
export function VoiceModelCard({ model }: { model: NonNullable<Assessment['model']> }) {
  const pct = Math.round(model.score * 100);
  const settled = model.recordings >= VOICE_MODEL_SETTLED;
  return (
    <Card className="mt-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-bold uppercase tracking-wider text-ink-faint">Voice screening score</h3>
        <span className={cx('rounded-full px-2.5 py-1 text-xs font-bold', settled ? 'bg-calm-soft text-calm' : 'bg-warn-soft text-warn')}>
          {settled ? `${model.recordings} recordings` : `Early estimate · ${model.recordings} of ${VOICE_MODEL_SETTLED}`}
        </span>
      </div>
      <div className="mt-4 flex items-end gap-3">
        <span className="text-4xl font-extrabold leading-none tabular-nums">{pct}</span>
        <span className="pb-0.5 text-sm font-semibold text-ink-faint">out of 100</span>
      </div>
      <div className="relative mt-3 h-2.5 rounded-full bg-gradient-to-r from-good/50 via-warn/50 to-alert/60">
        <span className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white bg-navy shadow" style={{ left: `${pct}%` }} />
      </div>
      <div className="mt-1.5 flex justify-between text-xs font-semibold text-ink-faint"><span>like the comparison group</span><span>like the patient group</span></div>
      <p className="mt-3 text-xs leading-relaxed text-ink-faint">{voiceModelNote(model.recordings)}</p>
    </Card>
  );
}

const fmt = (v: number, dp = 2): string => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(dp));

export function ResultView({ assessment: a, onAgain, extra }: { assessment: Assessment; onAgain?: () => void; extra?: ReactNode }) {
  const nav = useNavigate();
  const d = a.deviation;
  const tone = TONE[d.status];
  const spec = MODALITIES[a.type];
  const tracked = trackedFeatures(a.type, a.task);
  const zByKey = new Map(d.drivers.map((x) => [x.key, x.z]));

  return (
    <div className="flex flex-1 flex-col animate-rise">
      <Card className={cx('!p-6', tone.bg)}>
        <div className={cx('flex h-12 w-12 items-center justify-center rounded-full bg-white', tone.text)}><Check className="h-6 w-6" strokeWidth={3} /></div>
        <h2 className={cx('mt-4 text-2xl font-extrabold', tone.text)}>{STATUS_COPY[d.status].label}</h2>
        <p className="mt-1.5 text-ink-soft">
          {d.status === 'building'
            ? `That is ${Math.min(d.sessionsInBaseline, BASELINE_MIN)} of ${BASELINE_MIN} sessions needed to learn what is usual for you. After that, each check is compared with your own baseline.`
            : d.status === 'steady'
              ? 'Today looks like your usual. Keep going, the daily habit is what makes changes visible.'
              : d.status === 'watch'
                ? 'A bit different from your usual today. One day on its own does not mean much. Tiredness, a cold, or a noisy room can do this.'
                : 'Noticeably different from your usual today. If this continues over several days we will let you know, and it may be worth mentioning to your doctor.'}
        </p>
        {d.status === 'building' && (
          <div className="mt-4 flex gap-1.5">
            {Array.from({ length: BASELINE_MIN }, (_, i) => <span key={i} className={cx('h-2 flex-1 rounded-full', i < d.sessionsInBaseline ? 'bg-calm' : 'bg-white')} />)}
          </div>
        )}
      </Card>

      <Card className="mt-3">
        <h3 className="text-sm font-bold uppercase tracking-wider text-ink-faint">What we measured</h3>
        <dl className="mt-2 divide-y divide-line">
          {(tracked.length ? tracked : spec.features).filter((f) => a.features[f.key] !== undefined).map((f) => {
            const z = zByKey.get(f.key);
            return (
              <div key={f.key} className="flex items-center justify-between gap-3 py-3">
                <dt className="font-medium">{f.label}</dt>
                <dd className="flex items-center gap-2.5 text-right">
                  <span className="font-bold tabular-nums">{fmt(a.features[f.key]!, f.dp)}<span className="ml-1 text-sm font-medium text-ink-faint">{f.unit}</span></span>
                  {z !== undefined && (
                    <span className={cx('min-w-[4.5rem] rounded-full px-2 py-0.5 text-center text-xs font-bold', z >= 2 ? 'bg-alert-soft text-alert' : z >= 1 ? 'bg-warn-soft text-warn' : 'bg-good-soft text-good')}>
                      {z >= 1 ? 'off usual' : 'usual'}
                    </span>
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
        {a.reference.findings.length > 0 && (
          <ul className="mt-3 space-y-1.5 rounded-2xl bg-paper p-3.5 text-sm text-ink-soft">
            {a.reference.findings.map((f) => <li key={f}>{f}</li>)}
          </ul>
        )}
      </Card>

      {extra}
      <div className="mt-auto flex gap-3 pt-6">
        {onAgain && <Button variant="secondary" onClick={onAgain}>Repeat</Button>}
        <Button full onClick={() => nav('/checks')}>Done</Button>
      </div>
    </div>
  );
}
