import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Assessment, Profile } from '@neurovoice/shared';
import { parseWav, sentNotices } from '../src/adapters';
import { spoken } from '../src/domain/companion';
import { createApp } from '../src/app';
import { env, REPO_ROOT } from '../src/env';
import { sweep } from '../src/jobs';
import { FileStore, setStore } from '../src/store';

const app = createApp();

async function call<T = any>(method: string, url: string, token?: string, body?: unknown): Promise<{ status: number; json: T }> {
  const res = await app.request(url, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: (await res.json().catch(() => null)) as T };
}

async function account(email: string, role: string, name: string): Promise<{ token: string; profile: Profile }> {
  const { json } = await call('POST', '/auth/signup', undefined, { email, password: 'correct-horse', name, role });
  return json;
}

const face = (blink: number, expressivity = 2.6, asymmetry = 0.03) => ({
  type: 'face', features: { blink_rate: blink, expressivity, asymmetry }, quality: { usable: true, problems: [] }, durationS: 30,
});

let patient: { token: string; profile: Profile };
let carer: { token: string; profile: Profile };
let stranger: { token: string; profile: Profile };

beforeAll(async () => {
  env.localDir = fs.mkdtempSync(path.join(REPO_ROOT, '.local', 'test-'));
  setStore(new FileStore(null));
  patient = await account('asha@example.com', 'patient', 'Asha Verma');
  carer = await account('ravi@example.com', 'caregiver', 'Ravi Verma');
  stranger = await account('eve@example.com', 'clinician', 'Eve Outsider');
});

describe('accounts and consent', () => {
  it('rejects requests without a token', async () => {
    expect((await call('GET', '/me')).status).toBe(401);
  });

  it('rejects a wrong password', async () => {
    expect((await call('POST', '/auth/login', undefined, { email: 'asha@example.com', password: 'nope' })).status).toBe(401);
  });

  it('blocks health data until the patient consents', async () => {
    expect((await call('POST', '/assessments', patient.token, face(16))).status).toBe(403);
    const { json } = await call<Profile>('POST', '/me/consent', patient.token, { storeAudio: false, shareWithCareTeam: true });
    expect(json.consent?.version).toBeTruthy();
  });
});

describe('personal baseline', () => {
  it('builds a baseline over five sessions, then flags a real change', async () => {
    const blinks = [16, 17, 15, 16, 18];
    let last!: Assessment;
    for (const b of blinks) last = (await call<Assessment>('POST', '/assessments', patient.token, face(b))).json;
    expect(last.deviation.status).toBe('building');
    expect(last.deviation.sessionsInBaseline).toBe(5);

    const steady = (await call<Assessment>('POST', '/assessments', patient.token, face(16))).json;
    expect(steady.deviation.status).toBe('steady');

    const changed = (await call<Assessment>('POST', '/assessments', patient.token, face(6, 0.9, 0.07))).json;
    expect(changed.deviation.status).toBe('changed');
    expect(changed.deviation.drivers[0]!.z).toBeGreaterThan(2);
    expect(changed.reference.level).toBe('elevated');
  });

  it('rejects malformed assessments', async () => {
    const bad = await call('POST', '/assessments', patient.token, { type: 'face', features: { blink_rate: 'fast' }, quality: { usable: true }, durationS: 30 });
    expect(bad.status).toBe(400);
  });

  it('refuses physically impossible readings, so a capture fault never reaches the trend', async () => {
    const spiral = (rmse: number) => ({ type: 'spiral', features: { rmse, tremor_index: 0.3, speed_cv: 40, mean_speed: 150 }, quality: { usable: true, problems: [] }, durationS: 12 });
    expect((await call('POST', '/assessments', patient.token, spiral(76088))).status).toBe(422);
    expect((await call('POST', '/assessments', patient.token, face(-4))).status).toBe(422);
    expect((await call('POST', '/assessments', patient.token, spiral(8))).status).toBe(200);
  });

  it('shows the day on the overview', async () => {
    const { json } = await call('GET', '/overview', patient.token);
    expect(json.streak).toBe(1);
    expect(json.todayProfile.modalities.face.sessions).toBe(7);
    expect(json.baselines[0].key).toBe('face');
  });
});

