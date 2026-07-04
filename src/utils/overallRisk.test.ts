import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { calculateOverallRisk, type ScoredTest } from './overallRisk';
import { MODALITY_WEIGHTS } from '@/constants/risk';

const voice = (riskScore: number): ScoredTest => ({ type: 'VOICE', riskScore });
const face = (riskScore: number): ScoredTest => ({ type: 'FACE', riskScore });
const finger = (riskScore: number): ScoredTest => ({ type: 'FINGER_TAP', riskScore });

const approx = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;

describe('calculateOverallRisk', () => {
  it('returns a Low, zero-score result for no tests', () => {
    const result = calculateOverallRisk([]);
    expect(result.overallScore).toBe(0);
    expect(result.riskLevel).toBe('Low');
    expect(result.breakdown.voice.count).toBe(0);
    expect(result.breakdown.voice.average).toBeNull();
    expect(result.breakdown.voice.weight).toBe(0);
    expect(result.breakdown.voice.contribution).toBe(0);
  });

  describe('single-modality-only input', () => {
    it('gives that modality 100% weight and uses its average as the score', () => {
      const result = calculateOverallRisk([voice(0.8), voice(0.6)]);

      // Voice average = 0.7, and with only one modality present its weight
      // renormalizes to 1.0, so the overall score equals the voice average.
      expect(approx(result.breakdown.voice.average!, 0.7)).toBe(true);
      expect(approx(result.breakdown.voice.weight, 1)).toBe(true);
      expect(result.breakdown.voice.contribution).toBe(100);
      expect(approx(result.overallScore, 0.7)).toBe(true);
      expect(result.riskLevel).toBe('High'); // 0.7 > 0.66

      // Absent modalities contribute nothing.
      expect(result.breakdown.face.weight).toBe(0);
      expect(result.breakdown.fingerTap.weight).toBe(0);
    });

    it('works for a single finger-tap-only result too', () => {
      const result = calculateOverallRisk([finger(0.2)]);
      expect(approx(result.breakdown.fingerTap.weight, 1)).toBe(true);
      expect(approx(result.overallScore, 0.2)).toBe(true);
      expect(result.riskLevel).toBe('Low'); // 0.2 < 0.30
    });
  });

  describe('uneven test frequency (no frequency bias)', () => {
    it('a modality tested 5x does NOT dominate one tested 1x', () => {
      // 5 high voice tests (avg 0.9) + 1 low face test (0.1).
      const tests: ScoredTest[] = [
        voice(0.9), voice(0.9), voice(0.9), voice(0.9), voice(0.9),
        face(0.1),
      ];
      const result = calculateOverallRisk(tests);

      // Within-modality averaging: voice avg = 0.9 (counted ONCE), face = 0.1.
      // Weights renormalize over {voice, face}: 0.5/0.8 and 0.3/0.8.
      // Fusion = 0.9*(0.625) + 0.1*(0.375) = 0.5625 + 0.0375 = 0.6.
      expect(approx(result.overallScore, 0.6)).toBe(true);

      // A naive flat average over the 6 tests would be
      // (0.9*5 + 0.1) / 6 = 4.6/6 ≈ 0.767 — much higher because voice is
      // over-represented. Fusion must be clearly lower than that.
      const flatAverage = (0.9 * 5 + 0.1) / 6;
      expect(result.overallScore).toBeLessThan(flatAverage - 0.1);

      // Face still carries its full confidence weight despite one test.
      expect(approx(result.breakdown.face.weight, 0.3 / 0.8)).toBe(true);
      expect(result.breakdown.voice.count).toBe(5);
      expect(result.breakdown.face.count).toBe(1);
    });
  });

  describe('all three modalities present', () => {
    it('applies the nominal 50/30/20 confidence weights', () => {
      const result = calculateOverallRisk([voice(0.5), face(0.5), finger(0.5)]);
      expect(approx(result.breakdown.voice.weight, 0.5)).toBe(true);
      expect(approx(result.breakdown.face.weight, 0.3)).toBe(true);
      expect(approx(result.breakdown.fingerTap.weight, 0.2)).toBe(true);
      expect(result.breakdown.voice.contribution).toBe(50);
      expect(result.breakdown.face.contribution).toBe(30);
      expect(result.breakdown.fingerTap.contribution).toBe(20);
      // All averages equal → overall equals that value.
      expect(approx(result.overallScore, 0.5)).toBe(true);
      expect(result.riskLevel).toBe('Medium');
    });
  });

  describe('missing modalities (renormalization)', () => {
    it('renormalizes weights when face has no tests (voice 0.5/0.7, fingerTap 0.2/0.7)', () => {
      const result = calculateOverallRisk([voice(0.8), finger(0.3)]);

      expect(approx(result.breakdown.voice.weight, 0.5 / 0.7)).toBe(true);
      expect(approx(result.breakdown.fingerTap.weight, 0.2 / 0.7)).toBe(true);
      expect(result.breakdown.face.weight).toBe(0);
      expect(result.breakdown.face.average).toBeNull();

      const expected = 0.8 * (0.5 / 0.7) + 0.3 * (0.2 / 0.7);
      expect(approx(result.overallScore, expected)).toBe(true);
    });

    it('renormalizes when only voice + face are present', () => {
      const result = calculateOverallRisk([voice(0.6), face(0.2)]);
      expect(approx(result.breakdown.voice.weight, 0.5 / 0.8)).toBe(true);
      expect(approx(result.breakdown.face.weight, 0.3 / 0.8)).toBe(true);
      expect(result.breakdown.fingerTap.weight).toBe(0);
    });
  });

  describe('properties (fast-check)', () => {
    const scoreArb = fc.double({ min: 0, max: 1, noNaN: true });
    const testArb = fc.record({
      type: fc.constantFrom<'VOICE' | 'FACE' | 'FINGER_TAP'>('VOICE', 'FACE', 'FINGER_TAP'),
      riskScore: scoreArb,
    });

    it('effective weights of present modalities always sum to ~1 (when any tests exist)', () => {
      fc.assert(
        fc.property(fc.array(testArb, { minLength: 1, maxLength: 40 }), (tests) => {
          const { breakdown } = calculateOverallRisk(tests);
          const weightSum =
            breakdown.voice.weight + breakdown.face.weight + breakdown.fingerTap.weight;
          expect(approx(weightSum, 1, 1e-9)).toBe(true);
        }),
      );
    });

    it('overall score always stays within [0, 1] and within the min/max of modality averages', () => {
      fc.assert(
        fc.property(fc.array(testArb, { minLength: 1, maxLength: 40 }), (tests) => {
          const { overallScore, breakdown } = calculateOverallRisk(tests);
          expect(overallScore).toBeGreaterThanOrEqual(0);
          expect(overallScore).toBeLessThanOrEqual(1);

          const presentAverages = [breakdown.voice, breakdown.face, breakdown.fingerTap]
            .filter((b) => b.average !== null)
            .map((b) => b.average as number);
          const lo = Math.min(...presentAverages);
          const hi = Math.max(...presentAverages);
          // A convex combination can never leave the range of its inputs.
          expect(overallScore).toBeGreaterThanOrEqual(lo - 1e-9);
          expect(overallScore).toBeLessThanOrEqual(hi + 1e-9);
        }),
      );
    });

    it('weights never exceed their nominal confidence ceiling', () => {
      fc.assert(
        fc.property(fc.array(testArb, { minLength: 1, maxLength: 40 }), (tests) => {
          const { breakdown } = calculateOverallRisk(tests);
          // Renormalization only ever scales a weight UP to at most 1, and a
          // present modality's share is >= its nominal weight.
          (['voice', 'face', 'fingerTap'] as const).forEach((m) => {
            if (breakdown[m].average !== null) {
              expect(breakdown[m].weight).toBeGreaterThanOrEqual(MODALITY_WEIGHTS[m] - 1e-9);
              expect(breakdown[m].weight).toBeLessThanOrEqual(1 + 1e-9);
            }
          });
        }),
      );
    });
  });
});
