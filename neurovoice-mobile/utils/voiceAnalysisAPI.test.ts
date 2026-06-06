/**
 * Property-based tests for utils/voiceAnalysisAPI.ts
 *
 * Feature: react-native-expo-migration
 * Property 4: Voice API FormData completeness
 * **Validates: Requirements 5.6**
 */

import * as fc from 'fast-check';

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Capture FormData calls so we can inspect the appended fields
const formDataAppendMock = jest.fn();
const formDataGetMock = jest.fn();

// Track all appended entries per FormData instance
let capturedEntries: Array<[string, unknown]> = [];

jest.mock('expo-network', () => ({
  getNetworkStateAsync: jest.fn().mockResolvedValue({
    isConnected: true,
    isInternetReachable: true,
  }),
}));

// Override global FormData with a minimal spy implementation
(global as any).FormData = class MockFormData {
  private entries: Array<[string, unknown]> = [];

  append(key: string, value: unknown) {
    formDataAppendMock(key, value);
    this.entries.push([key, value]);
    capturedEntries.push([key, value]);
  }

  get(key: string) {
    const entry = this.entries.find(([k]) => k === key);
    return entry ? entry[1] : null;
  }

  has(key: string) {
    return this.entries.some(([k]) => k === key);
  }
};

// Mock global fetch to resolve successfully without hitting the network
(global as any).fetch = jest.fn().mockResolvedValue({
  ok: true,
  status: 200,
  json: async () => ({ risk_score: 0.3, risk_level: 'Low' }),
});

// ─── Import after mocks are set up ───────────────────────────────────────────

import { analyzeVoice, VoiceAnalysisMetadata } from './voiceAnalysisAPI';

// ─── Arbitraries ──────────────────────────────────────────────────────────────

const binaryArb = fc.constantFrom<0 | 1>(0, 1);

const metadataArb = fc.record<VoiceAnalysisMetadata>({
  ac: binaryArb,
  nth: binaryArb,
  htn: binaryArb,
  updrs: fc.integer({ min: 0, max: 108 }),
});

// URI strings: non-empty strings that look like file URIs
const uriArb = fc.string({ minLength: 1, maxLength: 200 }).map((s) => `file:///recordings/${s}`);

// ─── Property 4: Voice API FormData completeness ──────────────────────────────
// **Validates: Requirements 5.6**

describe('Property 4: Voice API FormData completeness', () => {
  beforeEach(() => {
    formDataAppendMock.mockClear();
    capturedEntries = [];
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ risk_score: 0.3, risk_level: 'Low' }),
    });
  });

  it('FormData contains all five required fields for any valid metadata and URI', async () => {
    await fc.assert(
      fc.asyncProperty(metadataArb, uriArb, async (metadata, uri) => {
        capturedEntries = [];
        formDataAppendMock.mockClear();

        await analyzeVoice(uri, metadata);

        // Collect the keys that were appended
        const appendedKeys = formDataAppendMock.mock.calls.map(([key]) => key);

        // All five required fields must be present
        expect(appendedKeys).toContain('audio');
        expect(appendedKeys).toContain('ac');
        expect(appendedKeys).toContain('nth');
        expect(appendedKeys).toContain('htn');
        expect(appendedKeys).toContain('updrs');
      }),
      { numRuns: 100 },
    );
  });

  it('audio field uses React Native { uri, name, type } object syntax (not Blob)', async () => {
    await fc.assert(
      fc.asyncProperty(metadataArb, uriArb, async (metadata, uri) => {
        capturedEntries = [];
        formDataAppendMock.mockClear();

        await analyzeVoice(uri, metadata);

        // Find the audio field call
        const audioCall = formDataAppendMock.mock.calls.find(([key]) => key === 'audio');
        expect(audioCall).toBeDefined();

        const audioValue = audioCall![1] as { uri: string; name: string; type: string };
        // Must be an object with uri, name, type — not a Blob
        expect(typeof audioValue).toBe('object');
        expect(audioValue.uri).toBe(uri);
        expect(audioValue.name).toBe('recording.m4a');
        expect(audioValue.type).toBe('audio/m4a');
      }),
      { numRuns: 100 },
    );
  });

  it('metadata fields are serialised as strings matching the input values', async () => {
    await fc.assert(
      fc.asyncProperty(metadataArb, uriArb, async (metadata, uri) => {
        capturedEntries = [];
        formDataAppendMock.mockClear();

        await analyzeVoice(uri, metadata);

        const calls = formDataAppendMock.mock.calls;
        const get = (key: string) => calls.find(([k]) => k === key)?.[1];

        expect(get('ac')).toBe(metadata.ac.toString());
        expect(get('nth')).toBe(metadata.nth.toString());
        expect(get('htn')).toBe(metadata.htn.toString());
        expect(get('updrs')).toBe(metadata.updrs.toString());
      }),
      { numRuns: 100 },
    );
  });
});