describe('care team access', () => {
  it('hides a patient from anyone who is not linked', async () => {
    expect((await call('GET', `/patients/${patient.profile.userId}/overview`, carer.token)).status).toBe(404);
  });

  it('links through an invite code and exposes read-only views', async () => {
    const invite = (await call('POST', '/care/invites', patient.token)).json;
    expect(invite.code).toHaveLength(6);
    expect((await call('POST', '/care/accept', carer.token, { code: 'WRONG1' })).status).toBe(404);
    expect((await call('POST', '/care/accept', carer.token, { code: invite.code })).status).toBe(200);
    // A code works once.
    expect((await call('POST', '/care/accept', stranger.token, { code: invite.code })).status).toBe(404);

    const rows = (await call('GET', '/patients', carer.token)).json;
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Asha Verma');
    expect((await call('GET', `/patients/${patient.profile.userId}/overview`, carer.token)).status).toBe(200);
    expect((await call('GET', `/patients/${patient.profile.userId}/overview`, stranger.token)).status).toBe(404);
  });

  it('lets the patient revoke access', async () => {
    const helper = await account('temp@example.com', 'caregiver', 'Temp Helper');
    const invite = (await call('POST', '/care/invites', patient.token)).json;
    await call('POST', '/care/accept', helper.token, { code: invite.code });
    await call('DELETE', `/care/team/${helper.profile.userId}`, patient.token);
    expect((await call('GET', `/patients/${patient.profile.userId}/overview`, helper.token)).status).toBe(404);
  });
});

describe('medication', () => {
  it('tracks doses, off periods, and alerts the care team', async () => {
    const med = (await call('POST', '/medications', patient.token, { name: 'Levodopa/Carbidopa', dose: 100, unit: 'mg', times: ['00:01'], levodopa: true })).json;
    let day = (await call('GET', '/medications/day', patient.token)).json;
    expect(day.schedule).toHaveLength(1);

    sentNotices.length = 0;
    const swept = await sweep();
    // 00:01 has passed by more than 90 minutes on any run after 01:31 local time.
    if (day.schedule[0].status === 'missed') {
      expect(swept.alerts).toBe(1);
      expect(sentNotices.some((n) => n.subject.includes('Missed medication') && n.email === 'ravi@example.com')).toBe(true);
    }

    await call('POST', '/doses', patient.token, { medicationId: med.id, scheduledTime: '00:01' });
    day = (await call('GET', '/medications/day', patient.token)).json;
    expect(day.schedule[0].status).toBe('taken');

    for (let i = 0; i < 3; i++) await call('POST', '/symptoms', patient.token, { state: 'off', tremor: 3, stiffness: 2, slowness: 3 });
    const alerts = (await call('GET', '/alerts', carer.token)).json;
    expect(alerts.some((a: any) => a.kind === 'frequent_off')).toBe(true);
    const insights = (await call('GET', '/medications/insights', patient.token)).json;
    expect(insights.offReports).toBe(3);
    expect(insights.peakLabel).toBeTruthy();
  });
});

describe('sleep', () => {
  it('scores a night and flags repeated dream enactment', async () => {
    const base = { bedtime: '22:30', wakeTime: '06:30', awakenings: 1 };
    const good = (await call('POST', '/sleep', patient.token, { ...base, date: '2026-10-01' })).json;
    expect(good.hours).toBe(8);
    expect(good.score).toBeGreaterThan(85);
    for (const date of ['2026-10-02', '2026-10-03', '2026-10-04']) {
      await call('POST', '/sleep', patient.token, { ...base, date, actedOutDreams: true, awakenings: 4 });
    }
    expect((await call('GET', '/alerts', patient.token)).json.some((a: any) => a.kind === 'rbd_pattern')).toBe(true);
  });
});

describe('companion', () => {
  it('replies and records what was said about the day', async () => {
    const { json } = await call('POST', '/companion/messages', patient.token, { text: 'I slept badly and my hands feel stiff today' });
    expect(json.reply.role).toBe('assistant');
    expect(json.reply.engine).toBe('local');
    expect(json.checkin.sleepQuality).toBe(2);
    expect(json.checkin.motorDifficulty).toBe(4);
    expect((await call('GET', '/overview', patient.token)).json.todayProfile.checkin.sleepQuality).toBe(2);
  });

  it('will not advise on medication', async () => {
    const { json } = await call('POST', '/companion/messages', patient.token, { text: 'Should I double my dose?' });
    expect(json.reply.text).toMatch(/doctor/i);
  });
});

