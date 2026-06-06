// Test History Management with localStorage

export interface TestRecord {
  id: string;
  type: 'VOICE' | 'FACE' | 'FINGER_TAP';
  name: string;
  riskScore: number; // 0-1 (e.g., 0.45 = 45%)
  riskLevel: 'Low' | 'Medium' | 'High';
  timestamp: number;
  metadata?: {
    age60Plus?: boolean;
    neuroHistory?: boolean;
    hypertension?: boolean;
    updrsScore?: number;
    blinkRate?: number;
    motion?: number;
    asymmetry?: number;
    // Finger Tap Assessment fields
    tapCountLeft?: number;
    tapCountRight?: number;
    tapsPerSecLeft?: number;
    tapsPerSecRight?: number;
    cvLeft?: number;
    cvRight?: number;
    fatigueDropLeft?: number;
    fatigueDropRight?: number;
    tremorScoreLeft?: number;
    tremorScoreRight?: number;
  };
}

const STORAGE_KEY = 'neurovoice_test_history';
const MAX_RECORDS = 50; // Keep last 50 tests

// Get all test records
export const getTestHistory = (): TestRecord[] => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading test history:', error);
    return [];
  }
};

// Add a new test record
export const addTestRecord = (record: Omit<TestRecord, 'id' | 'timestamp'>): TestRecord => {
  const newRecord: TestRecord = {
    ...record,
    id: generateId(),
    timestamp: Date.now(),
  };

  const history = getTestHistory();
  history.unshift(newRecord); // Add to beginning

  // Keep only last MAX_RECORDS
  const trimmedHistory = history.slice(0, MAX_RECORDS);

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmedHistory));
  } catch (error) {
    console.error('Error saving test record:', error);
  }

  return newRecord;
};

// Get records by type
export const getTestsByType = (type: 'VOICE' | 'FACE' | 'FINGER_TAP'): TestRecord[] => {
  return getTestHistory().filter(record => record.type === type);
};

// Get recent tests (last N)
export const getRecentTests = (count: number = 10): TestRecord[] => {
  return getTestHistory().slice(0, count);
};

// Get tests for last N days
export const getTestsForDays = (days: number = 7): TestRecord[] => {
  const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);
  return getTestHistory().filter(record => record.timestamp >= cutoffTime);
};

// Calculate average risk for period
export const getAverageRisk = (days: number = 7): number => {
  const tests = getTestsForDays(days);
  if (tests.length === 0) return 0;
  
  const sum = tests.reduce((acc, test) => acc + test.riskScore, 0);
  return sum / tests.length;
};

// Get daily aggregated data for charts
export const getDailyAggregatedData = (days: number = 7): Array<{
  date: string;
  day: string;
  avgRisk: number;
  count: number;
}> => {
  const tests = getTestsForDays(days);
  const dailyMap = new Map<string, { sum: number; count: number }>();

  // Group by date
  tests.forEach(test => {
    const date = new Date(test.timestamp);
    const dateKey = date.toISOString().split('T')[0]; // YYYY-MM-DD
    
    const existing = dailyMap.get(dateKey) || { sum: 0, count: 0 };
    dailyMap.set(dateKey, {
      sum: existing.sum + test.riskScore,
      count: existing.count + 1,
    });
  });

  // Convert to array and fill missing days
  const result: Array<{ date: string; day: string; avgRisk: number; count: number }> = [];
  const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateKey = date.toISOString().split('T')[0];
    const dayName = dayNames[date.getDay()];
    
    const data = dailyMap.get(dateKey);
    result.push({
      date: dateKey,
      day: dayName,
      avgRisk: data ? data.sum / data.count : 0,
      count: data ? data.count : 0,
    });
  }

  return result;
};

// Format timestamp to readable string
export const formatTimestamp = (timestamp: number): string => {
  const now = Date.now();
  const diff = now - timestamp;
  
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) {
    const date = new Date(timestamp);
    return `Today, ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
  }
  if (days === 1) {
    const date = new Date(timestamp);
    return `Yesterday, ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
  }
  
  const date = new Date(timestamp);
  return date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
};

// Generate unique ID
const generateId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

// Clear all history (for testing/reset)
export const clearHistory = (): void => {
  localStorage.removeItem(STORAGE_KEY);
};
