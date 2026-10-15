/**
 * Demo data for local development and the video walkthrough:  npm run seed
 *
 * Everything here is SYNTHETIC and every profile is flagged `synthetic: true`,
 * which the app shows as a "Demo data" badge. Sign in with any account below
 * using the password printed at the end.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { AssessmentType, Features, Profile } from '@neurovoice/shared';
import { localSignup } from './auth';
import * as health from './domain/health';
import * as social from './domain/social';
import * as tracking from './domain/tracking';
import { env } from './env';
import { putOne, putProfile, SK } from './repo';
import { FileStore, setStore } from './store';
import { localDate } from './time';

const PASSWORD = 'neurovoice-demo';
const DAYS = 45;

// Small deterministic generator so every seed run produces the same story.
let state = 20261011;
const rand = (): number => {
  state = (state * 1664525 + 1013904223) >>> 0;
  return state / 2 ** 32;
};
const noise = (sd: number): number => (rand() + rand() + rand() - 1.5) * 2 * sd;
const at = (daysAgo: number, hour: number, minute = 0): string => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  // Hours are given in India time (UTC+5:30).
  d.setUTCHours(hour - 5, minute - 30, Math.floor(rand() * 50), 0);
  return d.toISOString();
};

/** `drift` runs 0 (at baseline) to 1 (clearly changed). */
const GEN: Record<string, (drift: number) => Features> = {
  'voice:vowel': (d) => ({
    jitter_local: 0.62 + d * 0.75 + noise(0.06), shimmer_local: 3.9 + d * 2.6 + noise(0.3), htn: 21 - d * 5.5 + noise(0.8),
    degree_voice_breaks: Math.max(0, 0.8 + d * 4 + noise(0.5)), frac_unvoiced: Math.max(0, 6 + d * 9 + noise(1.5)),
    pitch_mean: 182 + noise(4), pitch_std: 6 + noise(1),
  }),
  'voice:reading': (d) => ({
    jitter_local: 1.9 + d * 0.9 + noise(0.15), shimmer_local: 8.2 + d * 2.2 + noise(0.5), htn: 13.5 - d * 2.5 + noise(0.6),
    pitch_std: 31 - d * 13 + noise(2), speech_rate: 2.7 - d * 0.6 + noise(0.1), pitch_mean: 190 + noise(5),
  }),
  face: (d) => ({ blink_rate: 16.5 - d * 6 + noise(1.3), expressivity: 2.8 - d * 1.1 + noise(0.2), asymmetry: 0.028 + d * 0.02 + noise(0.003) }),
  tap: (d) => ({
    taps_per_sec: 4.3 - d * 1.2 + noise(0.18), interval_cv: 0.16 + d * 0.2 + noise(0.02), amplitude_decay: 0.004 + d * 0.014 + noise(0.002),
    fatigue_drop: Math.max(0, 0.06 + d * 0.2 + noise(0.03)), hand_asymmetry: 0.07 + d * 0.22 + noise(0.02), tremor: 0.5 + d * 0.7 + noise(0.08),
  }),
  spiral: (d) => ({
    rmse: 7.5 + d * 9 + noise(0.9), tremor_index: 0.27 + d * 0.3 + noise(0.03), speed_cv: 42 + d * 34 + noise(4),
    mean_speed: 150 - d * 45 + noise(8), waviness: 0.2 + d * 0.15 + noise(0.02), stroke_count: 1,
  }),
  gait: (d) => ({
    cadence: 108 - d * 20 + noise(3), step_time_cv: 0.06 + d * 0.1 + noise(0.01), arm_swing: 0.46 - d * 0.22 + noise(0.03),
    arm_swing_asymmetry: 0.1 + d * 0.3 + noise(0.03), trunk_sway: 0.02 + noise(0.003),
  }),
};

