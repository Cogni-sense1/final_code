import { Camera, Lock, Mic, ShieldCheck, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { api, errorText, useAuth } from '../lib/api';
import { Button, Card, ErrorNote, Field, Segmented, Toggle } from '../ui';
import { Logo } from './Auth';

const POINTS = [
  { icon: Camera, title: 'Video never leaves your device', text: 'Face, hand, and walking checks are measured on your phone. Only the numbers are saved.' },
  { icon: Mic, title: 'Voice is measured, then discarded', text: 'Recordings are analysed and deleted unless you choose to keep them below.' },
  { icon: Lock, title: 'You decide who sees your data', text: 'Family or doctors can only see it with a code you give them, and you can remove them any time.' },
  { icon: Trash2, title: 'Leave whenever you want', text: 'Download or permanently erase everything from your account page.' },
];

export default function Onboarding() {
  const { profile, setProfile, signOut } = useAuth();
  const [step, setStep] = useState(0);
  const [storeAudio, setStoreAudio] = useState(false);
  const [share, setShare] = useState(true);
  const [agree, setAgree] = useState(false);
  const [diagnosed, setDiagnosed] = useState<'no' | 'yes'>('no');
  const [stage, setStage] = useState('2');
  const [birthYear, setBirthYear] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function finish() {
    setBusy(true);
    setError('');
    try {
      const year = Number(birthYear);
      await api.updateMe({
        diagnosed: diagnosed === 'yes',
        hoehnYahr: (diagnosed === 'yes' ? Number(stage) : 0) as 0 | 1 | 1.5 | 2 | 2.5 | 3 | 4 | 5,
        ...(year >= 1900 && year <= new Date().getFullYear() ? { birthYear: year } : {}),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      setProfile(await api.consent({ storeAudio, shareWithCareTeam: share }));
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-6 py-8">
      <div className="flex items-center justify-between">
        <Logo />
        <button type="button" onClick={signOut} className="text-sm font-semibold text-ink-soft">Sign out</button>
      </div>

      {step === 0 ? (
        <div className="mt-8 flex flex-1 flex-col animate-rise">
          <h1 className="text-3xl font-extrabold tracking-tight">Hello {profile?.name.split(' ')[0]}. Before we start</h1>
          <p className="mt-2 text-ink-soft">Here is exactly what NeuroVoice does with your information.</p>
          <div className="mt-6 space-y-3">
            {POINTS.map(({ icon: Icon, title, text }) => (
              <Card key={title} className="flex gap-4 !p-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-deep"><Icon className="h-5 w-5" /></span>
                <div><p className="font-bold">{title}</p><p className="mt-0.5 text-sm text-ink-soft">{text}</p></div>
              </Card>
            ))}
          </div>
          <Card className="mt-3 space-y-4 !p-4">
            <Toggle checked={share} onChange={setShare} label="Let me invite family or my doctor" hint="Nobody is added until you share a code with them." />
            <Toggle checked={storeAudio} onChange={setStoreAudio} label="Keep my voice recordings for 30 days" hint="Off by default. Only measurements are kept." />
          </Card>
          <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-2xl bg-navy p-4 text-white">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1 h-5 w-5 shrink-0 rounded accent-brand !p-0" />
            <span className="text-sm leading-relaxed">
              <ShieldCheck className="mb-1 inline h-4 w-4 text-brand-mid" /> I understand NeuroVoice is a screening and monitoring aid, not a diagnosis, and I agree to my data being used as described above.
            </span>
          </label>
          <div className="mt-auto pt-6"><Button full disabled={!agree} onClick={() => setStep(1)}>Continue</Button></div>
        </div>
      ) : (
        <div className="mt-8 flex flex-1 flex-col animate-rise">
          <h1 className="text-3xl font-extrabold tracking-tight">A little about you</h1>
          <p className="mt-2 text-ink-soft">This sets up the right checks and peer group. You can change it later.</p>
          <div className="mt-6 space-y-5">
            <Field label="Have you been diagnosed with Parkinson's?">
              <Segmented value={diagnosed} onChange={setDiagnosed} options={[{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes' }]} />
            </Field>
            {diagnosed === 'yes' && (
              <Field label="Hoehn & Yahr stage" hint="Your neurologist will know this. A best guess is fine.">
                <select className="w-full" value={stage} onChange={(e) => setStage(e.target.value)}>
                  {['1', '1.5', '2', '2.5', '3', '4', '5'].map((s) => <option key={s} value={s}>Stage {s}</option>)}
                </select>
              </Field>
            )}
            <Field label="Year of birth (optional)">
              <input className="w-full" inputMode="numeric" placeholder="e.g. 1958" value={birthYear} onChange={(e) => setBirthYear(e.target.value.replace(/\D/g, '').slice(0, 4))} />
            </Field>
          </div>
          {error && <div className="mt-4"><ErrorNote>{error}</ErrorNote></div>}
          <div className="mt-auto flex gap-3 pt-6">
            <Button variant="secondary" onClick={() => setStep(0)}>Back</Button>
            <Button full busy={busy} onClick={finish}>Start my first check</Button>
          </div>
        </div>
      )}
    </div>
  );
}
