/**
 * Property-based tests for utils/storage.ts
 *
 * Feature: react-native-expo-migration
 * Property 2: TestRecord storage round-trip  — Validates: Requirements 3.2, 3.3
 * Property 3: Storage cap invariant          — Validates: Requirements 3.4
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as fc from 'fast-check';
import {
  addTestRecord,
  clearHistory,
  getTestHistory,
  TestRecord,
} from './storage';

// jest-expo ships a built-in AsyncStorage mock; reset it before each test
beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

// ─── Arbitraries ──────────────────────────────────────────────────────────────

const riskLevelArb = fc.constantFrom<'Low' | 'Medium' | 'High'>('Low', 'Medium', 'High');
const typeArb = fc.constantFrom<'VOICE' | 'FACE'>('VOICE', 'FACE');

/** Arbitrary for a valid addTestRecord input (no id / timestamp) */
const recordInputArb = fc.record({
  type: typeArb,
  name: fc.string({ minLength: 1, maxLength: 50 }),
  riskScore: fc.float({ min: 0, max: 1, noNaN: true }),
  riskLevel: riskLevelArb,
});

// ─── Property 2: TestRecord round-trip ───────────────────────────────────────
// **Validates: Requirements 3.2, 3.3**

describe('Property 2: TestRecord storage round-trip', () => {
  it('addTestRecord then getTestHistory returns a deeply equal record', async () => {
    await fc.assert(
      fc.asyncProperty(recordInputArb, async (input) => {
        // Reset storage for each iteration
        await AsyncStorage.clear();

        const saved = await addTestRecord(input);
        const history = await getTestHistory();

        // The saved record must appear in history
        const found = history.find((r) => r.id === saved.id);
        expect(found).toBeDefined();

        // All input fields must be preserved exactly
        expect(found!.type).toBe(input.type);
        expect(found!.name).toBe(input.name);
        expect(found!.riskScore).toBe(input.riskScore);
        expect(found!.riskLevel).toBe(input.riskLevel);

        // id and timestamp must be present and valid
        expect(typeof found!.id).toBe('string');
        expect(found!.id.length).toBeGreaterThan(0);
        expect(typeof found!.timestamp).toBe('number');
        expect(found!.timestamp).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });
});

// ─── Property 3: Storage cap invariant ───────────────────────────────────────
// **Validates: Requirements 3.4**

describe('Property 3: Storage cap invariant', () => {
  it('after >50 addTestRecord calls, stored list has exactly 50 records (most recent)', async () => {
    // Use a fixed count above 50 to keep the test fast but meaningful
    const EXTRA = fc.integer({ min: 1, max: 20 });

    await fc.assert(
      fc.asyncProperty(EXTRA, async (extra) => {
        await AsyncStorage.clear();

        const total = 50 + extra;
        const added: TestRecord[] = [];

        for (let i = 0; i < total; i++) {
          const record = await addTestRecord({
            type: 'VOICE',
            name: `Test ${i}`,
            riskScore: i / total,
            riskLevel: 'Low',
          });
          added.push(record);
        }

        const history = await getTestHistory();

        // Length must be capped at 50
        expect(history.length).toBe(50);

        // Must contain the 50 most recently added records (last `total` items in `added`)
        const expectedIds = new Set(added.slice(extra).map((r) => r.id));
        const actualIds = new Set(history.map((r) => r.id));

        expectedIds.forEach((id) => expect(actualIds.has(id)).toBe(true));

        // Oldest `extra` records must have been discarded
        const discardedIds = added.slice(0, extra).map((r) => r.id);
        discardedIds.forEach((id) => expect(actualIds.has(id)).toBe(false));
      }),
      { numRuns: 50 }, // fewer runs because each run adds up to 70 records
    );
  });
});
