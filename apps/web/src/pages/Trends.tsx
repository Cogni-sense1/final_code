import { LineChart } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { AssessmentType } from '@neurovoice/shared';
import { CompositeChart, FeatureHistory, keyLabel, ModalityGrid } from '../components/trends';
import { api, useLoad } from '../lib/api';
import { Button, Card, Disclaimer, Empty, ErrorNote, PageHeader, SectionTitle, Segmented, Sheet, Spinner, StatusPill } from '../ui';

export default function Trends() {
  const [range, setRange] = useState<'14' | '30' | '45'>('30');
  const [open, setOpen] = useState<string | null>(null);
  const { data, error, loading } = useLoad(() => api.overview());
  const history = useLoad(() => api.assessments(undefined, 300));

  if (loading && !data) return <Spinner />;
  if (error || !data) return <ErrorNote>{error}</ErrorNote>;
  const days = data.days.slice(-Number(range));
  const hasData = data.days.some((d) => Object.keys(d.modalities).length);
  const latest = [...data.days].reverse().find((d) => d.composite !== null);
  const [type, task] = (open ?? '').split(':') as [AssessmentType, string | undefined];

  if (!hasData) {
    return (
      <div className="animate-rise">
        <PageHeader title="Trends" />
        <Empty icon={<LineChart className="h-7 w-7" />} title="Nothing to chart yet">
          <p>Do your first check and your trend starts here.</p>
          <Link to="/checks"><Button className="mt-4">Go to checks</Button></Link>
        </Empty>
      </div>
    );
  }

  return (
    <div className="animate-rise">
      <PageHeader title="Trends" subtitle="How you compare with your own usual." />
      <Card>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-ink-soft">All checks combined</p>
            <div className="mt-1.5"><StatusPill status={latest?.status ?? 'building'} /></div>
          </div>
          <div className="w-40"><Segmented value={range} onChange={setRange} options={[{ value: '14', label: '2w' }, { value: '30', label: '1m' }, { value: '45', label: '6w' }]} /></div>
        </div>
        <CompositeChart days={days} />
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          Zero is your baseline. The line rises when your checks move away from what is usual for you. A single high day is normal. Several in a row are worth noticing.
        </p>
      </Card>

      <SectionTitle>By check</SectionTitle>
      <ModalityGrid days={data.days} latest={data.latest} baselines={data.baselines} onOpen={setOpen} />
      <Disclaimer />

      <Sheet open={!!open} onClose={() => setOpen(null)} title={open ? keyLabel(open) : ''}>
        {open && (history.data
          ? <FeatureHistory type={type} task={task} assessments={history.data} baseline={data.baselines.find((b) => b.key === open)} />
          : <Spinner />)}
      </Sheet>
    </div>
  );
}
