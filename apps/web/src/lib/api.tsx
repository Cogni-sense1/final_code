import { AuthenticationDetails, CognitoUser, CognitoUserAttribute, CognitoUserPool, type CognitoUserSession } from 'amazon-cognito-identity-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiError, createClient, type Config, type Profile, type Role } from '@neurovoice/shared';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8787';
const TOKEN_KEY = 'nv.token';

let pool: CognitoUserPool | null = null;

function cognitoSession(): Promise<CognitoUserSession | null> {
  return new Promise((resolve) => {
    const user = pool?.getCurrentUser();
    if (!user) return resolve(null);
    // getSession refreshes an expired token on its own.
    user.getSession((err: Error | null, session: CognitoUserSession | null) => resolve(err || !session?.isValid() ? null : session));
  });
}

async function getToken(): Promise<string | null> {
  if (pool) return (await cognitoSession())?.getIdToken().getJwtToken() ?? null;
  return localStorage.getItem(TOKEN_KEY);
}

export const api = createClient(API_URL, getToken);

export interface SignUpInput { email: string; password: string; name: string; role: Role }

interface Auth {
  ready: boolean;
  config: Config | null;
  profile: Profile | null;
  /** Set when the API cannot be reached at all. */
  offline: boolean;
  signIn(email: string, password: string): Promise<void>;
  /** Returns true when an emailed confirmation code is needed next (Cognito). */
  signUp(input: SignUpInput): Promise<boolean>;
  confirm(email: string, code: string, password: string): Promise<void>;
  signOut(): void;
  setProfile(p: Profile): void;
}

const Ctx = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [config, setConfig] = useState<Config | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [offline, setOffline] = useState(false);

  const load = useCallback(async () => {
    try {
      setProfile((await getToken()) ? await api.me() : null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) localStorage.removeItem(TOKEN_KEY);
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const cfg = await api.config();
        if (cfg.authMode === 'cognito') pool = new CognitoUserPool({ UserPoolId: cfg.userPoolId, ClientId: cfg.userPoolClientId });
        setConfig(cfg);
        await load();
      } catch {
        setOffline(true);
      }
      setReady(true);
    })();
  }, [load]);

  const value = useMemo<Auth>(() => ({
    ready, config, profile, offline, setProfile,
    async signIn(email, password) {
      if (!pool) {
        const out = await api.login(email, password);
        localStorage.setItem(TOKEN_KEY, out.token);
        setProfile(out.profile);
        return;
      }
      await new Promise<void>((resolve, reject) => {
        new CognitoUser({ Username: email, Pool: pool! }).authenticateUser(new AuthenticationDetails({ Username: email, Password: password }), {
          onSuccess: () => resolve(),
          onFailure: (err: Error) => reject(new Error(err.message || 'Could not sign in.')),
        });
      });
      await load();
    },
    async signUp(input) {
      if (!pool) {
        const out = await api.signup(input);
        localStorage.setItem(TOKEN_KEY, out.token);
        setProfile(out.profile);
        return false;
      }
      await new Promise<void>((resolve, reject) => {
        pool!.signUp(input.email, input.password, [
          new CognitoUserAttribute({ Name: 'name', Value: input.name }),
          new CognitoUserAttribute({ Name: 'custom:role', Value: input.role }),
        ], [], (err) => (err ? reject(new Error(err.message)) : resolve()));
      });
      return true;
    },
    async confirm(email, code, password) {
      await new Promise<void>((resolve, reject) => {
        new CognitoUser({ Username: email, Pool: pool! }).confirmRegistration(code, true, (err) => (err ? reject(new Error(err.message)) : resolve()));
      });
      await value.signIn(email, password);
    },
    signOut() {
      pool?.getCurrentUser()?.signOut();
      localStorage.removeItem(TOKEN_KEY);
      setProfile(null);
    },
  }), [ready, config, profile, offline, load]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): Auth {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}

/** The signed-in profile. Only call inside routes that require sign-in. */
export const useProfile = (): Profile => useAuth().profile!;

/** Load data for a screen, with a reload handle. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []): { data: T | null; error: string | null; loading: boolean; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    setLoading(true);
    fn().then(
      (d) => { if (live) { setData(d); setError(null); setLoading(false); } },
      (e: Error) => { if (live) { setError(e.message); setLoading(false); } },
    );
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { data, error, loading, reload: () => setTick((t) => t + 1) };
}

export const errorText = (e: unknown): string => (e instanceof Error ? e.message : 'Something went wrong.');
