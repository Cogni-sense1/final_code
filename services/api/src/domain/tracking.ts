import {
  type Alert, type Assessment, type AssessmentType, type Baseline, type CareLink, type Channel, type Checkin,
  type DailyProfile, type Dose, type Features, type Medication, type Profile, type Quality, type SleepEntry, type Symptom,
  BASELINE_FREEZE, baselineKey, compositeIndex, computeBaseline, computeDeviation, mean, referenceScore, round, statusFor,
  sustainedChange, VOICE_MODEL_WINDOW, voiceModelScore,
} from '@neurovoice/shared';
import { notifier } from '../adapters';
import { getOne, getProfile, list, listBetween, newId, putOne, SK } from '../repo';
import { getStore } from '../store';
import { addDays, localDate, nowIso } from '../time';

// ── Care team ────────────────────────────────────────────────────────────────

export async function careTeam(patientId: string): Promise<CareLink[]> {
  return (await list<CareLink>(patientId, { prefix: 'LINK#' })).filter((l) => l.status === 'active');
}

export async function patientsOf(memberId: string): Promise<CareLink[]> {
  return (await list<CareLink>(memberId, { prefix: 'PATIENT#' })).filter((l) => l.status === 'active');
}

/** The only gate for reading someone else's data: an active link the patient accepted. */
export async function canView(memberId: string, patientId: string): Promise<boolean> {
  if (memberId === patientId) return true;
  const link = await getOne<CareLink>(patientId, SK.link(memberId));
  return link?.status === 'active';
}

export async function createInvite(patient: Profile): Promise<{ code: string; expiresAt: string }> {
  const code = Array.from({ length: 6 }, () => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 31)]).join('');
  const expires = Date.now() + 48 * 3600_000;
  await getStore().put({ pk: `INVITE#${code}`, sk: 'INVITE', patientId: patient.userId, ttl: Math.floor(expires / 1000) });
  return { code, expiresAt: new Date(expires).toISOString() };
}

export async function acceptInvite(member: Profile, code: string): Promise<CareLink | null> {
  const store = getStore();
  const invite = await store.get(`INVITE#${code.toUpperCase().trim()}`, 'INVITE');
  if (!invite || (invite.ttl ?? 0) < Date.now() / 1000) return null;
  const patient = await getProfile(invite.patientId as string);
  if (!patient || patient.userId === member.userId || !patient.consent?.shareWithCareTeam) return null;
  const link: CareLink = {
    patientId: patient.userId, patientName: patient.name, memberId: member.userId, memberName: member.name,
    memberRole: member.role, status: 'active', since: nowIso(), notify: true,
  };
  await putOne(patient.userId, SK.link(member.userId), link);
  await putOne(member.userId, SK.patient(patient.userId), link);
  await store.delete(invite.pk, invite.sk);
  return link;
}

export async function revokeLink(patientId: string, memberId: string): Promise<void> {
  const store = getStore();
  await store.delete(`USER#${patientId}`, SK.link(memberId));
  await store.delete(`USER#${memberId}`, SK.patient(patientId));
}

// ── Alerts ───────────────────────────────────────────────────────────────────

/**
 * Record an alert for the patient and every linked care-team member, and notify them.
 * `quietDays` suppresses repeats of the same kind.
 */
export async function raiseAlert(
  patient: Profile,
  alert: Pick<Alert, 'kind' | 'severity' | 'title' | 'detail'>,
  quietDays = 7,
): Promise<Alert | null> {
  const markSk = `ALERTMARK#${alert.kind}`;
  const mark = await getOne<{ at: string }>(patient.userId, markSk);
  if (mark && Date.now() - Date.parse(mark.at) < quietDays * 86_400_000) return null;

  const at = nowIso();
  const full: Alert = { ...alert, id: newId(), at, patientId: patient.userId, patientName: patient.name, read: false };
  await putOne(patient.userId, markSk, { at });
  await putOne(patient.userId, SK.alert(at, full.id), full);
  for (const link of await careTeam(patient.userId)) {
    await putOne(link.memberId, SK.alert(at, full.id), full);
    if (!link.notify) continue;
    const member = await getProfile(link.memberId);
    if (member) {
      await notifier.send({
        phone: member.phone, email: member.email,
        subject: `NeuroVoice: ${alert.title}`, message: `${patient.name}: ${alert.detail}`,
      });
    }
  }
  return full;
}

// ── Assessments ──────────────────────────────────────────────────────────────

export interface NewAssessment {
  type: AssessmentType;
  task?: string;
  features: Features;
  quality: Quality;
  durationS: number;
  channel: Channel;
  takenAt?: string;
  strokes?: Assessment['strokes'];
  transcript?: string;
  audioKey?: string;
}

