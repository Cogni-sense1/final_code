import { BookHeart, Mic, PhoneOff, SendHorizontal, Stethoscope, Trash2, Volume2, VolumeX } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { ChatMessage, Checkin, CompanionReply, Memory, Profile } from '@neurovoice/shared';
import { api, errorText, useProfile } from '../lib/api';
import { Speaker, VoiceSession } from '../lib/audio';
import { Button, cx, Empty, ErrorNote, PageHeader, SectionTitle, Sheet, Spinner } from '../ui';

const ASK = ['How has my week looked?', 'What does an off period mean?', 'What do you remember about me?'];
const SCALE = ['', 'very poor', 'poor', 'okay', 'good', 'very good'];
const HARD = ['', 'none', 'slight', 'some', 'a lot', 'severe'];

/** The conversation as shown: messages, plus small notes when something was saved. */
type Entry = { kind: 'message'; id: string; message: ChatMessage } | { kind: 'saved'; id: string; text: string; doctor?: boolean };

function savedEntries(out: { checkin: Checkin | null; remembered: Memory[] }): Entry[] {
  const entries: Entry[] = out.remembered.map((m) => ({ kind: 'saved', id: `mem-${m.id}`, text: m.kind === 'doctor' ? `Saved for your doctor: ${m.text}` : `I'll remember: ${m.text}`, doctor: m.kind === 'doctor' }));
  const c = out.checkin;
  const parts = c ? [c.sleepQuality && `sleep ${SCALE[c.sleepQuality]}`, c.mood && `mood ${SCALE[c.mood]}`, c.motorDifficulty && `movement difficulty ${HARD[c.motorDifficulty]}`].filter(Boolean) : [];
  if (parts.length) entries.push({ kind: 'saved', id: `day-${Date.now()}`, text: `Noted for today: ${parts.join(', ')}` });
  return entries;
}

// ── Talking ──────────────────────────────────────────────────────────────────

type Phase = 'starting' | 'listening' | 'thinking' | 'speaking' | 'paused' | 'error';
const PHASE_TEXT: Record<Phase, string> = {
  starting: 'Getting ready', listening: "I'm listening", thinking: 'Thinking', speaking: 'Tap the circle to interrupt', paused: 'Tap the circle to carry on', error: '',
};

