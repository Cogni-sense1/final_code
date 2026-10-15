import { Download, LogOut, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { voiceModelNote } from '@neurovoice/shared';
import { api, errorText, useAuth, useProfile } from '../lib/api';
import { Button, Card, DemoBadge, Disclaimer, ErrorNote, Field, fmtDate, PageHeader, SectionTitle, Sheet, Toggle } from '../ui';

export default function Profile() {
  const profile = useProfile();
  const { setProfile, signOut } = useAuth();
  const patient = profile.role === 'patient';
  const [name, setName] = useState(profile.name);
  const [phone, setPhone] = useState(profile.phone ?? '');
  const [stage, setStage] = useState(String(profile.hoehnYahr));
  const [locale, setLocale] = useState(profile.locale.startsWith('hi') ? 'hi-IN' : 'en-IN');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [typed, setTyped] = useState('');

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

  const save = () => run('save', async () => {
    const hy = Number(stage) as 0 | 1 | 1.5 | 2 | 2.5 | 3 | 4 | 5;
    setProfile(await api.updateMe({ name: name.trim(), locale, ...(phone.trim() ? { phone: phone.trim() } : {}), ...(patient ? { hoehnYahr: hy, diagnosed: hy > 0 } : {}) }));
    setSaved(true);
  });
  const setConsent = (patch: { storeAudio?: boolean; shareWithCareTeam?: boolean }) => run('consent', async () => {
    setProfile(await api.consent({ storeAudio: profile.consent?.storeAudio ?? false, shareWithCareTeam: profile.consent?.shareWithCareTeam ?? false, ...patch }));
  });
  const exportData = () => run('export', async () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(await api.exportData(), null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `neurovoice-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  return (
    <div className="mx-auto max-w-xl animate-rise">
      <PageHeader title="Account" back={patient ? '/' : undefined} action={profile.synthetic ? <DemoBadge /> : undefined} />
      {error && <div className="mb-3"><ErrorNote>{error}</ErrorNote></div>}

      <Card className="space-y-4">
        <Field label="Name"><input className="w-full" value={name} onChange={(e) => { setName(e.target.value); setSaved(false); }} /></Field>
        <Field label="Mobile number" hint={patient ? 'With country code. Lets you send voice notes over WhatsApp.' : 'With country code. Used to text you alerts.'}>
          <input className="w-full" inputMode="tel" placeholder="+91…" value={phone} onChange={(e) => { setPhone(e.target.value.replace(/[^\d+]/g, '')); setSaved(false); }} />
        </Field>
        <Field label="Language for talking" hint="Used when you speak with your companion and when replies are read aloud.">
          <select className="w-full" value={locale} onChange={(e) => { setLocale(e.target.value); setSaved(false); }}>
            <option value="en-IN">English</option>
            <option value="hi-IN">हिन्दी (Hindi)</option>
          </select>
        </Field>
        {patient && (
          <Field label="Hoehn & Yahr stage" hint="Used to suggest a peer group.">
            <select className="w-full" value={stage} onChange={(e) => { setStage(e.target.value); setSaved(false); }}>
              <option value="0">No diagnosis</option>
              {['1', '1.5', '2', '2.5', '3', '4', '5'].map((s) => <option key={s} value={s}>Stage {s}</option>)}
            </select>
          </Field>
        )}
        <Button busy={busy === 'save'} disabled={!name.trim()} onClick={save}>{saved ? 'Saved' : 'Save changes'}</Button>
        <p className="text-sm text-ink-faint">{profile.email} · {profile.role}</p>
      </Card>

      {patient && (
        <>
          <SectionTitle>Privacy</SectionTitle>
          <Card className="space-y-4">
            <Toggle checked={profile.consent?.shareWithCareTeam ?? false} onChange={(v) => setConsent({ shareWithCareTeam: v })} label="Allow a care team" hint="Turning this off removes everyone who currently has access." />
            <Toggle checked={profile.consent?.storeAudio ?? false} onChange={(v) => setConsent({ storeAudio: v })} label="Keep voice recordings for 30 days" hint="When off, recordings are deleted as soon as they are measured." />
            {profile.consent && <p className="text-xs text-ink-faint">Consent version {profile.consent.version}, given {fmtDate(profile.consent.acceptedAt, { day: 'numeric', month: 'long', year: 'numeric' })}.</p>}
          </Card>

          <SectionTitle>About the voice score</SectionTitle>
          <Card><p className="text-sm leading-relaxed text-ink-soft">{voiceModelNote()}</p></Card>
        </>
      )}

      <SectionTitle>Your data</SectionTitle>
      <div className="space-y-2.5">
        <Button variant="secondary" full busy={busy === 'export'} onClick={exportData}><Download className="h-5 w-5" />Download everything</Button>
        <Button variant="secondary" full onClick={signOut}><LogOut className="h-5 w-5" />Sign out</Button>
        <Button variant="danger" full onClick={() => setConfirm(true)}><Trash2 className="h-5 w-5" />Delete my account</Button>
      </div>
      <Disclaimer />

      <Sheet open={confirm} onClose={() => setConfirm(false)} title="Delete everything?">
        <p className="text-ink-soft">This permanently erases your profile, every check, your medication and sleep logs, and your conversations. It cannot be undone.</p>
        <div className="mt-4"><Field label='Type "delete" to confirm'><input className="w-full" value={typed} onChange={(e) => setTyped(e.target.value)} /></Field></div>
        <div className="mt-5 flex gap-3">
          <Button variant="secondary" onClick={() => setConfirm(false)}>Cancel</Button>
          <Button variant="danger" full busy={busy === 'delete'} disabled={typed.trim().toLowerCase() !== 'delete'} onClick={() => run('delete', async () => { await api.deleteAccount(); signOut(); })}>Delete permanently</Button>
        </div>
      </Sheet>
    </div>
  );
}
