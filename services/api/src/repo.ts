import { randomUUID } from 'node:crypto';
import type { Profile, Role } from '@neurovoice/shared';
import { getStore, type Item, type QueryOpts } from './store';

export const userPk = (id: string): string => `USER#${id}`;
export const newId = (): string => randomUUID().replace(/-/g, '').slice(0, 16);

/** Sort keys. Timestamped keys sort chronologically. */
export const SK = {
  profile: 'PROFILE',
  assess: (ts: string, id: string) => `ASSESS#${ts}#${id}`,
  baseline: (key: string) => `BASELINE#${key}`,
  day: (date: string) => `DAY#${date}`,
  med: (id: string) => `MED#${id}`,
  dose: (ts: string, id: string) => `DOSE#${ts}#${id}`,
  symptom: (ts: string, id: string) => `SYMPTOM#${ts}#${id}`,
  sleep: (date: string) => `SLEEP#${date}`,
  dystonia: (ts: string, id: string) => `DYST#${ts}#${id}`,
  chat: (ts: string, id: string) => `CHAT#${ts}#${id}`,
  checkin: (date: string) => `CHECKIN#${date}`,
  /** Things the companion remembers, and questions saved for the doctor. */
  memory: (ts: string, id: string) => `MEM#${ts}#${id}`,
  /** On the patient: who can see me. */
  link: (memberId: string) => `LINK#${memberId}`,
  /** On the caregiver or clinician: whom I can see. */
  patient: (patientId: string) => `PATIENT#${patientId}`,
  alert: (ts: string, id: string) => `ALERT#${ts}#${id}`,
  report: (month: string) => `REPORT#${month}`,
  group: (groupId: string) => `GROUPMEMBER#${groupId}`,
};

const KEYS = new Set(['pk', 'sk', 'gsi1pk', 'gsi1sk', 'ttl']);

export function strip<T>(item: Item): T {
  return Object.fromEntries(Object.entries(item).filter(([k]) => !KEYS.has(k))) as T;
}

export async function getOne<T>(userId: string, sk: string): Promise<T | undefined> {
  const item = await getStore().get(userPk(userId), sk);
  return item ? strip<T>(item) : undefined;
}

export async function putOne(userId: string, sk: string, data: object, extra: Partial<Item> = {}): Promise<void> {
  await getStore().put({ ...data, ...extra, pk: userPk(userId), sk });
}

export async function list<T>(userId: string, opts: QueryOpts): Promise<T[]> {
  return (await getStore().query(userPk(userId), opts)).map((i) => strip<T>(i));
}

/** Items whose timestamped sort key falls in [fromIso, toIso]. */
export function listBetween<T>(userId: string, kind: string, fromIso: string, toIso: string): Promise<T[]> {
  return list<T>(userId, { from: `${kind}#${fromIso}`, to: `${kind}#${toIso}￿` });
}

export const getProfile = (id: string): Promise<Profile | undefined> => getOne<Profile>(id, SK.profile);

export async function putProfile(p: Profile): Promise<void> {
  await putOne(p.userId, SK.profile, p, { gsi1pk: 'USERS', gsi1sk: `${p.role}#${p.userId}` });
  if (p.phone) await getStore().put({ pk: `PHONE#${p.phone}`, sk: 'PHONE', userId: p.userId });
}

export async function listUsers(role?: Role): Promise<Profile[]> {
  const items = await getStore().queryGsi1('USERS', role ? { prefix: `${role}#` } : {});
  return items.map((i) => strip<Profile>(i));
}

export async function userIdByPhone(phone: string): Promise<string | undefined> {
  return (await getStore().get(`PHONE#${phone}`, 'PHONE'))?.userId as string | undefined;
}

/** Delete every item stored under a user. */
export async function purgeUser(userId: string): Promise<number> {
  const store = getStore();
  const items = await store.query(userPk(userId));
  for (const i of items) await store.delete(i.pk, i.sk);
  return items.length;
}
