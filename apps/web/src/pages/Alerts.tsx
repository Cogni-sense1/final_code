import { Bell, FileText, Moon, Pill, TrendingUp, Zap } from 'lucide-react';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Alert } from '@neurovoice/shared';
import { api, useLoad, useProfile } from '../lib/api';
import { ago, Card, cx, Empty, ErrorNote, PageHeader, Spinner } from '../ui';

const ICON: Record<Alert['kind'], typeof Bell> = { sustained_change: TrendingUp, missed_dose: Pill, frequent_off: Zap, rbd_pattern: Moon, report_ready: FileText };

export default function Alerts() {
  const profile = useProfile();
  const nav = useNavigate();
  const { data, error } = useLoad(() => api.alerts());
  const member = profile.role !== 'patient';

  // Opening the list is what marks alerts as read.
  useEffect(() => { if (data?.some((a) => !a.read)) void api.markAlertsRead().catch(() => undefined); }, [data]);

  if (!data) return error ? <ErrorNote>{error}</ErrorNote> : <Spinner />;
  return (
    <div className="mx-auto max-w-xl animate-rise">
      <PageHeader title="Alerts" back={member ? undefined : '/'} />
      {data.length === 0 ? (
        <Empty icon={<Bell className="h-7 w-7" />} title="Nothing to flag"><p>You'll hear about missed doses, sustained changes, and new monthly summaries here.</p></Empty>
      ) : (
        <div className="space-y-2.5">
          {data.map((a) => {
            const Icon = ICON[a.kind];
            const attention = a.severity === 'attention';
            return (
              <Card key={a.id} className={cx('flex gap-4 !p-4', !a.read && 'ring-2 ring-brand/40')} onClick={member ? () => nav(`/patients/${a.patientId}`) : undefined}>
                <span className={cx('flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl', attention ? 'bg-warn-soft text-warn' : 'bg-calm-soft text-calm')}><Icon className="h-5 w-5" /></span>
                <div className="min-w-0">
                  {member && <p className="text-xs font-bold uppercase tracking-wider text-ink-faint">{a.patientName}</p>}
                  <p className="font-bold leading-snug">{a.title}</p>
                  <p className="mt-0.5 text-sm text-ink-soft">{a.detail}</p>
                  <p className="mt-1.5 text-xs text-ink-faint">{ago(a.at)}</p>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
