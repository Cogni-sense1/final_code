import type { Dose, Medication, SleepEntry, SleepInput, Symptom } from './schemas';
import { clamp, median, round } from './stats';

const minutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

// ── Sleep ────────────────────────────────────────────────────────────────────

export function sleepHours(bedtime: string, wakeTime: string): number {
  let span = minutes(wakeTime) - minutes(bedtime);
  if (span <= 0) span += 24 * 60;
  return round(span / 60, 2);
}

/** 0-100. Duration and continuity always count; stage percentages only when imported. */
export function sleepScore(input: SleepInput): number {
  const hours = sleepHours(input.bedtime, input.wakeTime);
  const duration = clamp(1 - Math.abs(hours - 8) / 4, 0, 1);
  const continuity = clamp(1 - input.awakenings / 6, 0, 1);
  const parts: [number, number][] = [[duration, 45], [continuity, 25]];
  if (input.remPct !== undefined) parts.push([clamp(input.remPct / 22, 0, 1), 15]);
  if (input.deepPct !== undefined) parts.push([clamp(input.deepPct / 17, 0, 1), 15]);
  const total = parts.reduce((s, [, w]) => s + w, 0);
  let score = (parts.reduce((s, [v, w]) => s + v * w, 0) / total) * 100;
  if (input.actedOutDreams) score -= 10;
  return Math.round(clamp(score, 0, 100));
}

export function toSleepEntry(input: SleepInput): SleepEntry {
  return {
    ...input,
    hours: sleepHours(input.bedtime, input.wakeTime),
    score: sleepScore(input),
    rbdFlag: input.actedOutDreams || (input.vocalised && input.awakenings >= 3),
  };
}

/** Dream enactment on several recent nights is worth raising with a clinician. */
export function rbdPattern(entries: SleepEntry[]): { nights: number; flagged: boolean } {
  const recent = entries.slice(-14);
  const nights = recent.filter((e) => e.actedOutDreams).length;
  return { nights, flagged: nights >= 3 };
}

// ── Medication ───────────────────────────────────────────────────────────────

export interface ScheduledDose {
  medicationId: string;
  name: string;
  dose: number;
  unit: string;
  time: string;
  status: 'taken' | 'due' | 'upcoming' | 'missed';
  takenAt?: string;
}

/** Minutes after the scheduled time before a dose counts as missed. */
export const MISSED_AFTER_MIN = 90;

/**
 * Today's schedule with each slot matched to a logged dose.
 * `localMinutes` maps an ISO timestamp to minutes since local midnight.
 */
export function daySchedule(
  meds: Medication[],
  doses: Dose[],
  nowMinutes: number,
  localMinutes: (iso: string) => number,
): ScheduledDose[] {
  const used = new Set<string>();
  const slots: ScheduledDose[] = [];
  for (const med of meds.filter((m) => m.active)) {
    for (const time of med.times) {
      const at = minutes(time);
      const match = doses
        .filter((d) => d.medicationId === med.id && !used.has(d.id))
        .filter((d) => (d.scheduledTime ? d.scheduledTime === time : Math.abs(localMinutes(d.takenAt) - at) <= 120))
        .sort((a, b) => Math.abs(localMinutes(a.takenAt) - at) - Math.abs(localMinutes(b.takenAt) - at))[0];
      if (match) used.add(match.id);
      slots.push({
        medicationId: med.id, name: med.name, dose: med.dose, unit: med.unit, time,
        status: match ? 'taken' : nowMinutes > at + MISSED_AFTER_MIN ? 'missed' : nowMinutes >= at - 15 ? 'due' : 'upcoming',
        takenAt: match?.takenAt,
      });
    }
  }
  return slots.sort((a, b) => minutes(a.time) - minutes(b.time));
}

export interface MedicationInsights {
  adherencePct: number | null;
  offReports: number;
  /** Hours of the day (0-23) where "off" is reported most, with counts. */
  offByHour: number[];
  peakOffWindow: { fromHour: number; toHour: number; reports: number } | null;
  /** Median minutes from a levodopa dose to the next "off" report. */
  wearingOffMinutes: number | null;
  /** Median minutes from a levodopa dose to the next "on" report after an "off". */
  kickInMinutes: number | null;
}

export function medicationInsights(
  doses: Dose[],
  symptoms: Symptom[],
  scheduledCount: number,
  localHour: (iso: string) => number,
): MedicationInsights {
  const offByHour = new Array<number>(24).fill(0);
  const offs = symptoms.filter((s) => s.state === 'off');
  for (const s of offs) offByHour[localHour(s.at)]!++;

  // Busiest three-hour window.
  let peak: MedicationInsights['peakOffWindow'] = null;
  for (let h = 0; h < 24; h++) {
    const n = offByHour[h]! + offByHour[(h + 1) % 24]! + offByHour[(h + 2) % 24]!;
    if (n >= 3 && (!peak || n > peak.reports)) peak = { fromHour: h, toHour: (h + 3) % 24, reports: n };
  }

  const levodopa = doses.filter((d) => d.levodopa).map((d) => Date.parse(d.takenAt)).sort((a, b) => a - b);
  const sorted = [...symptoms].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const wearing: number[] = [];
  const kick: number[] = [];
  levodopa.forEach((taken, i) => {
    const next = levodopa[i + 1] ?? taken + 8 * 3600_000;
    const window = sorted.filter((s) => Date.parse(s.at) > taken && Date.parse(s.at) <= next);
    const firstOn = window.find((s) => s.state === 'on');
    if (firstOn) {
      const mins = (Date.parse(firstOn.at) - taken) / 60_000;
      if (mins <= 120) kick.push(mins);
      const offAfter = window.find((s) => s.state === 'off' && Date.parse(s.at) > Date.parse(firstOn.at));
      if (offAfter) wearing.push((Date.parse(offAfter.at) - taken) / 60_000);
    }
  });

  return {
    adherencePct: scheduledCount > 0 ? Math.round(clamp(doses.length / scheduledCount, 0, 1) * 100) : null,
    offReports: offs.length,
    offByHour,
    peakOffWindow: peak,
    wearingOffMinutes: wearing.length >= 2 ? Math.round(median(wearing)) : null,
    kickInMinutes: kick.length >= 2 ? Math.round(median(kick)) : null,
  };
}

export const hourLabel = (h: number): string => `${((h + 11) % 12) + 1}${h < 12 ? 'am' : 'pm'}`;
