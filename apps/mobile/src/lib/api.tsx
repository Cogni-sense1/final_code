import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';
import { ApiError, createClient, type Config, type Profile, type Role } from '@neurovoice/shared';

/**
 * Where the API lives. On a real phone "localhost" is the phone itself, so set
 * EXPO_PUBLIC_API_URL to your computer's address, for example http://192.168.1.20:8787.
 * The Android emulator reaches the host machine at 10.0.2.2.
 */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? (Platform.OS === 'android' ? 'http://10.0.2.2:8787' : 'http://localhost:8787');
const TOKEN_KEY = 'nv.token';

// The device keychain on phones; browser storage when the app runs on the web.
const store = {
  get: async (): Promise<string | null> => (Platform.OS === 'web' ? globalThis.localStorage?.getItem(TOKEN_KEY) ?? null : SecureStore.getItemAsync(TOKEN_KEY)),
  set: async (value: string): Promise<void> => (Platform.OS === 'web' ? globalThis.localStorage?.setItem(TOKEN_KEY, value) : SecureStore.setItemAsync(TOKEN_KEY, value)),
  clear: async (): Promise<void> => (Platform.OS === 'web' ? globalThis.localStorage?.removeItem(TOKEN_KEY) : SecureStore.deleteItemAsync(TOKEN_KEY)),
};

export const api = createClient(API_URL, store.get);

interface Auth {
  ready: boolean;
  config: Config | null;
  profile: Profile | null;
  /** Set when the API cannot be reached at all. */
  offline: boolean;
  signIn(email: string, password: string): Promise<void>;
  signUp(input: { email: string; password: string; name: string; role: Role }): Promise<void>;
  signOut(): Promise<void>;
  setProfile(p: Profile): void;
  retry(): void;
}

const Ctx = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [config, setConfig] = useState<Config | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [offline, setOffline] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const cfg = await api.config();
        if (!live) return;
        setConfig(cfg);
        setOffline(false);
        try {
          setProfile((await store.get()) ? await api.me() : null);
        } catch (err) {
          if (err instanceof ApiError && err.status === 401) await store.clear();
          setProfile(null);
        }
      } catch {
        if (live) setOffline(true);
      }
      if (live) setReady(true);
    })();
    return () => { live = false; };
  }, [attempt]);

  const signIn = useCallback(async (email: string, password: string) => {
    const out = await api.login(email, password);
    await store.set(out.token);
    setProfile(out.profile);
  }, []);
  const signUp = useCallback(async (input: { email: string; password: string; name: string; role: Role }) => {
    const out = await api.signup(input);
    await store.set(out.token);
    setProfile(out.profile);
  }, []);
  const signOut = useCallback(async () => {
    await store.clear();
    setProfile(null);
  }, []);

  const value = useMemo<Auth>(
    () => ({ ready, config, profile, offline, signIn, signUp, signOut, setProfile, retry: () => { setReady(false); setAttempt((n) => n + 1); } }),
    [ready, config, profile, offline, signIn, signUp, signOut],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): Auth {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}

/** The signed-in profile. Only call inside screens that require sign-in. */
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