function Talk({ profile, opening, onTurn, onClose }: {
  profile: Profile;
  /** Something the companion has just said that should be spoken first. */
  opening: string | null;
  onTurn: (heard: string, out: CompanionReply) => void;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>('starting');
  const [heard, setHeard] = useState('');
  const [said, setSaid] = useState(opening ?? '');
  const [error, setError] = useState('');
  const [level, setLevel] = useState(0);
  const session = useRef<VoiceSession | null>(null);
  const speaker = useRef<Speaker | null>(null);
  const resume = useRef<(() => void) | null>(null);
  const turn = useRef(onTurn);
  turn.current = onTurn;

  useEffect(() => {
    let live = true;
    let raf = 0;
    const fail = (message: string): void => { if (live) { setError(message); setPhase('error'); } };

    // Each call owns its microphone and speaker. They are held in this closure, not only in
    // refs, so a second mount (React does this in development) can never pick up a closed one.
    let voice: VoiceSession | null = null;
    const out = new Speaker();
    speaker.current = out;

    (async () => {
      try {
        voice = await VoiceSession.open();
      } catch {
        return fail('The microphone is needed to talk. Allow it in your browser settings and try again.');
      }
      if (!live) return voice.close();
      const mic = voice;
      session.current = mic;
      const tick = (): void => { setLevel(mic.level()); raf = requestAnimationFrame(tick); };
      raf = requestAnimationFrame(tick);

      if (opening) {
        setPhase('speaking');
        const blob = await api.speak(opening).catch(() => null);
        if (live) await out.say(opening, profile.locale, blob ? URL.createObjectURL(blob) : null);
      }
      while (live) {
        setPhase('listening');
        const wav = await mic.listen();
        if (!live) break;
        if (!wav) {
          // Nobody spoke. Wait for a tap rather than listening forever.
          setPhase('paused');
          await new Promise<void>((r) => { resume.current = r; });
          continue;
        }
        setPhase('thinking');
        try {
          const reply = await api.voiceTurn(wav);
          if (!live) break;
          if (reply === null) return fail('Talking needs the speech service, which is not available right now. You can still type your messages.');
          if (!reply.reply) continue;
          setHeard(reply.transcript);
          setSaid(reply.reply.text);
          turn.current(reply.transcript, { reply: reply.reply, checkin: reply.checkin, remembered: reply.remembered });
          setPhase('speaking');
          await out.say(reply.reply.text, profile.locale, reply.audio ? `data:audio/mpeg;base64,${reply.audio}` : null);
        } catch (err) {
          return fail(errorText(err));
        }
      }
    })();

    return () => {
      live = false;
      cancelAnimationFrame(raf);
      resume.current?.();
      voice?.close();
      out.stop();
    };
    // The loop owns the whole call; it must not restart when props change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tapOrb = (): void => {
    if (phase === 'speaking') speaker.current?.stop();
    else if (phase === 'paused') { resume.current?.(); resume.current = null; }
  };
  const hearing = phase === 'listening' && level > 0.12;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-navy-deep px-6 pb-8 pt-10 text-white safe-bottom">
      <p className="text-center text-sm font-semibold uppercase tracking-widest text-white/50">Talking with your companion</p>

      <div className="flex flex-1 flex-col items-center justify-center">
        {phase === 'error' ? (
          <p role="alert" className="max-w-sm text-center text-lg text-white/80">{error}</p>
        ) : (
          <>
            <button type="button" onClick={tapOrb} aria-label={PHASE_TEXT[phase]} className="relative flex h-56 w-56 items-center justify-center">
              {phase === 'speaking' && <span className="absolute inset-4 rounded-full bg-brand/40 animate-pulseRing" />}
              <span className="absolute inset-0 rounded-full bg-brand/15 transition-transform duration-100" style={{ transform: `scale(${phase === 'listening' ? 0.8 + level * 0.5 : 0.8})` }} />
              <span className={cx('relative flex h-36 w-36 items-center justify-center rounded-full transition-colors', phase === 'speaking' ? 'bg-brand' : phase === 'paused' ? 'bg-white/15' : 'bg-white/10 ring-2 ring-brand')}>
                {phase === 'thinking' || phase === 'starting'
                  ? <span className="flex gap-1.5">{[0, 1, 2].map((i) => <span key={i} className="h-3 w-3 animate-bounce rounded-full bg-white" style={{ animationDelay: `${i * 130}ms` }} />)}</span>
                  : phase === 'speaking' ? <Volume2 className="h-14 w-14" /> : <Mic className={cx('h-14 w-14', hearing && 'text-brand')} />}
              </span>
            </button>
            <p className="mt-6 text-xl font-bold">{phase === 'listening' && hearing ? 'Go on…' : PHASE_TEXT[phase]}</p>
          </>
        )}
      </div>

      <div className="mx-auto min-h-[7.5rem] w-full max-w-md space-y-2 text-center">
        {heard && <p className="text-sm text-white/50">You said: {heard}</p>}
        {said && phase !== 'error' && <p className="text-lg leading-snug text-white/90">{said}</p>}
      </div>

      <button type="button" onClick={onClose} className="mx-auto mt-6 flex h-16 items-center gap-2.5 rounded-full bg-alert px-8 text-lg font-bold">
        <PhoneOff className="h-6 w-6" />End
      </button>
    </div>
  );
}

// ── What the companion remembers ─────────────────────────────────────────────

function Memories({ open, onClose, onCleared }: { open: boolean; onClose: () => void; onCleared: () => void }) {
  const [items, setItems] = useState<Memory[] | null>(null);
  const [busy, setBusy] = useState('');
  useEffect(() => { if (open) api.memories().then(setItems, () => setItems([])); }, [open]);

  const forget = async (id: string): Promise<void> => {
    setBusy(id);
    await api.forgetMemory(id).catch(() => undefined);
    setItems((list) => (list ?? []).filter((m) => m.id !== id));
    setBusy('');
  };
  const row = (m: Memory) => (
    <li key={m.id} className="flex items-start gap-3 rounded-2xl bg-white p-3.5 shadow-card">
      <p className="flex-1 leading-snug">{m.text}</p>
      <button type="button" aria-label="Forget this" disabled={busy === m.id} onClick={() => void forget(m.id)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-faint hover:bg-alert-soft hover:text-alert"><Trash2 className="h-4 w-4" /></button>
    </li>
  );
  const about = (items ?? []).filter((m) => m.kind === 'about');
  const doctor = (items ?? []).filter((m) => m.kind === 'doctor');

  return (
    <Sheet open={open} onClose={onClose} title="What I remember">
      {!items ? <Spinner /> : (
        <>
          <p className="text-sm text-ink-soft">Your companion keeps these so it can pick up where you left off. Remove anything you would rather it forgot.</p>
          <SectionTitle>About you</SectionTitle>
          {about.length ? <ul className="space-y-2">{about.map(row)}</ul> : <p className="text-sm text-ink-soft">Nothing yet. It builds up as you talk.</p>}
          <SectionTitle>For your doctor</SectionTitle>
          {doctor.length ? <ul className="space-y-2">{doctor.map(row)}</ul> : <p className="text-sm text-ink-soft">Ask your companion to save a question for your next visit.</p>}
          {doctor.length > 0 && <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-faint"><Stethoscope className="h-3.5 w-3.5" />A clinician you have linked can see these questions. Everything under "About you" stays private.</p>}
          <Button variant="danger" full className="mt-6" busy={busy === 'clear'} onClick={async () => { setBusy('clear'); await api.clearChat().catch(() => undefined); setBusy(''); onCleared(); onClose(); }}>
            <Trash2 className="h-5 w-5" />Clear the conversation
          </Button>
        </>
      )}
    </Sheet>
  );
}

// ── Screen ───────────────────────────────────────────────────────────────────

export default function Companion() {
  const profile = useProfile();
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [aloud, setAloud] = useState(() => localStorage.getItem('nv.aloud') === '1');
  const [talking, setTalking] = useState(false);
  const [remembering, setRemembering] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const speaker = useRef<Speaker | null>(null);
  const opened = useRef(false);

  const add = useCallback((more: Entry[]) => setEntries((list) => [...(list ?? []), ...more]), []);
  const message = (m: ChatMessage): Entry => ({ kind: 'message', id: m.id, message: m });

  const load = useCallback(async () => {
    try {
      setEntries((await api.chatHistory()).map(message));
      // After a gap the companion starts the conversation itself.
      if (!opened.current) {
        opened.current = true;
        const { opened: out } = await api.openCompanion();
        if (out) add([message(out.reply)]);
      }
    } catch (err) {
      setError(errorText(err));
      setEntries((list) => list ?? []);
    }
  }, [add]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }); }, [entries, sending]);
  useEffect(() => () => speaker.current?.stop(), []);

  async function readAloud(reply: string) {
    speaker.current ??= new Speaker();
    const blob = await api.speak(reply).catch(() => null);
    void speaker.current.say(reply, profile.locale, blob ? URL.createObjectURL(blob) : null);
  }

  async function send(value: string) {
    const body = value.trim();
    if (!body || sending) return;
    setText('');
    setError('');
    setSending(true);
    add([message({ id: `tmp${Date.now()}`, at: new Date().toISOString(), role: 'user', text: body })]);
    try {
      const out = await api.chat(body);
      add([message(out.reply), ...savedEntries(out)]);
      if (aloud) void readAloud(out.reply.text);
    } catch (err) {
      setError(errorText(err));
    }
    setSending(false);
  }

  const toggleAloud = (): void => {
    const next = !aloud;
    setAloud(next);
    localStorage.setItem('nv.aloud', next ? '1' : '0');
    if (!next) speaker.current?.stop();
  };

  const messages = (entries ?? []).filter((e): e is Extract<Entry, { kind: 'message' }> => e.kind === 'message');
  const last = messages[messages.length - 1]?.message;
  const offline = last?.role === 'assistant' && last.engine === 'local';
  // If the companion spoke last and recently, a call starts with it saying that aloud.
  const opening = last?.role === 'assistant' && Date.now() - Date.parse(last.at) < 120_000 ? last.text : null;

  return (
    <div className="flex h-[calc(100dvh-8.5rem)] flex-col">
      <PageHeader title="Your companion" subtitle="Talk or type. It remembers what matters to you."
        action={
          <div className="flex gap-2">
            <button type="button" aria-label="What I remember" onClick={() => setRemembering(true)} className="flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-card"><BookHeart className="h-5 w-5" /></button>
            <button type="button" aria-label={aloud ? 'Stop reading replies aloud' : 'Read replies aloud'} onClick={toggleAloud}
              className={cx('flex h-11 w-11 items-center justify-center rounded-full shadow-card', aloud ? 'bg-brand text-white' : 'bg-white')}>{aloud ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}</button>
          </div>
        } />

      {offline && <p className="mb-3 rounded-2xl bg-warn-soft px-4 py-2.5 text-sm font-medium text-warn">The conversation service can't be reached right now, so replies are limited. Your messages are still saved.</p>}

      <div className="no-scrollbar -mx-1 flex-1 space-y-3 overflow-y-auto px-1 pb-3">
        {!entries && <Spinner />}
        {entries?.length === 0 && !sending && (
          <Empty icon={<Mic className="h-7 w-7" />} title={`Hello ${profile.name.split(' ')[0]}`}>
            <p>Tell me about your day, or ask me anything about Parkinson's or your own results. I can't give medical advice, but I can save questions for your doctor.</p>
          </Empty>
        )}
        {entries?.map((e) => e.kind === 'message' ? (
          <div key={e.id} className={cx('flex', e.message.role === 'user' ? 'justify-end' : 'justify-start')}>
            <p className={cx('max-w-[85%] whitespace-pre-wrap rounded-3xl px-4 py-3 text-[17px] leading-relaxed', e.message.role === 'user' ? 'rounded-br-lg bg-navy text-white' : 'rounded-bl-lg bg-white shadow-card')}>{e.message.text}</p>
          </div>
        ) : (
          <p key={e.id} className={cx('mx-auto w-fit max-w-[90%] rounded-2xl px-4 py-2 text-center text-sm font-semibold', e.doctor ? 'bg-calm-soft text-calm' : 'bg-good-soft text-good')}>{e.text}</p>
        ))}
        {sending && <div className="flex"><p className="rounded-3xl rounded-bl-lg bg-white px-5 py-3.5 shadow-card"><span className="inline-flex gap-1">{[0, 1, 2].map((i) => <span key={i} className="h-2 w-2 animate-bounce rounded-full bg-ink-faint" style={{ animationDelay: `${i * 120}ms` }} />)}</span></p></div>}
        {entries && messages.length <= 2 && !sending && (
          <div className="flex flex-wrap justify-center gap-2 pt-2">
            {ASK.map((q) => <button key={q} type="button" onClick={() => void send(q)} className="rounded-full bg-brand-soft px-4 py-2 text-sm font-semibold text-brand-deep">{q}</button>)}
          </div>
        )}
        {error && <ErrorNote>{error}</ErrorNote>}
        <div ref={end} />
      </div>

      <form onSubmit={(e: FormEvent) => { e.preventDefault(); void send(text); }} className="flex items-end gap-2 pt-2">
        <button type="button" aria-label="Talk out loud" onClick={() => { speaker.current?.stop(); setTalking(true); }}
          className="flex h-[3.25rem] shrink-0 items-center gap-2 rounded-full bg-navy px-5 font-bold text-white shadow-card"><Mic className="h-5 w-5" />Talk</button>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Or type here" maxLength={1200} className="min-h-[3.25rem] min-w-0 flex-1 !rounded-full !px-5" />
        <button type="submit" aria-label="Send" disabled={!text.trim() || sending} className="flex h-[3.25rem] w-[3.25rem] shrink-0 items-center justify-center rounded-full bg-brand text-white disabled:opacity-40"><SendHorizontal className="h-6 w-6" /></button>
      </form>

      {talking && (
        <Talk profile={profile} opening={opening} onClose={() => setTalking(false)}
          onTurn={(heard, out) => add([message({ id: `v${Date.now()}`, at: new Date().toISOString(), role: 'user', text: heard, via: 'voice' }), message(out.reply), ...savedEntries(out)])} />
      )}
      <Memories open={remembering} onClose={() => setRemembering(false)} onCleared={() => { opened.current = true; setEntries([]); }} />
    </div>
  );
}
