// Async storage utilities for NeuroVoice Mobile
// Replaces localStorage-based userProfile.ts and testHistory.ts

import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Keys ────────────────────────────────────────────────────────────────────

const USER_NAME_KEY = 'neurovoice_user_name';
const USER_ROLE_KEY = 'neurovoice_user_role';
const HISTORY_KEY = 'neurovoice_test_history';
const MAX_RECORDS = 50;

// ─── Types ───────────────────────────────────────────────────────────────────

export type UserRole = 'user' | 'doctor' | 'caregiver';

export interface TestRecord {
  id: string;
  type: 'VOICE' | 'FACE' | 'DRAWING' | 'FINGER';
  name: string;
  riskScore: number; // 0–1
  riskLevel: 'Low' | 'Medium' | 'High' | 'Normal' | 'Mild' | 'Moderate' | 'Severe';
  timestamp: number; // Unix ms
  metadata?: {
    age60Plus?: boolean;
    neuroHistory?: boolean;
    hypertension?: boolean;
    updrsScore?: number;
    blinkRate?: number;
    motion?: number;
    asymmetry?: number;
    // Drawing test
    tremorIndex?: string | number;
    speedCV?: number;
    meanSpeed?: number;
    spiralRMSE?: string | number;
    strokeCount?: number;
    totalTime?: number;
    // Finger tapping
    tapSpeedLeft?: number;
    tapSpeedRight?: number;
    leftFrequency?: number;
    rightFrequency?: number;
    leftUpdrs?: number;
    rightUpdrs?: number;
    combinedUpdrs?: number;
    [key: string]: unknown;
  };
}

export interface DailyData {
  day: string;
  avgRisk: number;
  count: number;
}

// ─── User Profile ─────────────────────────────────────────────────────────────

export const getUserName = async (): Promise<string> => {
  try {
    const name = await AsyncStorage.getItem(USER_NAME_KEY);
    return name ?? '';
  } catch (error) {
    console.error('Error reading user name:', error);
    return '';
  }
};

export const setUserName = async (name: string): Promise<void> => {
  try {
    await AsyncStorage.setItem(USER_NAME_KEY, name.trim());
  } catch (error) {
    console.error('Error saving user name:', error);
  }
};

export const getUserRole = async (): Promise<UserRole | null> => {
  try {
    const role = await AsyncStorage.getItem(USER_ROLE_KEY);
    return role as UserRole | null;
  } catch (error) {
    console.error('Error reading user role:', error);
    return null;
  }
};

export const setUserRole = async (role: UserRole): Promise<void> => {
  try {
    await AsyncStorage.setItem(USER_ROLE_KEY, role);
  } catch (error) {
    console.error('Error saving user role:', error);
  }
};

export const hasCompletedOnboarding = async (): Promise<boolean> => {
  const name = await getUserName();
  return name.length > 0;
};

export const clearProfile = async (): Promise<void> => {
  try {
    await AsyncStorage.multiRemove([USER_NAME_KEY, USER_ROLE_KEY]);
  } catch (error) {
    console.error('Error clearing profile:', error);
  }
};

// ─── Test History ─────────────────────────────────────────────────────────────

export const getTestHistory = async (): Promise<TestRecord[]> => {
  try {
    const data = await AsyncStorage.getItem(HISTORY_KEY);
    if (!data) return [];
    return JSON.parse(data) as TestRecord[];
  } catch (error) {
    console.error('Error reading test history:', error);
    return [];
  }
};

export const addTestRecord = async (
  record: Omit<TestRecord, 'id' | 'timestamp'>,
): Promise<TestRecord> => {
  const newRecord: TestRecord = {
    ...record,
    id: generateId(),
    timestamp: Date.now(),
  };

  const history = await getTestHistory();
  history.unshift(newRecord); // newest first

  const trimmed = history.slice(0, MAX_RECORDS);

  try {
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
  } catch (error) {
    console.error('Error saving test record:', error);
  }

  return newRecord;
};

export const getTestsByType = async (type: 'VOICE' | 'FACE' | 'DRAWING' | 'FINGER'): Promise<TestRecord[]> => {
  const history = await getTestHistory();
  return history.filter((r) => r.type === type);
};

export const getRecentTests = async (count: number = 10): Promise<TestRecord[]> => {
  const history = await getTestHistory();
  return history.slice(0, count);
};

export const clearHistory = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(HISTORY_KEY);
  } catch (error) {
    console.error('Error clearing history:', error);
  }
};

// ─── Analytics ────────────────────────────────────────────────────────────────

const getTestsForDays = async (days: number): Promise<TestRecord[]> => {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const history = await getTestHistory();
  return history.filter((r) => r.timestamp >= cutoff);
};

export const getAverageRisk = async (days: number = 7): Promise<number> => {
  const tests = await getTestsForDays(days);
  if (tests.length === 0) return 0;
  const sum = tests.reduce((acc, t) => acc + t.riskScore, 0);
  return sum / tests.length;
};

export const getDailyAggregatedData = async (days: number = 7): Promise<DailyData[]> => {
  const tests = await getTestsForDays(days);
  const dailyMap = new Map<string, { sum: number; count: number }>();

  tests.forEach((test) => {
    const dateKey = new Date(test.timestamp).toISOString().split('T')[0];
    const existing = dailyMap.get(dateKey) ?? { sum: 0, count: 0 };
    dailyMap.set(dateKey, { sum: existing.sum + test.riskScore, count: existing.count + 1 });
  });

  const DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const result: DailyData[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateKey = date.toISOString().split('T')[0];
    const data = dailyMap.get(dateKey);
    result.push({
      day: DAY_NAMES[date.getDay()],
      avgRisk: data ? data.sum / data.count : 0,
      count: data ? data.count : 0,
    });
  }

  return result;
};

// ─── Formatting ───────────────────────────────────────────────────────────────

export const formatTimestamp = (timestamp: number): string => {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;

  const date = new Date(timestamp);
  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

  if (hours < 24) return `Today, ${time}`;
  if (days === 1) return `Yesterday, ${time}`;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const generateId = (): string =>
  `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
