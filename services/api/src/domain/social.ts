import {
  type Assessment, type DailyProfile, type GroupId, type GroupMessage, type Profile, type Report, type SleepEntry,
  DISCLAIMER, GROUPS, MODALITIES, mean, round,
} from '@neurovoice/shared';
import { getOne, list, listBetween, newId, putOne, SK } from '../repo';
import { getStore } from '../store';
import { nowIso } from '../time';
import { insights } from './health';
import { getDays, raiseAlert } from './tracking';

// ── Monthly reports ──────────────────────────────────────────────────────────

/**
 * Monthly summaries are written by this code directly from the data, not by a language
 * model. A clinician reads them, so every statement has to be exactly what was measured;
 * in testing, a model occasionally filed a check under the wrong heading.
 */
export async function buildReport(profile: Profile, month: string): Promise<Report> {
  const from = `${month}-01`;
  const to = `${month}-31`;
  const days = await getDays(profile.userId, from, to);
  const assessments = await listBetween<Assessment>(profile.userId, 'ASSESS', `${from}T00:00:00.000Z`, `${to}T23:59:59.999Z`);
  const sleep = (await list<SleepEntry>(profile.userId, { from: SK.sleep(from), to: SK.sleep(to) }));
  const med = await insights(profile, 30);

  const modalities: Report['stats']['modalities'] = {};
  for (const d of days) {
    for (const [key, m] of Object.entries(d.modalities)) {
      const entry = (modalities[key] ??= { sessions: 0, meanIndex: null });
      entry.sessions += m.sessions;
    }
  }
  for (const key of Object.keys(modalities)) {
    const xs = days.map((d) => d.modalities[key]?.index).filter((v): v is number => v != null);
    modalities[key]!.meanIndex = xs.length ? round(mean(xs), 2) : null;
  }
  const scheduled = days.reduce((n, d) => n + d.dosesScheduled, 0);
  const stats: Report['stats'] = {
    assessments: assessments.length,
    activeDays: days.filter((d) => Object.keys(d.modalities).length > 0).length,
    adherencePct: scheduled ? Math.min(100, Math.round((days.reduce((n, d) => n + d.dosesTaken, 0) / scheduled) * 100)) : null,
    offReports: days.reduce((n, d) => n + d.offReports, 0),
    avgSleepScore: sleep.length ? Math.round(mean(sleep.map((s) => s.score))) : null,
    modalities,
  };

  const label = (key: string): string => {
    const [type, task] = key.split(':');
    const spec = MODALITIES[type as keyof typeof MODALITIES];
    const name = (spec?.name ?? type ?? key).toLowerCase();
    return task ? `${name}, ${(spec?.tasks?.find((t) => t.id === task)?.name ?? task).toLowerCase()}` : name;
  };
  const joined = (xs: string[]): string => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
  const checks = Object.entries(modalities);
  const within = checks.filter(([, m]) => m.meanIndex !== null && m.meanIndex < 1).map(([k]) => label(k));
  const little = checks.filter(([, m]) => m.meanIndex !== null && m.meanIndex >= 1 && m.meanIndex < 2).map(([k, m]) => `${label(k)} (index ${m.meanIndex})`);
  const clearly = checks.filter(([, m]) => m.meanIndex !== null && m.meanIndex >= 2).map(([k, m]) => `${label(k)} (index ${m.meanIndex})`);
  const building = checks.filter(([, m]) => m.meanIndex === null).map(([k]) => label(k));

  const monthName = new Date(`${month}-15T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const dreamNights = sleep.filter((n) => n.actedOutDreams).length;
  const wearing = med.wearingOffMinutes;
  const sentences = [
    `${profile.name} completed ${stats.assessments} checks on ${stats.activeDays} days in ${monthName}.`,
    clearly.length ? `Clearly above the personal baseline: ${joined(clearly)}.` : '',
    little.length ? `A little above the personal baseline: ${joined(little)}.` : '',
    within.length ? `Within the personal baseline: ${joined(within)}.` : '',
    building.length ? `Baseline still being established: ${joined(building)}.` : '',
    !checks.length ? 'No checks were completed, so there is nothing to compare this month.' : '',
    stats.adherencePct !== null
      ? `${stats.adherencePct}% of scheduled doses were logged, with ${stats.offReports} off period${stats.offReports === 1 ? '' : 's'} reported` +
        (med.peakLabel ? `, most often from ${med.peakLabel}` : '') + '.' +
        (wearing ? ` The typical time from a levodopa dose to the next off report was ${Math.floor(wearing / 60)} h ${wearing % 60} min.` : '')
      : '',
    stats.avgSleepScore !== null
      ? `The average sleep score was ${stats.avgSleepScore} out of 100, and dream enactment was reported on ${dreamNights} night${dreamNights === 1 ? '' : 's'}.`
      : '',
    'An index counts how far a check sits from this person\'s own baseline, in the direction of worsening: 1 is a little off, 2 or more is clearly different.',
  ].filter(Boolean);

  const report: Report = { month, generatedAt: nowIso(), engine: 'local', summary: `${sentences.join(' ')}\n\n${DISCLAIMER}`, stats };
  await putOne(profile.userId, SK.report(month), report);
  await raiseAlert(profile, {
    kind: 'report_ready', severity: 'info', title: `Monthly summary for ${monthName}`,
    detail: `The ${monthName} summary is ready to view.`,
  }, 20);
  return report;
}

export const listReports = (userId: string): Promise<Report[]> => list<Report>(userId, { prefix: 'REPORT#', desc: true });

// ── Peer community ───────────────────────────────────────────────────────────

const ADJ = ['Quiet', 'Steady', 'Bright', 'Gentle', 'Brave', 'Calm', 'Kind', 'Sunny'];
const NOUN = ['Heron', 'Banyan', 'River', 'Lotus', 'Kite', 'Maple', 'Robin', 'Tulsi'];

/** Community posts show a handle, never the real name. */
export function handleFor(profile: Profile): string {
  if (profile.handle) return profile.handle;
  let h = 0;
  for (const c of profile.userId) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `${ADJ[h % 8]}${NOUN[(h >> 3) % 8]}${(h % 90) + 10}`;
}

export function suggestedGroup(profile: Profile): GroupId {
  if (profile.role !== 'patient') return 'carers';
  return GROUPS.find((g) => (g.stages as readonly number[]).includes(profile.hoehnYahr))?.id ?? 'watchful';
}

export async function groupsFor(profile: Profile): Promise<{ id: string; name: string; description: string; joined: boolean; suggested: boolean }[]> {
  const joined = new Set((await list<{ groupId: string }>(profile.userId, { prefix: 'GROUPMEMBER#' })).map((g) => g.groupId));
  const suggested = suggestedGroup(profile);
  return GROUPS.map((g) => ({ id: g.id, name: g.name, description: g.description, joined: joined.has(g.id), suggested: g.id === suggested }));
}

const isGroup = (id: string): boolean => GROUPS.some((g) => g.id === id);

export async function joinGroup(userId: string, groupId: string): Promise<boolean> {
  if (!isGroup(groupId)) return false;
  await putOne(userId, SK.group(groupId), { groupId, joinedAt: nowIso() });
  return true;
}

export async function leaveGroup(userId: string, groupId: string): Promise<void> {
  await getStore().delete(`USER#${userId}`, SK.group(groupId));
}

export const isMember = async (userId: string, groupId: string): Promise<boolean> =>
  (await getOne(userId, SK.group(groupId))) !== undefined;

export async function groupMessages(groupId: string, afterIso?: string): Promise<GroupMessage[]> {
  const items = await getStore().query(`GROUP#${groupId}`, afterIso ? { from: `MSG#${afterIso}\u0000` } : { prefix: 'MSG#', desc: true, limit: 80 });
  const msgs = items.map(({ pk: _pk, sk: _sk, ...m }) => m as unknown as GroupMessage);
  return afterIso ? msgs : msgs.reverse();
}

/** Contact details stay out of group chat to protect members. */
const CONTACT = /(\+?\d[\d\s-]{8,}\d)|([\w.+-]+@[\w-]+\.[\w.]+)|(https?:\/\/)/i;

export async function postMessage(profile: Profile, groupId: string, text: string): Promise<GroupMessage | { error: string }> {
  if (CONTACT.test(text)) return { error: 'Please keep phone numbers, emails, and links out of the group.' };
  const msg: GroupMessage = { id: newId(), at: nowIso(), groupId, authorId: profile.userId, handle: handleFor(profile), text: text.trim() };
  await getStore().put({ ...msg, pk: `GROUP#${groupId}`, sk: `MSG#${msg.at}#${msg.id}` });
  return msg;
}

export type { DailyProfile };
