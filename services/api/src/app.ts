import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { z, type ZodTypeAny } from 'zod';
import {
  type Alert, type Baseline, type Profile,
  AssessmentInput, AssessmentType, ChatInput, CONSENT_VERSION, ConsentInput, DoseInput, DystoniaInput, GroupMessageInput,
  implausible, LoginInput, MedicationInput, MODALITIES, ProfileUpdate, SignupInput, SleepInput, SymptomInput, VOICE_SENTENCES, baselineKey, round,
} from '@neurovoice/shared';
import { blob, parseWav, speech, voice } from './adapters';
import { localLogin, localSignup, localToken, me, requireConsent, requireUser, type Vars } from './auth';
import { chatHistory, deleteMemory, listMemories, openConversation, sendMessage } from './domain/companion';
import * as health from './domain/health';
import * as social from './domain/social';
import * as tracking from './domain/tracking';
import { env, isLocal } from './env';
import { getProfile, list, newId, purgeUser, putProfile } from './repo';
import { getStore } from './store';
import { addDays, daysAgoIso, localDate, nowIso } from './time';
import { handleWhatsApp, validTwilioSignature } from './whatsapp';

type Ctx = Context<Vars & { Variables: { subject: Profile } }>;

function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const out = schema.safeParse(data);
  if (!out.success) throw new HTTPException(400, { message: out.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') });
  return out.data;
}
const body = async <S extends ZodTypeAny>(c: Context, schema: S): Promise<z.infer<S>> => parse(schema, await c.req.json().catch(() => ({})));
const intParam = (c: Context, name: string, fallback: number, max: number): number =>
  Math.min(max, Math.max(1, Number(c.req.query(name)) || fallback));

// ── Read-only views of one person's data ─────────────────────────────────────
// Mounted twice: at / for the signed-in user, and at /patients/:pid for a linked care-team member.

function views(): Hono<Vars & { Variables: { subject: Profile } }> {
  const v = new Hono<Vars & { Variables: { subject: Profile } }>();

  v.get('/overview', async (c: Ctx) => {
    const p = c.get('subject');
    const today = localDate(nowIso(), p.timezone);
    const days = await tracking.getDays(p.userId, addDays(today, -44), today);
    const recent = await tracking.listAssessments(p.userId, { sinceIso: daysAgoIso(45) });
    const latest: Record<string, (typeof recent)[number]> = {};
    for (const a of recent) latest[baselineKey(a.type, a.task)] ??= a;

    let streak = 0;
    const active = new Set(days.filter((d) => Object.keys(d.modalities).length).map((d) => d.date));
    for (let d = active.has(today) ? today : addDays(today, -1); active.has(d); d = addDays(d, -1)) streak++;

    const alerts = await list<Alert>(p.userId, { prefix: 'ALERT#', desc: true, limit: 30 });
    return c.json({
      profile: p, today, days, latest, streak,
      todayProfile: days.find((d) => d.date === today) ?? null,
      baselines: await list<Baseline>(p.userId, { prefix: 'BASELINE#' }),
      schedule: (await health.medicationDay(p)).schedule,
      unreadAlerts: alerts.filter((a) => !a.read).length,
    });
  });

  v.get('/assessments', async (c: Ctx) => {
    const type = c.req.query('type');
    return c.json(await tracking.listAssessments(c.get('subject').userId, {
      type: type ? parse(AssessmentType, type) : undefined, limit: intParam(c, 'limit', 60, 300),
    }));
  });

  v.get('/medications', async (c: Ctx) => c.json(await health.listMedications(c.get('subject').userId)));
  v.get('/medications/day', async (c: Ctx) => c.json(await health.medicationDay(c.get('subject'), c.req.query('date'))));
  v.get('/medications/insights', async (c: Ctx) => c.json(await health.insights(c.get('subject'), intParam(c, 'days', 14, 90))));
  v.get('/sleep', async (c: Ctx) => c.json(await health.listSleep(c.get('subject').userId, intParam(c, 'days', 30, 120))));
  v.get('/dystonia', async (c: Ctx) => c.json(await health.listDystonia(c.get('subject').userId, intParam(c, 'days', 30, 120))));
  v.get('/reports', async (c: Ctx) => c.json(await social.listReports(c.get('subject').userId)));
  // Questions the person asked the companion to save for their doctor. Personal notes stay private.
  v.get('/doctor-notes', async (c: Ctx) => c.json((await listMemories(c.get('subject').userId)).filter((m) => m.kind === 'doctor').reverse()));
  v.post('/reports', async (c: Ctx) => {
    const month = c.req.query('month') ?? localDate(nowIso(), c.get('subject').timezone).slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) throw new HTTPException(400, { message: 'month must be YYYY-MM' });
    return c.json(await social.buildReport(c.get('subject'), month));
  });
  return v;
}

