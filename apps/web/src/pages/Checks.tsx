import { Check, ChevronRight, Clock3, Footprints, Hand, Mic, PenLine, ScanFace, Sparkles, Waves } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { type AssessmentType, BASELINE_MIN, MODALITIES } from '@neurovoice/shared';
import { CHECK_PATH } from '../components/trends';
import { api, useLoad } from '../lib/api';
import { ago, Card, cx, ErrorNote, PageHeader, SectionTitle, Spinner, StatusPill } from '../ui';

const ICONS: Record<AssessmentType, typeof Mic> = { voice: Mic, face: ScanFace, tap: Hand, spiral: PenLine, wave: Waves, clock: Clock3, gait: Footprints, lsvt: Sparkles };
const GROUPS: { title: string; types: AssessmentType[] }[] = [
  { title: 'Daily', types: ['voice', 'face', 'tap'] },
  { title: 'A few times a week', types: ['spiral', 'wave', 'gait'] },
  { title: 'Now and then', types: ['clock', 'lsvt'] },
];
/** Voice has two parts; the held vowel is the one tracked on this list. */
const keyOf = (type: AssessmentType): string => (type === 'voice' ? 'voice:vowel' : type);

export default function Checks() {
  const nav = useNavigate();
  const { data, error, loading } = useLoad(() => api.overview());
  if (loading && !data) return <Spinner />;
  if (error || !data) return <ErrorNote>{error}</ErrorNote>;

  return (
    <div className="animate-rise">
      <PageHeader title="Checks" subtitle="Each one is compared with your own baseline." />
      {GROUPS.map((g) => (
        <section key={g.title}>
          <SectionTitle>{g.title}</SectionTitle>
          <div className="space-y-2.5">
            {g.types.map((type) => {
              const spec = MODALITIES[type];
              const Icon = ICONS[type];
              const last = data.latest[keyOf(type)];
              const doneToday = !!data.todayProfile?.modalities[keyOf(type)];
              const sessions = data.baselines.find((b) => b.key === keyOf(type))?.sessions ?? 0;
              return (
                <Card key={type} className="flex items-center gap-4 !p-4" onClick={() => nav(CHECK_PATH[type])}>
                  <span className={cx('flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl', doneToday ? 'bg-good-soft text-good' : 'bg-brand-soft text-brand-deep')}>
                    {doneToday ? <Check className="h-6 w-6" strokeWidth={3} /> : <Icon className="h-6 w-6" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-lg font-bold leading-tight">{spec.name}</span>
                    <span className="block text-sm text-ink-soft">{spec.blurb}</span>
                    <span className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-ink-faint">
                      {last
                        ? <>{last.deviation.status === 'building' ? <span className="font-semibold text-calm">Baseline {Math.min(sessions, BASELINE_MIN)}/{BASELINE_MIN}</span> : <StatusPill status={last.deviation.status} small />}<span>{ago(last.takenAt)}</span></>
                        : <span>About {spec.seconds} seconds · not tried yet</span>}
                    </span>
                  </span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-ink-faint" />
                </Card>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
