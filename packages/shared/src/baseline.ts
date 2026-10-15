import { trackedFeatures, MODALITIES } from './modalities';
import type { AssessmentType, Baseline, Deviation, DeviationStatus, Features } from './schemas';
import { clamp, mad, median, round } from './stats';

/** Sessions needed before a personal baseline exists. */
export const BASELINE_MIN = 5;
/** After this many sessions the baseline stops moving. */
export const BASELINE_FREEZE = 10;

export const WATCH_AT = 1.0;
export const CHANGED_AT = 2.0;

/** Sustained change: this many of the last `TREND_WINDOW` active days at or above `TREND_AT`. */
export const TREND_WINDOW = 10;
export const TREND_DAYS = 6;
export const TREND_AT = 1.5;

/**
 * Build a baseline from a user's earliest usable sessions (oldest first).
 * Median and MAD are used so one bad recording does not skew it.
 */
export function computeBaseline(key: string, history: Features[], now: string): Baseline {
  const used = history.slice(0, BASELINE_FREEZE);
  const keys = new Set(used.flatMap((f) => Object.keys(f)));
  const stats: Baseline['stats'] = {};
  for (const k of keys) {
    const xs = used.map((f) => f[k]).filter((v): v is number => v !== undefined);
    if (xs.length >= Math.min(BASELINE_MIN, used.length)) stats[k] = { median: median(xs), mad: mad(xs) };
  }
  return { key, sessions: used.length, frozen: used.length >= BASELINE_FREEZE, stats, updatedAt: now };
}

export const statusFor = (index: number | null): DeviationStatus =>
  index === null ? 'building' : index >= CHANGED_AT ? 'changed' : index >= WATCH_AT ? 'watch' : 'steady';

/** How far one session sits from the personal baseline, in the "worse" direction. */
export function computeDeviation(
  type: AssessmentType,
  task: string | undefined,
  features: Features,
  baseline: Baseline | undefined,
): Deviation {
  const sessions = baseline?.sessions ?? 0;
  if (!baseline || sessions < BASELINE_MIN) {
    return { status: 'building', index: null, sessionsInBaseline: sessions, sessionsNeeded: BASELINE_MIN, drivers: [] };
  }
  const drivers: Deviation['drivers'] = [];
  for (const spec of trackedFeatures(type, task)) {
    const value = features[spec.key];
    const stat = baseline.stats[spec.key];
    if (value === undefined || !stat) continue;
    // Floor the spread so a very consistent baseline does not turn noise into alarms.
    const spread = Math.max(stat.mad, Math.abs(stat.median) * 0.08, 1e-6);
    const signed = ((value - stat.median) / spread) * (spec.worse === 'up' ? 1 : -1);
    drivers.push({ key: spec.key, label: spec.label, z: round(clamp(signed, -4, 4), 2) });
  }
  if (!drivers.length) {
    return { status: 'building', index: null, sessionsInBaseline: sessions, sessionsNeeded: BASELINE_MIN, drivers: [] };
  }
  const index = round(drivers.reduce((s, d) => s + d.z, 0) / drivers.length, 2);
  drivers.sort((a, b) => b.z - a.z);
  return { status: statusFor(index), index, sessionsInBaseline: sessions, sessionsNeeded: BASELINE_MIN, drivers };
}

/** Weighted mean of modality indices for one day. */
export function compositeIndex(modalities: Record<string, { index: number | null }>): number | null {
  let sum = 0;
  let weight = 0;
  for (const [key, m] of Object.entries(modalities)) {
    if (m.index === null) continue;
    const type = key.split(':')[0] as AssessmentType;
    const w = MODALITIES[type]?.weight ?? 1;
    sum += m.index * w;
    weight += w;
  }
  return weight ? round(sum / weight, 2) : null;
}

/** True when recent days show a sustained shift rather than a single bad day. */
export function sustainedChange(composites: (number | null)[]): boolean {
  const recent = composites.filter((c): c is number => c !== null).slice(-TREND_WINDOW);
  return recent.length >= TREND_DAYS && recent.filter((c) => c >= TREND_AT).length >= TREND_DAYS;
}
