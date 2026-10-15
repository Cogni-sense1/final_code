import { createHmac, timingSafeEqual } from 'node:crypto';
import { type Profile, CONSENT_VERSION, DISCLAIMER, PROBLEM_COPY, STATUS_COPY } from '@neurovoice/shared';
import { blob, voice } from './adapters';
import { newProfile } from './auth';
import { createInvite, getDays, recordAssessment } from './domain/tracking';
import { env } from './env';
import { getProfile, newId, purgeUser, putProfile, userIdByPhone } from './repo';
import { getStore } from './store';
import { addDays, localDate, nowIso } from './time';

/** Twilio signs each webhook: HMAC-SHA1 over the URL plus every form field, sorted by name. */
export function validTwilioSignature(token: string, signature: string, url: string, form: Record<string, string>): boolean {
  const data = url + Object.keys(form).sort().map((k) => k + form[k]).join('');
  const expected = createHmac('sha1', token).update(data).digest();
  const given = Buffer.from(signature, 'base64');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

const CONSENT_TEXT =
  'Welcome to NeuroVoice. I can track changes in your voice over time from short voice notes. ' +
  'I keep measurements from your voice, not the recording itself. This is a screening aid, not a diagnosis. ' +
  'Reply YES to agree and begin, or ignore this message to opt out.';

const HELP =
  'Send a voice note saying "aaah" in a steady voice for about five seconds.\n' +
  'TREND: your last two weeks\nLINK: a code to share with a family member or doctor\nDELETE: erase everything I hold about you';

async function trend(p: Profile): Promise<string> {
  const today = localDate(nowIso(), p.timezone);
  const days = (await getDays(p.userId, addDays(today, -13), today)).filter((d) => Object.keys(d.modalities).length);
  if (!days.length) return 'No voice notes in the last two weeks yet. Send one to get started.';
  const scored = days.filter((d) => d.composite !== null);
  if (!scored.length) return `You have sent voice notes on ${days.length} days. A few more and I can show how you compare with your own usual.`;
  const count = (s: string): number => scored.filter((d) => d.status === s).length;
  return `Last two weeks: ${days.length} active days. Within your usual range on ${count('steady')}, a little off on ${count('watch')}, different on ${count('changed')}.\n${DISCLAIMER}`;
}

async function voiceNote(p: Profile, form: Record<string, string>): Promise<string> {
  const res = await fetch(form.MediaUrl0!, {
    headers: env.twilioSid ? { authorization: `Basic ${Buffer.from(`${env.twilioSid}:${env.twilioToken}`).toString('base64')}` } : {},
  });
  if (!res.ok) return 'I could not download that voice note. Please send it again.';
  const key = `${p.userId}/${localDate(nowIso(), p.timezone)}/${newId()}`;
  await blob.put(key, new Uint8Array(await res.arrayBuffer()), form.MediaContentType0 ?? 'audio/ogg');
  try {
    const result = await voice.analyze(key);
    if (!result.quality.usable) {
      return `${PROBLEM_COPY[result.quality.problems[0] ?? ''] ?? 'I could not use that recording.'} Please try once more.`;
    }
    const a = await recordAssessment(p, {
      type: 'voice', task: 'vowel', features: result.features, channel: 'whatsapp', durationS: result.quality.duration_s,
      quality: { usable: true, problems: [] },
    });
    const d = a.deviation;
    const line = d.status === 'building'
      ? `Got it. That is voice note ${d.sessionsInBaseline} of ${d.sessionsNeeded} needed to learn your usual voice.`
      : `Got it. Today: ${STATUS_COPY[d.status].label.toLowerCase()}.`;
    return `${line}\nSend one each day for the clearest picture. This is not a diagnosis.`;
  } finally {
    // WhatsApp tier never keeps recordings.
    await blob.delete(key).catch(() => undefined);
  }
}

/** Handle one inbound WhatsApp message and return the reply text. */
export async function handleWhatsApp(form: Record<string, string>): Promise<string> {
  const phone = (form.From ?? '').replace('whatsapp:', '');
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) return 'Sorry, I could not read your number.';
  const text = (form.Body ?? '').trim().toUpperCase();
  const store = getStore();
  const userId = await userIdByPhone(phone);
  const profile = userId ? await getProfile(userId) : undefined;

  if (!profile) {
    if (text !== 'YES') return CONSENT_TEXT;
    const fresh: Profile = {
      ...newProfile({ userId: newId(), role: 'patient', name: (form.ProfileName ?? 'Friend').slice(0, 80) }),
      phone, consent: { version: CONSENT_VERSION, acceptedAt: nowIso(), storeAudio: false, shareWithCareTeam: true },
    };
    await putProfile(fresh);
    return `Thank you, ${fresh.name.split(' ')[0]}. You are set up.\n${HELP}`;
  }

  if (Number(form.NumMedia ?? 0) > 0) {
    if (!(form.MediaContentType0 ?? '').startsWith('audio')) return 'I can only listen to voice notes. Please send a voice note.';
    return voiceNote(profile, form);
  }
  if (text === 'TREND') return trend(profile);
  if (text === 'LINK') {
    const { code } = await createInvite(profile);
    return `Share this code with the person you trust: ${code}\nThey enter it in the NeuroVoice app. It works for 48 hours.`;
  }
  if (text === 'DELETE') {
    await store.delete(`PHONE#${phone}`, 'PHONE');
    await purgeUser(profile.userId);
    return 'Everything I held about you has been erased. Send any message if you ever want to start again.';
  }
  return HELP;
}
