import { Bell, Check, ChevronRight, Flame, HeartHandshake, MessageCircleHeart, Mic, Moon, Hand, ScanFace, Users } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { STATUS_COPY } from '@neurovoice/shared';
import { api, useLoad, useProfile } from '../lib/api';
import { Button, Card, cx, DemoBadge, Disclaimer, ErrorNote, fmtDate, Ring, SectionTitle, Spinner, time12, TONE } from '../ui';

const CORE = [
  { key: 'voice:vowel', to: '/check/voice', label: 'Voice', hint: 'Two short recordings', icon: Mic },
  { key: 'face', to: '/check/face', label: 'Face', hint: '30 seconds', icon: ScanFace },
  { key: 'tap', to: '/check/tap', label: 'Finger tapping', hint: '12 seconds per hand', icon: Hand },
];

const greeting = (): string => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

export default function Home() {
  const profile = useProfile();
  const nav = useNavigate();
  const { data, error, loading, reload } = useLoad(() => api.overview());
  const [logging, setLogging] = useState('');

  if (loading && !data) return <Spinner />;
  if (error || !data) return <ErrorNote>{error}</ErrorNote>;

  const today = data.todayProfile;
  const done = CORE.filter((c) => today?.modalities[c.key]);
  const status = today?.status ?? 'building';
  const tone = TONE[status];
  const due = data.schedule.filter((s) => s.status === 'due' || s.status === 'missed');
  const nextUp = data.schedule.find((s) => s.status === 'upcoming');

  async function take(medicationId: string, time: string) {
    setLogging(medicationId + time);
    await api.logDose(medicationId, time).catch(() => undefined);
    setLogging('');
    reload();
  }

  return (
    <div className="animate-rise">
      <header className="mb-5">
        <div className="flex items-center gap-2.5">
          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-soft">{fmtDate(data.today, { weekday: 'long', day: 'numeric', month: 'short' })}</p>
          {profile.synthetic && <DemoBadge />}
          <Link to="/alerts" aria-label="Alerts" className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white shadow-card">
            <Bell className="h-5 w-5" />
            {data.unreadAlerts > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-alert px-1 text-[11px] font-bold text-white">{data.unreadAlerts}</span>}
          </Link>
          <Link to="/profile" aria-label="Account" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-navy font-bold text-white">{profile.name[0]}</Link>
        </div>
        <h1 className="mt-2 text-[1.7rem] font-extrabold leading-tight tracking-tight">{greeting()}, {profile.name.split(' ')[0]}</h1>
      </header>

      <section className="relative overflow-hidden rounded-xl3 bg-navy p-6 text-white shadow-lift">
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-brand/25 blur-3xl" />
        <div className="relative flex items-center gap-5">
          <Ring value={done.length / CORE.length} size={112} stroke={11} color={done.length === CORE.length ? '#5FD3A9' : '#F0803C'}>
            <span className="text-3xl font-extrabold leading-none">{done.length}<span className="text-lg text-white/60">/{CORE.length}</span></span>
            <span className="mt-0.5 text-[11px] font-semibold uppercase tracking-wider text-white/60">checks</span>
          </Ring>
          <div className="min-w-0">
            <p className="text-sm font-semibold uppercase tracking-wider text-white/60">Today</p>
            <p className="mt-1 text-xl font-extrabold leading-snug">
              {done.length === 0 ? 'Ready when you are' : today?.composite == null ? 'Building your baseline' : STATUS_COPY[status].label}
            </p>
            <p className="mt-1 text-sm text-white/70">
              {done.length === 0 ? 'Three quick checks, about two minutes.' : today?.composite == null ? 'A few more days and we can compare you with your own usual.' : 'Compared with your own baseline, not other people.'}
            </p>
          </div>
        </div>
        <div className="relative mt-5 flex items-center justify-between border-t border-white/10 pt-4">
          <span className="flex items-center gap-2 font-semibold"><Flame className={cx('h-5 w-5', data.streak ? 'text-brand' : 'text-white/40')} />{data.streak ? `${data.streak} day streak` : 'Start a streak today'}</span>
          <Link to="/trends" className="flex items-center gap-1 text-sm font-semibold text-brand-mid">See trend <ChevronRight className="h-4 w-4" /></Link>
        </div>
      </section>

      <SectionTitle action={<Link to="/checks" className="text-sm font-bold text-brand-deep">All checks</Link>}>Today's checks</SectionTitle>
      <div className="space-y-2.5">
        {CORE.map(({ key, to, label, hint, icon: Icon }) => {
          const isDone = !!today?.modalities[key];
          return (
            <Card key={key} className="flex items-center gap-4 !p-4" onClick={() => nav(to)}>
              <span className={cx('flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl', isDone ? 'bg-good-soft text-good' : 'bg-brand-soft text-brand-deep')}>
                {isDone ? <Check className="h-6 w-6" strokeWidth={3} /> : <Icon className="h-6 w-6" />}
              </span>
              <span className="flex-1"><span className="block text-lg font-bold leading-tight">{label}</span><span className="text-sm text-ink-soft">{isDone ? 'Done today' : hint}</span></span>
              <ChevronRight className="h-5 w-5 text-ink-faint" />
            </Card>
          );
        })}
      </div>

      {(due.length > 0 || nextUp) && (
        <>
          <SectionTitle action={<Link to="/meds" className="text-sm font-bold text-brand-deep">Medication</Link>}>Medication</SectionTitle>
          <div className="space-y-2.5">
            {due.map((s) => (
              <Card key={s.medicationId + s.time} className={cx('flex items-center gap-3 !p-4', s.status === 'missed' && 'ring-2 ring-alert/30')}>
                <div className="flex-1">
                  <p className="font-bold">{s.name} <span className="font-medium text-ink-soft">{s.dose} {s.unit}</span></p>
                  <p className={cx('text-sm font-semibold', s.status === 'missed' ? 'text-alert' : 'text-warn')}>{s.status === 'missed' ? 'Not logged' : 'Due now'} · {time12(s.time)}</p>
                </div>
                <Button className="!min-h-[2.75rem] !px-4" busy={logging === s.medicationId + s.time} onClick={() => take(s.medicationId, s.time)}>Taken</Button>
              </Card>
            ))}
            {!due.length && nextUp && (
              <Card className="!p-4"><p className="text-sm text-ink-soft">Next dose</p><p className="font-bold">{nextUp.name} at {time12(nextUp.time)}</p></Card>
            )}
          </div>
        </>
      )}

      <SectionTitle>More</SectionTitle>
      <div className="grid grid-cols-2 gap-2.5">
        {[
          { to: '/companion', label: 'Daily check-in', hint: 'Talk about your day', icon: MessageCircleHeart },
          { to: '/sleep', label: 'Sleep', hint: today?.sleepScore != null ? `Last night: ${today.sleepScore}` : 'Log last night', icon: Moon },
          { to: '/community', label: 'Community', hint: 'People at your stage', icon: Users },
          { to: '/care', label: 'Care team', hint: 'Family and doctors', icon: HeartHandshake },
        ].map(({ to, label, hint, icon: Icon }) => (
          <Card key={to} className="!p-4" onClick={() => nav(to)}>
            <Icon className="h-6 w-6 text-brand-deep" />
            <p className="mt-3 font-bold leading-tight">{label}</p>
            <p className="text-sm text-ink-soft">{hint}</p>
          </Card>
        ))}
      </div>
      <Disclaimer />
    </div>
  );
}
