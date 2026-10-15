import { HeartHandshake, Stethoscope, UserRound } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import type { Role } from '@neurovoice/shared';
import { errorText, useAuth } from '../lib/api';
import { Button, cx, Disclaimer, ErrorNote, Field } from '../ui';

const ROLES: { value: Role; label: string; hint: string; icon: typeof UserRound }[] = [
  { value: 'patient', label: 'For myself', hint: 'Track my own voice and movement', icon: UserRound },
  { value: 'caregiver', label: 'Family or carer', hint: 'Keep an eye on someone I care for', icon: HeartHandshake },
  { value: 'clinician', label: 'Clinician', hint: 'Follow my patients between visits', icon: Stethoscope },
];

export function Logo({ light }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <img src="/icon.svg" alt="" className="h-10 w-10 rounded-xl" />
      <span className={cx('text-xl font-extrabold tracking-tight', light && 'text-white')}>NeuroVoice</span>
    </div>
  );
}

export default function Auth() {
  const auth = useAuth();
  const [mode, setMode] = useState<'in' | 'up' | 'code'>('in');
  const [role, setRole] = useState<Role>('patient');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const local = auth.config?.authMode === 'local';

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (mode === 'in') await auth.signIn(email.trim(), password);
      else if (mode === 'up') {
        if (await auth.signUp({ email: email.trim(), password, name: name.trim(), role })) setMode('code');
      } else await auth.confirm(email.trim(), code.trim(), password);
    } catch (err) {
      setError(errorText(err));
    }
    setBusy(false);
  }

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-2">
      <aside className="relative hidden overflow-hidden bg-navy p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <Logo light />
        <div>
          <h1 className="text-4xl font-extrabold leading-tight tracking-tight">Small changes are easier to catch when you look every day.</h1>
          <p className="mt-5 max-w-md text-lg text-white/70">
            Two minutes of voice, face, and movement checks build a picture of what is usual for you, so a real change stands out early.
          </p>
        </div>
        <p className="text-sm text-white/50">A screening and monitoring aid. Not a diagnosis.</p>
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-brand/20 blur-3xl" />
      </aside>

      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-10">
        <div className="mb-8 lg:hidden"><Logo /></div>
        <h2 className="text-3xl font-extrabold tracking-tight">{mode === 'in' ? 'Welcome back' : mode === 'up' ? 'Create your account' : 'Check your email'}</h2>
        <p className="mt-1.5 text-ink-soft">
          {mode === 'in' ? 'Sign in to continue your daily checks.' : mode === 'up' ? 'It takes less than a minute.' : `Enter the code we sent to ${email}.`}
        </p>

        <form onSubmit={submit} className="mt-7 space-y-4">
          {mode === 'up' && (
            <>
              <div className="grid gap-2">
                {ROLES.map(({ value, label, hint, icon: Icon }) => (
                  <button key={value} type="button" onClick={() => setRole(value)}
                    className={cx('flex items-center gap-3.5 rounded-2xl border-2 bg-white p-3.5 text-left transition', role === value ? 'border-brand' : 'border-transparent shadow-card')}>
                    <span className={cx('flex h-11 w-11 items-center justify-center rounded-xl', role === value ? 'bg-brand text-white' : 'bg-brand-soft text-brand-deep')}><Icon className="h-5 w-5" /></span>
                    <span><span className="block font-bold">{label}</span><span className="block text-sm text-ink-soft">{hint}</span></span>
                  </button>
                ))}
              </div>
              <Field label="Your name"><input className="w-full" required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></Field>
            </>
          )}
          {mode !== 'code' ? (
            <>
              <Field label="Email"><input className="w-full" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></Field>
              <Field label="Password" hint={mode === 'up' ? 'At least 10 characters with a number.' : undefined}>
                <input className="w-full" type="password" required minLength={mode === 'up' ? 10 : 1} value={password} onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === 'in' ? 'current-password' : 'new-password'} />
              </Field>
            </>
          ) : (
            <Field label="Confirmation code"><input className="w-full tracking-[.4em]" inputMode="numeric" required value={code} onChange={(e) => setCode(e.target.value)} /></Field>
          )}
          {error && <ErrorNote>{error}</ErrorNote>}
          <Button type="submit" full busy={busy}>{mode === 'in' ? 'Sign in' : mode === 'up' ? 'Create account' : 'Confirm'}</Button>
        </form>

        {mode !== 'code' && (
          <p className="mt-6 text-center text-ink-soft">
            {mode === 'in' ? 'New here?' : 'Already have an account?'}{' '}
            <button type="button" className="font-bold text-brand-deep" onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setError(''); }}>
              {mode === 'in' ? 'Create an account' : 'Sign in'}
            </button>
          </p>
        )}

        {local && mode === 'in' && (
          <div className="mt-8 rounded-2xl bg-calm-soft p-4 text-sm text-ink-soft">
            <p className="font-bold text-ink">Running locally with demo data</p>
            <p className="mt-1">After <code>npm run seed</code>, try one of these. The password is in the seed output.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {['meera', 'vikram', 'arjun', 'dr.rao'].map((u) => (
                <button key={u} type="button" onClick={() => setEmail(`${u}@demo.neurovoice`)} className="rounded-full bg-white px-3 py-1.5 font-semibold text-ink shadow-card">{u}</button>
              ))}
            </div>
          </div>
        )}
        <Disclaimer />
      </div>
    </div>
  );
}