describe('companion without the AI service', () => {
  const wav = (seconds: number): Uint8Array => {
    const data = new Uint8Array(Math.round(seconds * 16000) * 2);
    const head = new DataView(new ArrayBuffer(44));
    const text = (o: number, s: string): void => { for (let i = 0; i < s.length; i++) head.setUint8(o + i, s.charCodeAt(i)); };
    text(0, 'RIFF'); head.setUint32(4, 36 + data.length, true); text(8, 'WAVE'); text(12, 'fmt ');
    head.setUint32(16, 16, true); head.setUint16(20, 1, true); head.setUint16(22, 1, true);
    head.setUint32(24, 16000, true); head.setUint32(28, 32000, true); head.setUint16(32, 2, true); head.setUint16(34, 16, true);
    text(36, 'data'); head.setUint32(40, data.length, true);
    return new Uint8Array([...new Uint8Array(head.buffer), ...data]);
  };
  const voice = (body: Uint8Array): Promise<Response> | Response =>
    app.request('/companion/voice', { method: 'POST', headers: { authorization: `Bearer ${patient.token}`, 'content-type': 'audio/wav' }, body: new Blob([Buffer.from(body)]) });

  it('reads the recordings the web app sends, and rejects anything else', () => {
    const parsed = parseWav(wav(0.5));
    expect(parsed?.sampleRate).toBe(16000);
    expect(parsed?.pcm.length).toBe(16000);
    expect(parseWav(new Uint8Array(100))).toBeNull();
  });

  it('never passes model reasoning through to the person', () => {
    expect(spoken('<thinking>She mentioned sleep. I should ask more.</thinking> How did you sleep?')).toBe('How did you sleep?');
    expect(spoken('That sounds lovely.\n<thinking>unfinished')).toBe('That sounds lovely.');
  });

  it('says plainly that it is offline instead of pretending to converse', async () => {
    const { json } = await call('POST', '/companion/messages', patient.token, { text: 'Tell me about your day' });
    expect(json.reply.engine).toBe('local');
    expect(json.reply.text).toMatch(/can't reach/i);
    expect(json.remembered).toEqual([]);
    expect((await call('POST', '/companion/open', patient.token)).json.opened).toBeNull();
  });

  it('reports that speech is unavailable so the app can fall back', async () => {
    expect((await voice(new Uint8Array(200))).status).toBe(400);
    expect((await voice(wav(0.5))).status).toBe(501);
  });

  it('keeps private notes private and shares doctor questions only with the care team', async () => {
    expect((await call('GET', '/companion/memories', patient.token)).json).toEqual([]);
    expect((await call('DELETE', '/companion/memories/nope', patient.token)).status).toBe(404);
    expect((await call('GET', `/patients/${patient.profile.userId}/doctor-notes`, carer.token)).json).toEqual([]);
    expect((await call('GET', `/patients/${patient.profile.userId}/doctor-notes`, stranger.token)).status).toBe(404);
  });

  it('clears the conversation on request', async () => {
    expect((await call('DELETE', '/companion/messages', patient.token)).json.cleared).toBeGreaterThan(0);
    expect((await call('GET', '/companion/messages', patient.token)).json).toEqual([]);
  });
});

describe('community', () => {
  it('requires joining, hides real names, and blocks contact details', async () => {
    const { json } = await call('GET', '/community/groups', patient.token);
    expect(json.groups.find((g: any) => g.suggested).id).toBe('watchful');
    expect((await call('GET', '/community/groups/watchful/messages', patient.token)).status).toBe(403);
    await call('POST', '/community/groups/watchful/join', patient.token);
    const post = (await call('POST', '/community/groups/watchful/messages', patient.token, { text: 'Morning walks are helping me.' })).json;
    expect(post.handle).not.toContain('Asha');
    expect((await call('POST', '/community/groups/watchful/messages', patient.token, { text: 'call me on 98765 43210' })).status).toBe(422);
    expect((await call('GET', '/community/groups/watchful/messages', patient.token)).json).toHaveLength(1);
  });
});

describe('reports and data rights', () => {
  it('builds a monthly summary without claiming a diagnosis', async () => {
    const month = new Date().toISOString().slice(0, 7);
    const { json } = await call('POST', `/reports?month=${month}`, patient.token);
    expect(json.stats.assessments).toBeGreaterThanOrEqual(7);
    expect(json.summary).toMatch(/does not diagnose/);
  });

  it('exports and then erases everything', async () => {
    const temp = await account('gone@example.com', 'patient', 'Gone Soon');
    await call('POST', '/me/consent', temp.token, { storeAudio: false, shareWithCareTeam: false });
    await call('POST', '/assessments', temp.token, face(15));
    expect((await call('GET', '/me/export', temp.token)).json.items.length).toBeGreaterThan(2);
    expect((await call('DELETE', '/me', temp.token)).json.deleted).toBeGreaterThan(2);
    expect((await call('GET', '/me', temp.token)).status).toBe(401);
  });
});

describe('WhatsApp', () => {
  const form = async (fields: Record<string, string>): Promise<Response> =>
    app.request('/webhooks/whatsapp', { method: 'POST', body: new URLSearchParams({ From: 'whatsapp:+919812345678', ProfileName: 'Kamla Devi', ...fields }) });

  it('asks for consent before anything else, then onboards', async () => {
    expect(await (await form({ Body: 'hello' })).text()).toMatch(/Reply YES/);
    expect(await (await form({ Body: 'yes' })).text()).toMatch(/You are set up/);
    expect(await (await form({ Body: 'trend' })).text()).toMatch(/No voice notes/);
    expect(await (await form({ Body: 'link' })).text()).toMatch(/Share this code/);
  });

  it('erases on request', async () => {
    expect(await (await form({ Body: 'DELETE' })).text()).toMatch(/erased/);
    expect(await (await form({ Body: 'hello' })).text()).toMatch(/Reply YES/);
  });
});

describe('voice pipeline', () => {
  it('uploads a recording, runs Praat and the model, and discards audio without consent to keep it', async () => {
    const wav = fs.readFileSync(path.join(REPO_ROOT, 'ml', 'data', 'sample.wav'));
    const up = (await call('POST', '/voice/uploads', patient.token, { contentType: 'audio/wav' })).json;
    const put = await app.request(new URL(up.url).pathname, { method: 'PUT', headers: { authorization: `Bearer ${patient.token}`, 'content-type': 'audio/wav' }, body: wav });
    expect(put.status).toBe(200);
    // Someone else's key is refused.
    expect((await call('POST', '/voice/analyze', carer.token, { key: up.key, task: 'vowel' })).status).toBe(403);

    const { status, json } = await call('POST', '/voice/analyze', patient.token, { key: up.key, task: 'vowel' });
    expect(status).toBe(200);
    expect(json.assessment.features.jitter_local).toBeGreaterThan(0);
    expect(json.assessment.features.htn).toBeGreaterThan(0);
    expect(json.assessment.model.score).toBeGreaterThan(0);
    expect(json.assessment.model.score).toBeLessThan(1);
    expect(json.assessment.model.recordings).toBe(1);
    expect(json.topFactors.length).toBeGreaterThan(0);
    expect(json.assessment.audioKey).toBeUndefined();

    // A second recording is averaged with the first.
    const up2 = (await call('POST', '/voice/uploads', patient.token, { contentType: 'audio/wav' })).json;
    await app.request(new URL(up2.url).pathname, { method: 'PUT', headers: { authorization: `Bearer ${patient.token}`, 'content-type': 'audio/wav' }, body: wav });
    const second = (await call('POST', '/voice/analyze', patient.token, { key: up2.key, task: 'reading', sentence: 0 })).json;
    expect(second.assessment.model.recordings).toBe(2);
    expect(second.assessment.features.speech_rate).toBeGreaterThan(0);
    expect(fs.existsSync(path.join(env.localDir, 'audio', up.key))).toBe(false);
  }, 60_000);
});
