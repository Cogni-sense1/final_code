import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import type { Context, MiddlewareHandler } from 'hono';
import { jwtVerify, SignJWT } from 'jose';
import type { Profile, Role } from '@neurovoice/shared';
import { env, isLocal } from './env';
import { getProfile, newId, putProfile } from './repo';
import { getStore } from './store';
import { nowIso } from './time';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
const secret = (): Uint8Array => new TextEncoder().encode(env.localJwtSecret);

export interface Identity { userId: string; email?: string; role?: Role; name?: string }
export type Vars = { Variables: { identity: Identity; profile: Profile } };

// ── Local development accounts (never enabled on AWS, where Cognito owns sign-in) ──

export async function localSignup(input: { email: string; password: string; name: string; role: Role }): Promise<Profile | null> {
  const store = getStore();
  const email = input.email.toLowerCase();
  if (await store.get(`EMAIL#${email}`, 'AUTH')) return null;
  const salt = randomBytes(16);
  const hash = await scrypt(input.password, salt, 32);
  const profile = newProfile({ userId: newId(), email, role: input.role, name: input.name });
  await store.put({ pk: `EMAIL#${email}`, sk: 'AUTH', userId: profile.userId, salt: salt.toString('hex'), hash: hash.toString('hex') });
  await putProfile(profile);
  return profile;
}

export async function localLogin(emailRaw: string, password: string): Promise<Profile | null> {
  const row = await getStore().get(`EMAIL#${emailRaw.toLowerCase()}`, 'AUTH');
  if (!row) return null;
  const hash = await scrypt(password, Buffer.from(row.salt as string, 'hex'), 32);
  if (!timingSafeEqual(hash, Buffer.from(row.hash as string, 'hex'))) return null;
  return (await getProfile(row.userId as string)) ?? null;
}

export const localToken = (userId: string): Promise<string> =>
  new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setSubject(userId).setIssuedAt().setExpirationTime('30d').sign(secret());

// ── Token verification ───────────────────────────────────────────────────────

let cognito: ReturnType<typeof CognitoJwtVerifier.create> | undefined;

async function verify(token: string): Promise<Identity | null> {
  try {
    if (isLocal()) {
      const { payload } = await jwtVerify(token, secret(), { algorithms: ['HS256'] });
      return payload.sub ? { userId: payload.sub } : null;
    }
    cognito ??= CognitoJwtVerifier.create({ userPoolId: env.userPoolId, tokenUse: 'id', clientId: env.userPoolClientId });
    const p = (await cognito.verify(token)) as Record<string, unknown>;
    const role = p['custom:role'];
    return {
      userId: p.sub as string, email: p.email as string | undefined, name: p.name as string | undefined,
      role: role === 'caregiver' || role === 'clinician' ? role : 'patient',
    };
  } catch {
    return null;
  }
}

export function newProfile(id: Identity & { role: Role; name: string }): Profile {
  return {
    userId: id.userId, role: id.role, name: id.name, email: id.email, diagnosed: false, hoehnYahr: 0,
    locale: 'en-IN', timezone: 'Asia/Kolkata', createdAt: nowIso(),
  };
}

/** Requires a valid token and loads the caller's profile, creating it on first Cognito sign-in. */
export const requireUser: MiddlewareHandler<Vars> = async (c, next) => {
  const header = c.req.header('authorization') ?? '';
  const identity = header.startsWith('Bearer ') ? await verify(header.slice(7)) : null;
  if (!identity) return c.json({ error: 'unauthorized' }, 401);
  let profile = await getProfile(identity.userId);
  if (!profile) {
    if (isLocal()) return c.json({ error: 'unauthorized' }, 401);
    profile = newProfile({ ...identity, role: identity.role ?? 'patient', name: identity.name ?? identity.email?.split('@')[0] ?? 'Friend' });
    await putProfile(profile);
  }
  c.set('identity', identity);
  c.set('profile', profile);
  await next();
};

/** Patients must accept the current consent before any health data is stored. */
export const requireConsent: MiddlewareHandler<Vars> = async (c, next) => {
  const p = c.get('profile');
  if (p.role === 'patient' && !p.consent) return c.json({ error: 'consent_required' }, 403);
  await next();
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const me = (c: Context<any>): Profile => c.get('profile') as Profile;
