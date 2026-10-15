import { ChevronRight, KeyRound, Users } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errorText, useLoad, useProfile } from '../lib/api';
import { Button, Card, cx, DemoBadge, Empty, ErrorNote, fmtDate, Spark, Spinner, StatusPill, TONE } from '../ui';

const ORDER = { changed: 0, watch: 1, building: 2, steady: 3 } as const;

export default function Patients() {
  const profile = useProfile();
  const nav = useNavigate();
  const { data, error, reload } = useLoad(() => api.patients());
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [linkError, setLinkError] = useState('');

  async function link(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setLinkError('');
    try {
      await api.acceptInvite(code);
      setCode('');
      reload();
    } catch (err) {
      setLinkError(errorText(err));
    }
    setBusy(false);
  }

  if (!data) return error ? <ErrorNote>{error}</ErrorNote> : <Spinner />;
  const rows = [...data].sort((a, b) => ORDER[a.status] - ORDER[b.status]);
  const attention = rows.filter((r) => r.status === 'changed' || r.status === 'watch').length;

  return (
    <div className="animate-rise">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-ink-soft">{profile.role === 'clinician' ? 'Clinician dashboard' : 'Caregiver view'}</p>
          <h1 className="text-3xl font-extrabold tracking-tight">{profile.name}</h1>
        </div>
        {profile.synthetic && <DemoBadge />}
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="!p-4"><p className="text-sm font-semibold text-ink-soft">People you follow</p><p className="mt-1 text-3xl font-extrabold">{rows.length}</p></Card>
        <Card className="!p-4"><p className="text-sm font-semibold text-ink-soft">Off their usual</p><p className={cx('mt-1 text-3xl font-extrabold', attention > 0 && 'text-warn')}>{attention}</p></Card>
        <Card className="!p-4">
          <form onSubmit={link}>
            <p className="text-sm font-semibold text-ink-soft">Add someone with their code</p>
            <div className="mt-2 flex gap-2">
              <input aria-label="Invite code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))} placeholder="ABC123" className="min-w-0 flex-1 !py-2 font-bold tracking-[.2em]" />
              <Button type="submit" className="!min-h-[2.75rem] !px-4" busy={busy} disabled={code.length < 6}><KeyRound className="h-5 w-5" /></Button>
            </div>
            {linkError && <p className="mt-2 text-sm font-medium text-alert">{linkError}</p>}
          </form>
        </Card>
      </div>

      <h2 className="mb-3 mt-8 text-sm font-bold uppercase tracking-wider text-ink-faint">Sorted by who needs a look first</h2>
      {rows.length === 0 ? (
        <Empty icon={<Users className="h-7 w-7" />} title="Nobody linked yet"><p>Ask the person you support to open Care team in their app and give you a six-character code.</p></Empty>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {rows.map((r) => (
            <Card key={r.patientId} className="!p-5" onClick={() => nav(`/patients/${r.patientId}`)}>
              <div className="flex items-start gap-4">
                <span className={cx('flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-lg font-extrabold', TONE[r.status].bg, TONE[r.status].text)}>{r.name[0]}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-lg font-bold leading-tight">{r.name}</p>
                  <p className="text-sm text-ink-soft">{r.diagnosed ? `Hoehn & Yahr ${r.hoehnYahr}` : 'No diagnosis'} · {r.lastActive ? `last check ${fmtDate(r.lastActive)}` : 'no checks yet'}</p>
                </div>
                <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-ink-faint" />
              </div>
              <div className="mt-4 flex items-end justify-between gap-3">
                <div className="space-y-2">
                  <StatusPill status={r.status} small />
                  <p className="text-sm text-ink-soft">{r.adherencePct === null ? 'No medication schedule' : `${r.adherencePct}% of doses logged`}</p>
                </div>
                <Spark values={r.spark} color={TONE[r.status].stroke} width={140} height={44} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