export async function recordAssessment(profile: Profile, input: NewAssessment): Promise<Assessment> {
  const userId = profile.userId;
  const takenAt = input.takenAt ?? nowIso();
  const key = baselineKey(input.type, input.task);
  let baseline = await getOne<Baseline>(userId, SK.baseline(key));

  // The population voice model scores the person from this recording averaged with their recent ones.
  let model: Assessment['model'];
  if (input.type === 'voice' && input.quality.usable) {
    const earlier = (await listAssessments(userId, { type: 'voice', limit: 80 }))
      .filter((a) => a.quality.usable && a.takenAt < takenAt)
      .slice(0, VOICE_MODEL_WINDOW - 1);
    const scored = voiceModelScore([{ task: input.task, features: input.features }, ...earlier]);
    if (scored) model = { version: scored.version, score: scored.score, recordings: scored.recordings, factors: scored.factors };
  }

  const assessment: Assessment = {
    id: newId(), userId, type: input.type, task: input.task, takenAt, channel: input.channel,
    features: input.features, quality: input.quality, durationS: input.durationS,
    reference: referenceScore(input.type, input.features, input.task, model?.score),
    // Compared against the baseline as it stood before this session.
    deviation: computeDeviation(input.type, input.task, input.features, baseline),
    model, transcript: input.transcript, audioKey: input.audioKey, strokes: input.strokes,
  };
  await putOne(userId, SK.assess(takenAt, assessment.id), assessment, { bkey: key });

  if (input.quality.usable && !baseline?.frozen) {
    const history = (await getStore().query(`USER#${userId}`, { prefix: 'ASSESS#' }))
      .filter((i) => i.bkey === key && (i.quality as Quality).usable)
      .slice(0, BASELINE_FREEZE)
      .map((i) => i.features as Features);
    baseline = computeBaseline(key, history, nowIso());
    await putOne(userId, SK.baseline(key), baseline);
    assessment.deviation.sessionsInBaseline = baseline.sessions;
  }

  const date = localDate(takenAt, profile.timezone);
  await consolidateDay(profile, date);
  await checkSustainedChange(profile, date);
  return assessment;
}

export async function listAssessments(
  userId: string,
  opts: { type?: AssessmentType; limit?: number; sinceIso?: string } = {},
): Promise<Assessment[]> {
  const all = await list<Assessment>(userId, {
    prefix: 'ASSESS#', from: opts.sinceIso ? `ASSESS#${opts.sinceIso}` : undefined, desc: true,
  });
  const filtered = opts.type ? all.filter((a) => a.type === opts.type) : all;
  return filtered.slice(0, opts.limit ?? 200);
}

// ── Daily profile ────────────────────────────────────────────────────────────

/**
 * Fold everything recorded on one local day into a single profile.
 * This is the unit the Step Functions workflow runs per user each night; it is also
 * called inline after each assessment so the app is always current.
 */
export async function consolidateDay(profile: Profile, date: string): Promise<DailyProfile> {
  const userId = profile.userId;
  const tz = profile.timezone;
  // Fetch a day either side in UTC, then keep what falls on the local date.
  const from = `${addDays(date, -1)}T00:00:00.000Z`;
  const to = `${addDays(date, 1)}T23:59:59.999Z`;
  const onDay = <T>(items: T[], at: (x: T) => string): T[] => items.filter((x) => localDate(at(x), tz) === date);

  const assessments = onDay(await listBetween<Assessment>(userId, 'ASSESS', from, to), (a) => a.takenAt).filter((a) => a.quality.usable);
  const doses = onDay(await listBetween<Dose>(userId, 'DOSE', from, to), (d) => d.takenAt);
  const symptoms = onDay(await listBetween<Symptom>(userId, 'SYMPTOM', from, to), (s) => s.at);
  const meds = (await list<Medication>(userId, { prefix: 'MED#' })).filter((m) => m.active);
  const checkin = await getOne<Checkin>(userId, SK.checkin(date));
  const sleep = await getOne<SleepEntry>(userId, SK.sleep(date));

  const groups = new Map<string, number[]>();
  const counts = new Map<string, number>();
  for (const a of assessments) {
    const key = baselineKey(a.type, a.task);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (a.deviation.index !== null) groups.set(key, [...(groups.get(key) ?? []), a.deviation.index]);
  }
  const modalities: DailyProfile['modalities'] = {};
  for (const [key, sessions] of counts) {
    const xs = groups.get(key);
    modalities[key] = { index: xs?.length ? round(mean(xs), 2) : null, sessions };
  }

  const composite = compositeIndex(modalities);
  const day: DailyProfile = {
    date, modalities, composite, status: statusFor(composite),
    checkin: checkin ? { sleepQuality: checkin.sleepQuality, mood: checkin.mood, motorDifficulty: checkin.motorDifficulty } : undefined,
    offReports: symptoms.filter((s) => s.state === 'off').length,
    dosesTaken: doses.length,
    dosesScheduled: meds.reduce((n, m) => n + m.times.length, 0),
    sleepScore: sleep?.score,
  };
  await putOne(userId, SK.day(date), day);
  return day;
}

export async function getDays(userId: string, from: string, to: string): Promise<DailyProfile[]> {
  return list<DailyProfile>(userId, { from: SK.day(from), to: SK.day(to) });
}

async function checkSustainedChange(profile: Profile, date: string): Promise<void> {
  const days = await getDays(profile.userId, addDays(date, -30), date);
  if (!sustainedChange(days.map((d) => d.composite))) return;
  const recent = days.filter((d) => d.composite !== null).slice(-10);
  const worst = Object.entries(
    recent.reduce<Record<string, number[]>>((acc, d) => {
      for (const [k, m] of Object.entries(d.modalities)) if (m.index !== null) (acc[k] ??= []).push(m.index);
      return acc;
    }, {}),
  ).map(([k, xs]) => [k, mean(xs)] as const).sort((a, b) => b[1] - a[1])[0];
  await raiseAlert(profile, {
    kind: 'sustained_change', severity: 'attention',
    title: 'Sustained change from baseline',
    detail: `Measurements have been above the personal baseline on most of the last ${recent.length} active days` +
      (worst ? `, most clearly in ${worst[0].split(':')[0]}.` : '.') + ' This is a prompt to check in, not a diagnosis.',
  });
}
