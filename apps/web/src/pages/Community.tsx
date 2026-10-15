import { ArrowLeft, SendHorizontal, ShieldCheck, Users } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { GroupMessage, GroupRow } from '@neurovoice/shared';
import { api, errorText, useLoad, useProfile } from '../lib/api';
import { Button, Card, cx, ErrorNote, fmtTime, PageHeader, SectionTitle, Spinner } from '../ui';

function Room({ group, handle, onBack }: { group: GroupRow; handle: string; onBack: () => void }) {
  const profile = useProfile();
  const [messages, setMessages] = useState<GroupMessage[] | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const latest = useRef<string | undefined>(undefined);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    const pull = async (): Promise<void> => {
      try {
        const fresh = await api.groupMessages(group.id, latest.current);
        if (!live) return;
        if (latest.current === undefined) setMessages(fresh);
        else if (fresh.length) setMessages((m) => [...(m ?? []), ...fresh.filter((f) => !(m ?? []).some((x) => x.id === f.id))]);
        if (fresh.length) latest.current = fresh[fresh.length - 1]!.at;
        else latest.current ??= new Date(0).toISOString();
      } catch (err) {
        if (live) setError(errorText(err));
      }
    };
    void pull();
    // New messages arrive by polling every few seconds.
    const id = window.setInterval(pull, 4000);
    return () => { live = false; window.clearInterval(id); };
  }, [group.id]);

  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function send(e: FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setError('');
    try {
      const msg = await api.postGroupMessage(group.id, body);
      setText('');
      setMessages((m) => [...(m ?? []), msg]);
      latest.current = msg.at;
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <div className="flex h-[calc(100dvh-8.5rem)] flex-col">
      <header className="mb-4 flex items-center gap-3">
        <button type="button" aria-label="Back to groups" onClick={onBack} className="flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-card"><ArrowLeft className="h-5 w-5" /></button>
        <div><h1 className="text-xl font-extrabold leading-tight">{group.name}</h1><p className="text-sm text-ink-soft">You appear as <span className="font-bold text-ink">{handle}</span></p></div>
      </header>
      <div className="no-scrollbar flex-1 space-y-3 overflow-y-auto pb-3">
        {!messages && <Spinner />}
        {messages?.length === 0 && <p className="py-10 text-center text-ink-soft">No messages yet. Say hello.</p>}
        {messages?.map((m) => {
          const mine = m.authorId === profile.userId;
          return (
            <div key={m.id} className={cx('flex flex-col', mine ? 'items-end' : 'items-start')}>
              <span className="mb-1 px-2 text-xs font-semibold text-ink-faint">{mine ? 'You' : m.handle} · {fmtTime(m.at)}</span>
              <p className={cx('max-w-[85%] whitespace-pre-wrap rounded-3xl px-4 py-3 text-[17px] leading-relaxed', mine ? 'rounded-br-lg bg-navy text-white' : 'rounded-bl-lg bg-white shadow-card')}>{m.text}</p>
            </div>
          );
        })}
        <div ref={end} />
      </div>
      {error && <div className="mb-2"><ErrorNote>{error}</ErrorNote></div>}
      <form onSubmit={send} className="flex gap-2 pt-2">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Write to the group" maxLength={600} className="min-h-[3.25rem] flex-1 !rounded-full !px-5" />
        <button type="submit" aria-label="Send" disabled={!text.trim()} className="flex h-[3.25rem] w-[3.25rem] shrink-0 items-center justify-center rounded-full bg-brand text-white disabled:opacity-40"><SendHorizontal className="h-6 w-6" /></button>
      </form>
    </div>
  );
}

export default function Community() {
  const profile = useProfile();
  const { data, error, reload } = useLoad(() => api.groups());
  const [open, setOpen] = useState<GroupRow | null>(null);
  const [busy, setBusy] = useState('');

  if (!data) return error ? <ErrorNote>{error}</ErrorNote> : <Spinner />;
  if (open) return <Room group={open} handle={data.handle} onBack={() => { setOpen(null); reload(); }} />;

  const join = async (g: GroupRow): Promise<void> => {
    setBusy(g.id);
    await api.joinGroup(g.id).catch(() => undefined);
    setBusy('');
    setOpen({ ...g, joined: true });
  };
  const mine = data.groups.filter((g) => g.joined);
  const others = data.groups.filter((g) => !g.joined).sort((a, b) => Number(b.suggested) - Number(a.suggested));

  return (
    <div className="mx-auto max-w-xl animate-rise">
      <PageHeader title="Community" subtitle="Talk with people at a similar stage." back={profile.role === 'patient' ? '/' : undefined} />
      <p className="flex items-start gap-2.5 rounded-2xl bg-good-soft p-3.5 text-sm font-medium text-good">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />You appear as {data.handle}, never your real name. Phone numbers, emails, and links are blocked.
      </p>
      {mine.length > 0 && (
        <>
          <SectionTitle>Your groups</SectionTitle>
          <div className="space-y-2.5">
            {mine.map((g) => (
              <Card key={g.id} className="flex items-center gap-4 !p-4" onClick={() => setOpen(g)}>
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-brand-deep"><Users className="h-6 w-6" /></span>
                <span><span className="block text-lg font-bold leading-tight">{g.name}</span><span className="text-sm text-ink-soft">{g.description}</span></span>
              </Card>
            ))}
          </div>
        </>
      )}
      <SectionTitle>{mine.length ? 'Other groups' : 'Find your group'}</SectionTitle>
      <div className="space-y-2.5">
        {others.map((g) => (
          <Card key={g.id} className={cx('flex items-center gap-3 !p-4', g.suggested && 'ring-2 ring-brand/40')}>
            <div className="min-w-0 flex-1">
              <p className="font-bold">{g.name}{g.suggested && <span className="ml-2 rounded-full bg-brand-soft px-2 py-0.5 text-xs text-brand-deep">Suggested for you</span>}</p>
              <p className="text-sm text-ink-soft">{g.description}</p>
            </div>
            <Button variant={g.suggested ? 'primary' : 'secondary'} className="!min-h-[2.75rem] !px-4" busy={busy === g.id} onClick={() => void join(g)}>Join</Button>
          </Card>
        ))}
      </div>
      <p className="mt-6 text-center text-xs leading-relaxed text-ink-faint">Peer support is not medical advice. What works for one person may not suit another. Check with your doctor before changing anything.</p>
    </div>
  );
}
