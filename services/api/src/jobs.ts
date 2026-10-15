/**
 * Scheduled work. On AWS each export is a Lambda handler wired up in the CDK stack:
 *   listPatients + consolidate  -> Step Functions nightly workflow (one branch per patient)
 *   sweep                       -> EventBridge Scheduler, every 30 minutes
 *   monthly                     -> EventBridge Scheduler, 1st of each month
 * Locally:  npm run job -- nightly | sweep | monthly [YYYY-MM]
 */
import { fileURLToPath } from 'node:url';
import { checkMissedDoses } from './domain/health';
import { buildReport } from './domain/social';
import { consolidateDay } from './domain/tracking';
import { getProfile, listUsers } from './repo';
import { addDays, localDate, nowIso } from './time';

export async function listPatients(): Promise<{ patients: { userId: string }[] }> {
  return { patients: (await listUsers('patient')).map((p) => ({ userId: p.userId })) };
}

/** Re-fold yesterday and today for one patient, picking up late entries. */
export async function consolidate(event: { userId: string }): Promise<{ userId: string; status: string }> {
  const profile = await getProfile(event.userId);
  if (!profile) return { userId: event.userId, status: 'missing' };
  const today = localDate(nowIso(), profile.timezone);
  await consolidateDay(profile, addDays(today, -1));
  const day = await consolidateDay(profile, today);
  return { userId: event.userId, status: day.status };
}

export async function sweep(): Promise<{ patients: number; alerts: number }> {
  const patients = await listUsers('patient');
  let alerts = 0;
  for (const p of patients) alerts += (await checkMissedDoses(p)) > 0 ? 1 : 0;
  return { patients: patients.length, alerts };
}

export async function monthly(event: { month?: string } = {}): Promise<{ month: string; reports: number }> {
  const now = new Date();
  const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
  const month = event.month ?? prev;
  const patients = await listUsers('patient');
  for (const p of patients) await buildReport(p, month);
  return { month, reports: patients.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [job, arg] = process.argv.slice(2);
  const run = async (): Promise<unknown> => {
    if (job === 'sweep') return sweep();
    if (job === 'monthly') return monthly({ month: arg });
    if (job === 'nightly') {
      const { patients } = await listPatients();
      return Promise.all(patients.map(consolidate));
    }
    throw new Error('usage: npm run job -- nightly | sweep | monthly [YYYY-MM]');
  };
  run().then((out) => {
    console.log(JSON.stringify(out, null, 2));
    // Give the file store a moment to write.
    setTimeout(() => process.exit(0), 400);
  }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