async function seedPatient(p: Profile, driftFor: (daysAgo: number, key: string) => number, adherence: number): Promise<void> {
  const levodopa = await health.saveMedication(p.userId, { name: 'Levodopa/Carbidopa', dose: 100, unit: 'mg', times: ['08:00', '13:00', '18:00'], levodopa: true });
  const agonist = await health.saveMedication(p.userId, { name: 'Pramipexole', dose: 0.5, unit: 'mg', times: ['08:00', '20:00'], levodopa: false });

  for (let day = DAYS; day >= 0; day--) {
    // People skip days; roughly five sessions a week.
    if (rand() > 0.22 || day < 3) {
      for (const key of Object.keys(GEN)) {
        if (key !== 'voice:vowel' && key !== 'face' && rand() > 0.6) continue;
        const [type, task] = key.split(':') as [AssessmentType, string | undefined];
        const features = Object.fromEntries(Object.entries(GEN[key]!(driftFor(day, key))).map(([k, v]) => [k, Math.round(v * 1000) / 1000]));
        await tracking.recordAssessment(p, {
          type, task, features, quality: { usable: true, problems: [] }, durationS: 30, channel: 'web', takenAt: at(day, 9, Math.floor(rand() * 40)),
        });
      }
    }
    for (const [med, times] of [[levodopa, [8, 13, 18]], [agonist, [8, 20]]] as const) {
      for (const hour of times) {
        if (day === 0 && hour > 13) continue;
        if (rand() < adherence) await health.logDose(p, { medicationId: med.id, takenAt: at(day, hour, Math.floor(rand() * 25)), scheduledTime: `${String(hour).padStart(2, '0')}:00` });
      }
    }
    if (p.diagnosed && day > 0) {
      // "On" mid-morning; wearing off most afternoons before the evening dose.
      await putOne(p.userId, SK.symptom(at(day, 9, 5), `s${day}a`), { id: `s${day}a`, at: at(day, 9, 5), state: 'on', tremor: 1, stiffness: 1, slowness: 1 });
      await putOne(p.userId, SK.symptom(at(day, 13, 50), `s${day}c`), { id: `s${day}c`, at: at(day, 13, 50), state: 'on', tremor: 1, stiffness: 1, slowness: 1 });
      if (rand() < 0.6) {
        const t = at(day, 16 + Math.floor(rand() * 2), Math.floor(rand() * 50));
        await putOne(p.userId, SK.symptom(t, `s${day}b`), { id: `s${day}b`, at: t, state: 'off', tremor: 3, stiffness: 2, slowness: 3 });
      }
    }
    if (day > 0 && rand() < 0.85) {
      const rough = rand() < 0.2;
      await health.saveSleep(p, {
        date: localDate(at(day, 7), p.timezone), bedtime: rough ? '23:45' : '22:30', wakeTime: rough ? '05:45' : '06:30',
        awakenings: rough ? 4 : 1, actedOutDreams: false, vocalised: rough && rand() < 0.3, restingHr: Math.round(60 + noise(3)), source: 'manual',
      });
    }
  }
}

async function main(): Promise<void> {
  const file = path.join(env.localDir, 'table.json');
  fs.rmSync(file, { force: true });
  const store = new FileStore(file);
  setStore(store);

  const mk = async (email: string, name: string, role: Profile['role'], extra: Partial<Profile> = {}): Promise<Profile> => {
    const base = (await localSignup({ email, password: PASSWORD, name, role }))!;
    const p: Profile = {
      ...base, ...extra, synthetic: true,
      consent: { version: 'demo', acceptedAt: new Date().toISOString(), storeAudio: false, shareWithCareTeam: true },
    };
    await putProfile(p);
    return p;
  };

  const meera = await mk('meera@demo.neurovoice', 'Meera Sharma', 'patient', { diagnosed: true, diagnosisYear: 2023, hoehnYahr: 2, birthYear: 1958, handle: 'SteadyLotus58' });
  const vikram = await mk('vikram@demo.neurovoice', 'Vikram Nair', 'patient', { diagnosed: false, hoehnYahr: 0, birthYear: 1964 });
  const arjun = await mk('arjun@demo.neurovoice', 'Arjun Sharma', 'caregiver');
  const rao = await mk('dr.rao@demo.neurovoice', 'Dr. Lakshmi Rao', 'clinician');

  for (const member of [arjun, rao]) await tracking.acceptInvite(member, (await tracking.createInvite(meera)).code);
  await tracking.acceptInvite(rao, (await tracking.createInvite(vikram)).code);

  // Meera: steady for a month, then voice and tapping drift over the last twelve days.
  await seedPatient(meera, (day, key) => (day > 12 ? 0 : (key.startsWith('voice') || key === 'tap' ? 1 : 0.35) * ((12 - day) / 12)), 0.86);
  // Vikram: stable throughout.
  await seedPatient(vikram, () => 0, 0.97);

  for (const [who, text] of [
    [meera, 'Morning stretches before my first dose are making a real difference this month.'],
    [vikram, 'Has anyone found the walking test easier in the morning?'],
    [meera, 'Yes, mornings for me too. Afternoons are harder before the six o clock dose.'],
  ] as const) {
    await social.joinGroup(who.userId, 'mid');
    await social.postMessage(who, 'mid', text);
  }
  await social.joinGroup(arjun.userId, 'carers');

  const last = new Date();
  last.setUTCMonth(last.getUTCMonth() - 1);
  await social.buildReport(meera, last.toISOString().slice(0, 7));
  await social.buildReport(meera, new Date().toISOString().slice(0, 7));

  store.flush();
  console.log(`\nSeeded synthetic demo data into ${file}\nPassword for every account: ${PASSWORD}`);
  for (const p of [meera, vikram, arjun, rao]) console.log(`  ${p.role.padEnd(10)} ${p.email}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
