import { Copy, HeartHandshake, Stethoscope, UserMinus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorText, useLoad, useProfile } from '../lib/api';
import { Button, Card, Empty, ErrorNote, fmtDate, PageHeader, SectionTitle, Spinner } from '../ui';

export default function Care() {
  const profile = useProfile();
  const team = useLoad(() => api.careTeam());
  const [invite, setInvite] = useState<{ code: string; expiresAt: string } | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const sharing = profile.consent?.shareWithCareTeam === true;

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setError('');
    try {
      await fn();
    } catch (err) {
      setError(errorText(err));
    }
    setBusy('');
  }

  return (
    <div className="animate-rise">
      <PageHeader title="Care team" subtitle="People you have chosen to share with." back="/" />
      {error && <div className="mb-3"><ErrorNote>{error}</ErrorNote></div>}

      {!sharing ? (
        <Card><p className="font-bold">Sharing is turned off</p><p className="mt-1 text-ink-soft">Turn it on in your privacy settings to invite family or a doctor.</p><Link to="/profile"><Button className="mt-4" variant="secondary">Privacy settings</Button></Link></Card>
      ) : (
        <Card className="bg-navy text-white">
          <p className="text-lg font-extrabold">Invite someone</p>
          <p className="mt-1 text-white/70">Give them this code. They enter it in their own NeuroVoice account. It works once and expires in 48 hours.</p>
          {invite ? (
            <div className="mt-4 flex items-center gap-3">
              <span className="flex-1 rounded-2xl bg-white/10 py-3 text-center text-3xl font-extrabold tracking-[.3em]">{invite.code}</span>
              <Button variant="secondary" aria-label="Copy code" onClick={() => { void navigator.clipboard?.writeText(invite.code); setCopied(true); }}><Copy className="h-5 w-5" />{copied ? 'Copied' : 'Copy'}</Button>
            </div>
          ) : (
            <Button className="mt-4" busy={busy === 'invite'} onClick={() => run('invite', async () => { setCopied(false); setInvite(await api.createInvite()); })}>Create a code</Button>
          )}
        </Card>
      )}

      <SectionTitle>Who can see your data</SectionTitle>
      {!team.data ? <Spinner /> : team.data.length === 0 ? (
        <Empty icon={<HeartHandshake className="h-7 w-7" />} title="Nobody yet"><p>Only you can see your results until you invite someone.</p></Empty>
      ) : (
        <div className="space-y-2.5">
          {team.data.map((m) => (
            <Card key={m.memberId} className="flex items-center gap-4 !p-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-brand-deep">{m.memberRole === 'clinician' ? <Stethoscope className="h-6 w-6" /> : <HeartHandshake className="h-6 w-6" />}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{m.memberName}</p>
                <p className="text-sm capitalize text-ink-soft">{m.memberRole} · since {fmtDate(m.since)}</p>
              </div>
              <Button variant="danger" className="!min-h-[2.75rem] !px-3.5" aria-label={`Remove ${m.memberName}`} busy={busy === m.memberId}
                onClick={() => run(m.memberId, async () => { await api.revokeMember(m.memberId); team.reload(); })}><UserMinus className="h-5 w-5" /></Button>
            </Card>
          ))}
        </div>
      )}
      <p className="mt-6 text-sm leading-relaxed text-ink-soft">
        They can view your trends, medication log, sleep, and monthly summaries, and they are told about missed doses and sustained changes. They cannot change anything, and removing them takes effect immediately.
      </p>
    </div>
  );
}