export function createApp(): Hono<Vars> {
  const app = new Hono<Vars>();

  app.use('*', cors({ origin: (origin) => (isLocal() ? origin : env.webOrigin), allowHeaders: ['authorization', 'content-type'], maxAge: 600 }));
  app.onError((err, c) => {
    if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
    console.error(err);
    return c.json({ error: 'internal_error' }, 500);
  });

  app.get('/health', (c) => c.json({ ok: true, mode: env.mode }));
  app.get('/config', (c) => c.json({
    authMode: isLocal() ? 'local' : 'cognito',
    region: env.region, userPoolId: env.userPoolId, userPoolClientId: env.userPoolClientId,
    companionEngine: env.awsAi ? 'bedrock' : 'local',
    consentVersion: CONSENT_VERSION, sentences: VOICE_SENTENCES,
  }));

  // ── Local sign-in ──────────────────────────────────────────────────────────
  if (isLocal()) {
    app.post('/auth/signup', async (c) => {
      const profile = await localSignup(await body(c, SignupInput));
      if (!profile) throw new HTTPException(409, { message: 'An account with that email already exists.' });
      return c.json({ token: await localToken(profile.userId), profile });
    });
    app.post('/auth/login', async (c) => {
      const input = await body(c, LoginInput);
      const profile = await localLogin(input.email, input.password);
      if (!profile) throw new HTTPException(401, { message: 'Wrong email or password.' });
      return c.json({ token: await localToken(profile.userId), profile });
    });
  }

  // ── WhatsApp (Twilio) ──────────────────────────────────────────────────────
  app.post('/webhooks/whatsapp', async (c) => {
    const form = Object.fromEntries(Object.entries(await c.req.parseBody()).map(([k, v]) => [k, String(v)]));
    const url = env.publicUrl ? `${env.publicUrl}/webhooks/whatsapp` : c.req.url;
    if (env.twilioToken && !validTwilioSignature(env.twilioToken, c.req.header('x-twilio-signature') ?? '', url, form)) {
      throw new HTTPException(403, { message: 'bad signature' });
    }
    if (!env.twilioToken && !isLocal()) throw new HTTPException(503, { message: 'WhatsApp is not configured' });
    const reply = await handleWhatsApp(form);
    const escaped = reply.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return c.body(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escaped}</Message></Response>`, 200, { 'content-type': 'text/xml' });
  });

  // Everything below needs a signed-in user.
  app.use('*', requireUser);

  // ── Profile, consent, data rights ──────────────────────────────────────────
  app.get('/me', (c) => c.json(me(c)));
  app.put('/me', async (c) => {
    const next = { ...me(c), ...(await body(c, ProfileUpdate)) };
    await putProfile(next);
    return c.json(next);
  });
  app.post('/me/consent', async (c) => {
    const input = await body(c, ConsentInput);
    const next = { ...me(c), consent: { ...input, version: CONSENT_VERSION, acceptedAt: nowIso() } };
    await putProfile(next);
    if (!input.shareWithCareTeam) for (const link of await tracking.careTeam(next.userId)) await tracking.revokeLink(next.userId, link.memberId);
    return c.json(next);
  });
  app.get('/me/export', async (c) => {
    const items = await getStore().query(`USER#${me(c).userId}`);
    return c.json({ exportedAt: nowIso(), items: items.map(({ pk: _pk, gsi1pk: _g, gsi1sk: _s, ...rest }) => rest) });
  });
  app.delete('/me', async (c) => {
    const p = me(c);
    for (const link of await tracking.careTeam(p.userId)) await tracking.revokeLink(p.userId, link.memberId);
    for (const link of await tracking.patientsOf(p.userId)) await tracking.revokeLink(link.patientId, p.userId);
    const store = getStore();
    if (p.phone) await store.delete(`PHONE#${p.phone}`, 'PHONE');
    if (p.email) await store.delete(`EMAIL#${p.email}`, 'AUTH');
    return c.json({ deleted: await purgeUser(p.userId) });
  });

  // ── Care team ──────────────────────────────────────────────────────────────
  app.get('/care/team', async (c) => c.json(await tracking.careTeam(me(c).userId)));
  app.post('/care/invites', async (c) => {
    const p = me(c);
    if (p.role !== 'patient') throw new HTTPException(403, { message: 'Only the person being monitored can invite others.' });
    if (!p.consent?.shareWithCareTeam) throw new HTTPException(403, { message: 'Turn on sharing in your privacy settings first.' });
    return c.json(await tracking.createInvite(p));
  });
  app.post('/care/accept', async (c) => {
    const { code } = await body(c, z.object({ code: z.string().min(4).max(12) }));
    const link = await tracking.acceptInvite(me(c), code);
    if (!link) throw new HTTPException(404, { message: 'That code is not valid or has expired.' });
    return c.json(link);
  });
  app.delete('/care/team/:memberId', async (c) => {
    await tracking.revokeLink(me(c).userId, c.req.param('memberId'));
    return c.json({ ok: true });
  });

  app.get('/patients', async (c) => {
    const links = await tracking.patientsOf(me(c).userId);
    const rows = await Promise.all(links.map(async (link) => {
      const p = await getProfile(link.patientId);
      if (!p) return null;
      const today = localDate(nowIso(), p.timezone);
      const days = await tracking.getDays(p.userId, addDays(today, -13), today);
      const last = [...days].reverse().find((d) => d.composite !== null);
      const active = days.filter((d) => Object.keys(d.modalities).length);
      return {
        patientId: p.userId, name: p.name, diagnosed: p.diagnosed, hoehnYahr: p.hoehnYahr, since: link.since,
        status: last?.status ?? 'building', composite: last?.composite ?? null,
        lastActive: active[active.length - 1]?.date ?? null,
        spark: days.map((d) => d.composite),
        adherencePct: (() => {
          const s = days.reduce((n, d) => n + d.dosesScheduled, 0);
          return s ? Math.min(100, Math.round((days.reduce((n, d) => n + d.dosesTaken, 0) / s) * 100)) : null;
        })(),
      };
    }));
    return c.json(rows.filter(Boolean));
  });

  const patientViews = new Hono<Vars & { Variables: { subject: Profile } }>();
  patientViews.use('*', async (c, next) => {
    const pid = c.req.param('pid') ?? '';
    const patient = (await tracking.canView(me(c).userId, pid)) ? await getProfile(pid) : undefined;
    // Same response whether the patient does not exist or is not linked.
    if (!patient) throw new HTTPException(404, { message: 'not found' });
    c.set('subject', patient);
    await next();
  });
  patientViews.route('/', views());
  app.route('/patients/:pid', patientViews);

  // ── Alerts ─────────────────────────────────────────────────────────────────
  app.get('/alerts', async (c) => c.json(await list<Alert>(me(c).userId, { prefix: 'ALERT#', desc: true, limit: 50 })));
  app.post('/alerts/read', async (c) => {
    const items = await getStore().query(`USER#${me(c).userId}`, { prefix: 'ALERT#' });
    for (const item of items.filter((i) => !i.read)) await getStore().put({ ...item, read: true });
    return c.json({ ok: true });
  });

  // ── Community ──────────────────────────────────────────────────────────────
  app.get('/community/groups', async (c) => c.json({ handle: social.handleFor(me(c)), groups: await social.groupsFor(me(c)) }));
  app.post('/community/groups/:id/join', async (c) => {
    if (!(await social.joinGroup(me(c).userId, c.req.param('id')))) throw new HTTPException(404, { message: 'no such group' });
    return c.json({ ok: true });
  });
  app.post('/community/groups/:id/leave', async (c) => {
    await social.leaveGroup(me(c).userId, c.req.param('id'));
    return c.json({ ok: true });
  });
  app.get('/community/groups/:id/messages', async (c) => {
    if (!(await social.isMember(me(c).userId, c.req.param('id')))) throw new HTTPException(403, { message: 'Join the group to read it.' });
    return c.json(await social.groupMessages(c.req.param('id'), c.req.query('after')));
  });
  app.post('/community/groups/:id/messages', async (c) => {
    if (!(await social.isMember(me(c).userId, c.req.param('id')))) throw new HTTPException(403, { message: 'Join the group to post.' });
    const out = await social.postMessage(me(c), c.req.param('id'), (await body(c, GroupMessageInput)).text);
    if ('error' in out) throw new HTTPException(422, { message: out.error });
    return c.json(out);
  });

  // ── The signed-in user's own data ──────────────────────────────────────────
  const own = new Hono<Vars & { Variables: { subject: Profile } }>();
  own.use('*', async (c, next) => {
    c.set('subject', me(c));
    await next();
  });
  own.route('/', views());
  app.route('/', own);

  // Everything that writes health data requires consent.
  app.use('*', requireConsent);

  app.post('/assessments', async (c) => {
    const input = await body(c, AssessmentInput);
    // A client bug must never write impossible numbers into someone's trend.
    const faulty = implausible(input.type, input.features);
    if (faulty.length) throw new HTTPException(422, { message: `That reading could not be used (${faulty.join(', ')}). Please try the check again.` });
    const allowed = new Set(MODALITIES[input.type].features.map((f) => f.key));
    // Keep declared features plus a few diagnostic extras; drop anything unexpected.
    const features = Object.fromEntries(Object.entries(input.features).filter(([k]) => allowed.has(k) || /^(left|right)_|^(steps|path_length|total_time|pause_time|stroke_count)$/.test(k)));
    return c.json(await tracking.recordAssessment(me(c), { ...input, features }));
  });

  app.post('/voice/uploads', async (c) => {
    const { contentType } = await body(c, z.object({ contentType: z.string().max(60).default('audio/wav') }));
    const p = me(c);
    const key = `${p.userId}/${localDate(nowIso(), p.timezone)}/${newId()}`;
    const base = env.publicUrl || new URL(c.req.url).origin;
    return c.json({ key, contentType, ...(await blob.uploadUrl(key, contentType, base)) });
  });
  if (isLocal()) {
    app.put('/voice/uploads/:user/:date/:id', async (c) => {
      if (c.req.param('user') !== me(c).userId) throw new HTTPException(403, { message: 'forbidden' });
      const bytes = new Uint8Array(await c.req.arrayBuffer());
      if (bytes.length > 12 * 1024 * 1024) throw new HTTPException(413, { message: 'Recording is too large.' });
      await blob.put(`${c.req.param('user')}/${c.req.param('date')}/${c.req.param('id')}`, bytes, c.req.header('content-type') ?? 'audio/wav');
      return c.json({ ok: true });
    });
  }
  app.post('/voice/analyze', async (c) => {
    const input = await body(c, z.object({
      key: z.string().max(120), task: z.enum(['vowel', 'reading']), sentence: z.number().int().min(0).max(VOICE_SENTENCES.length - 1).optional(),
      channel: z.enum(['web', 'mobile']).default('web'),
    }));
    const p = me(c);
    if (!input.key.startsWith(`${p.userId}/`)) throw new HTTPException(403, { message: 'forbidden' });
    let result;
    try {
      result = await voice.analyze(input.key);
    } catch (err) {
      await blob.delete(input.key).catch(() => undefined);
      throw new HTTPException(422, { message: `Could not analyse that recording. ${(err as Error).message}`.slice(0, 200) });
    }
    const features = { ...result.features };
    // Words per second from first sound to last, so a slow start on the button does not count.
    if (input.task === 'reading' && input.sentence !== undefined && result.quality.speech_s > 0) {
      features.speech_rate = round(VOICE_SENTENCES[input.sentence]!.split(/\s+/).length / result.quality.speech_s, 2);
    }
    const keep = p.consent?.storeAudio === true;
    if (!keep) await blob.delete(input.key).catch(() => undefined);
    const assessment = await tracking.recordAssessment(p, {
      type: 'voice', task: input.task, features, channel: input.channel, durationS: result.quality.duration_s,
      quality: { usable: result.quality.usable, problems: result.quality.problems },
      audioKey: keep ? input.key : undefined,
    });
    return c.json({ assessment, topFactors: assessment.model?.factors ?? [] });
  });

  app.post('/medications', async (c) => c.json(await health.saveMedication(me(c).userId, await body(c, MedicationInput))));
  app.put('/medications/:id', async (c) => c.json(await health.saveMedication(me(c).userId, await body(c, MedicationInput), c.req.param('id'))));
  app.delete('/medications/:id', async (c) => {
    if (!(await health.stopMedication(me(c).userId, c.req.param('id')))) throw new HTTPException(404, { message: 'not found' });
    return c.json({ ok: true });
  });
  app.post('/doses', async (c) => {
    const dose = await health.logDose(me(c), await body(c, DoseInput));
    if (!dose) throw new HTTPException(404, { message: 'medication not found' });
    return c.json(dose);
  });
  app.post('/symptoms', async (c) => c.json(await health.logSymptom(me(c), await body(c, SymptomInput))));

  app.post('/sleep', async (c) => c.json(await health.saveSleep(me(c), await body(c, SleepInput))));
  app.post('/sleep/import', async (c) => {
    const rows = await body(c, z.object({ nights: z.array(SleepInput).min(1).max(120) }));
    const saved = [];
    for (const night of rows.nights) saved.push(await health.saveSleep(me(c), { ...night, source: 'import' }));
    return c.json({ imported: saved.length });
  });
  app.delete('/sleep/:date', async (c) => {
    await health.deleteSleep(me(c).userId, c.req.param('date'));
    return c.json({ ok: true });
  });
  app.post('/dystonia', async (c) => c.json(await health.logDystonia(me(c).userId, await body(c, DystoniaInput))));

  app.get('/companion/messages', async (c) => c.json(await chatHistory(me(c).userId)));
  app.post('/companion/messages', async (c) => c.json(await sendMessage(me(c), (await body(c, ChatInput)).text)));
  // Clears the conversation. Saved memories stay until removed one by one.
  app.delete('/companion/messages', async (c) => {
    const store = getStore();
    const items = await store.query(`USER#${me(c).userId}`, { prefix: 'CHAT#' });
    for (const item of items) await store.delete(item.pk, item.sk);
    return c.json({ cleared: items.length });
  });
  app.post('/companion/open', async (c) => c.json({ opened: await openConversation(me(c)) }));
  app.get('/companion/memories', async (c) => c.json((await listMemories(me(c).userId)).reverse()));
  app.delete('/companion/memories/:id', async (c) => {
    if (!(await deleteMemory(me(c).userId, c.req.param('id')))) throw new HTTPException(404, { message: 'not found' });
    return c.json({ ok: true });
  });
  // One spoken turn: the person's recording in, the reply as text and speech out.
  app.post('/companion/voice', async (c) => {
    const bytes = new Uint8Array(await c.req.arrayBuffer());
    if (bytes.length > 4 * 1024 * 1024) throw new HTTPException(413, { message: 'That recording is too long.' });
    const wav = parseWav(bytes);
    if (!wav) throw new HTTPException(400, { message: 'Expected 16-bit mono WAV audio.' });
    const p = me(c);
    const transcript = await speech.transcribe(wav, p.locale);
    if (transcript === null) return c.json({ error: 'speech_unavailable' }, 501);
    if (!transcript) return c.json({ transcript: '', reply: null, checkin: null, remembered: [], audio: null });
    const out = await sendMessage(p, transcript.slice(0, 1200), 'voice');
    const audio = await speech.synthesize(out.reply.text, p.locale);
    return c.json({ transcript, ...out, audio: audio ? Buffer.from(audio).toString('base64') : null });
  });
  app.post('/companion/speech', async (c) => {
    const { text } = await body(c, z.object({ text: z.string().min(1).max(2500) }));
    const audio = await speech.synthesize(text, me(c).locale);
    if (!audio) return c.json({ error: 'speech_unavailable' }, 501);
    return c.body(new Uint8Array(audio), 200, { 'content-type': 'audio/mpeg' });
  });

  return app;
}
