import {
  type Dose, type Dystonia, type Medication, type MedicationInput, type MedicationInsights, type Profile,
  type ScheduledDose, type SleepEntry, type SleepInput, type Symptom,
  daySchedule, hourLabel, medicationInsights, rbdPattern, toSleepEntry,
} from '@neurovoice/shared';
import { getOne, list, listBetween, newId, putOne, SK } from '../repo';
import { getStore } from '../store';
import { addDays, daysAgoIso, localDate, localHour, localMinutes, nowIso } from '../time';
import { consolidateDay, raiseAlert } from './tracking';

// ── Medication ───────────────────────────────────────────────────────────────

export const listMedications = (userId: string): Promise<Medication[]> => list<Medication>(userId, { prefix: 'MED#' });

export async function saveMedication(userId: string, input: MedicationInput, id?: string): Promise<Medication> {
  const existing = id ? await getOne<Medication>(userId, SK.med(id)) : undefined;
  const med: Medication = {
    ...input, id: existing?.id ?? newId(), active: true, createdAt: existing?.createdAt ?? nowIso(),
    times: [...new Set(input.times)].sort(),
  };
  await putOne(userId, SK.med(med.id), med);
  return med;
}

/** Medications are deactivated rather than deleted so past doses keep their context. */
export async function stopMedication(userId: string, id: string): Promise<boolean> {
  const med = await getOne<Medication>(userId, SK.med(id));
  if (!med) return false;
  await putOne(userId, SK.med(id), { ...med, active: false });
  return true;
}

async function dayItems<T>(profile: Profile, kind: string, date: string, at: (x: T) => string): Promise<T[]> {
  const items = await listBetween<T>(profile.userId, kind, `${addDays(date, -1)}T00:00:00.000Z`, `${addDays(date, 1)}T23:59:59.999Z`);
  return items.filter((x) => localDate(at(x), profile.timezone) === date);
}

export async function medicationDay(profile: Profile, date?: string): Promise<{ date: string; schedule: ScheduledDose[]; doses: Dose[]; symptoms: Symptom[] }> {
  const tz = profile.timezone;
  const today = localDate(nowIso(), tz);
  const day = date ?? today;
  const doses = await dayItems<Dose>(profile, 'DOSE', day, (d) => d.takenAt);
  const symptoms = await dayItems<Symptom>(profile, 'SYMPTOM', day, (s) => s.at);
  // Past days are fully elapsed; future slots only make sense for today.
  const nowMin = day === today ? localMinutes(nowIso(), tz) : 24 * 60 + 999;
  const schedule = daySchedule(await listMedications(profile.userId), doses, nowMin, (iso) => localMinutes(iso, tz));
  return { date: day, schedule, doses, symptoms };
}

export async function logDose(profile: Profile, input: { medicationId: string; takenAt?: string; scheduledTime?: string }): Promise<Dose | null> {
  const med = await getOne<Medication>(profile.userId, SK.med(input.medicationId));
  if (!med) return null;
  const dose: Dose = {
    id: newId(), medicationId: med.id, medicationName: med.name, levodopa: med.levodopa,
    takenAt: input.takenAt ?? nowIso(), scheduledTime: input.scheduledTime,
  };
  await putOne(profile.userId, SK.dose(dose.takenAt, dose.id), dose);
  await consolidateDay(profile, localDate(dose.takenAt, profile.timezone));
  return dose;
}

export async function logSymptom(profile: Profile, input: Omit<Symptom, 'id' | 'at'> & { at?: string }): Promise<Symptom> {
  const symptom: Symptom = { ...input, id: newId(), at: input.at ?? nowIso() };
  await putOne(profile.userId, SK.symptom(symptom.at, symptom.id), symptom);
  const date = localDate(symptom.at, profile.timezone);
  const day = await consolidateDay(profile, date);
  if (day.offReports >= 3) {
    await raiseAlert(profile, {
      kind: 'frequent_off', severity: 'attention', title: 'Several "off" periods today',
      detail: `${day.offReports} off periods were logged today. Worth mentioning at the next appointment.`,
    }, 1);
  }
  return symptom;
}

export async function insights(profile: Profile, days = 14): Promise<MedicationInsights & { days: number; peakLabel: string | null }> {
  const since = daysAgoIso(days);
  const doses = await listBetween<Dose>(profile.userId, 'DOSE', since, nowIso());
  const symptoms = await listBetween<Symptom>(profile.userId, 'SYMPTOM', since, nowIso());
  const perDay = (await listMedications(profile.userId)).filter((m) => m.active).reduce((n, m) => n + m.times.length, 0);
  const out = medicationInsights(doses, symptoms, perDay * days, (iso) => localHour(iso, profile.timezone));
  const p = out.peakOffWindow;
  return { ...out, days, peakLabel: p ? `${hourLabel(p.fromHour)} to ${hourLabel(p.toHour)}` : null };
}

/** Run on a schedule: alert the care team when a scheduled dose was not logged. */
export async function checkMissedDoses(profile: Profile): Promise<number> {
  const { schedule } = await medicationDay(profile);
  const missed = schedule.filter((s) => s.status === 'missed');
  if (!missed.length) return 0;
  const sent = await raiseAlert(profile, {
    kind: 'missed_dose', severity: 'attention', title: 'Missed medication',
    detail: `No dose logged for ${missed.map((m) => `${m.name} at ${m.time}`).join(', ')}.`,
  }, 0.25);
  return sent ? missed.length : 0;
}

// ── Sleep and dystonia ───────────────────────────────────────────────────────

export async function saveSleep(profile: Profile, input: SleepInput): Promise<SleepEntry> {
  const entry = toSleepEntry(input);
  await putOne(profile.userId, SK.sleep(entry.date), entry);
  await consolidateDay(profile, entry.date);
  const pattern = rbdPattern(await listSleep(profile.userId, 14));
  if (pattern.flagged) {
    await raiseAlert(profile, {
      kind: 'rbd_pattern', severity: 'attention', title: 'Dream enactment on several nights',
      detail: `Acting out dreams was reported on ${pattern.nights} of the last 14 nights. This is worth raising with a doctor.`,
    }, 14);
  }
  return entry;
}

export async function listSleep(userId: string, days = 30): Promise<SleepEntry[]> {
  const today = new Date().toISOString().slice(0, 10);
  return list<SleepEntry>(userId, { from: SK.sleep(addDays(today, -days)), to: SK.sleep(addDays(today, 1)) });
}

export async function logDystonia(userId: string, input: Omit<Dystonia, 'id' | 'at'> & { at?: string }): Promise<Dystonia> {
  const entry: Dystonia = { ...input, id: newId(), at: input.at ?? nowIso() };
  await putOne(userId, SK.dystonia(entry.at, entry.id), entry);
  return entry;
}

export const listDystonia = (userId: string, days = 30): Promise<Dystonia[]> =>
  listBetween<Dystonia>(userId, 'DYST', daysAgoIso(days), nowIso());

export async function deleteSleep(userId: string, date: string): Promise<void> {
  await getStore().delete(`USER#${userId}`, SK.sleep(date));
}
