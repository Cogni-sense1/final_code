// Multimodal risk fusion (Task 4)
//
// Combines individual test scores into ONE overall risk figure. This replaces
// the old flat average (see getAverageRisk in testHistory.ts), which had two
// flaws:
//
//   (a) Frequency bias — whichever modality was tested most often silently
//       dominated the mean. Ten voice tests + one face test made the result
//       ~91% voice regardless of intent.
//   (b) Trustworthiness mismatch — a trained, calibrated ML probability
//       (voice) was averaged as an equal peer with hand-tuned, rule-based
//       heuristics (face, finger-tap).
//
// The fix, in two stages:
//   1. Average WITHIN each modality first, so test frequency no longer leaks
//      into the blend (5 voice tests still count as "the voice opinion", once).
//   2. Combine the per-modality averages with fixed CONFIDENCE weights
//      (voice 0.5, face 0.3, fingerTap 0.2 — see MODALITY_WEIGHTS), and
//      renormalize those weights over whichever modalities actually have data.

import {
  MODALITY_WEIGHTS,
  getRiskLevel,
  type Modality,
  type RiskLevel,
} from '@/constants/risk';

/** Minimal shape needed from a test record for fusion. */
export interface ScoredTest {
  type: 'VOICE' | 'FACE' | 'FINGER_TAP';
  riskScore: number; // 0–1
}

export interface ModalityBreakdown {
  /** Mean risk score (0–1) of this modality's tests, or null if none. */
  average: number | null;
  /** Effective (renormalized) weight applied, 0–1. 0 when the modality has no tests. */
  weight: number;
  /** Effective weight expressed as a percentage (0–100), rounded — what the UI shows. */
  contribution: number;
  /** Number of tests of this modality in the window. */
  count: number;
}

export interface OverallRisk {
  /** Fused overall risk score, 0–1. */
  overallScore: number;
  /** Unified Low/Medium/High label for the overall score. */
  riskLevel: RiskLevel;
  /** Per-modality detail, keyed by modality. */
  breakdown: Record<Modality, ModalityBreakdown>;
}

/** Map a stored test record type to a fusion modality key. */
const TYPE_TO_MODALITY: Record<ScoredTest['type'], Modality> = {
  VOICE: 'voice',
  FACE: 'face',
  FINGER_TAP: 'fingerTap',
};

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

/**
 * Fuse a set of individual test results into one overall risk figure.
 *
 * @param tests Test records already filtered to the desired time window.
 *              (Filtering by date range is the caller's responsibility.)
 */
export function calculateOverallRisk(tests: ScoredTest[]): OverallRisk {
  const modalities: Modality[] = ['voice', 'face', 'fingerTap'];

  // Stage 1: average within each modality.
  const sums: Record<Modality, number> = { voice: 0, face: 0, fingerTap: 0 };
  const counts: Record<Modality, number> = { voice: 0, face: 0, fingerTap: 0 };

  for (const test of tests) {
    const modality = TYPE_TO_MODALITY[test.type];
    if (!modality) continue; // ignore unknown types defensively
    sums[modality] += clamp01(test.riskScore);
    counts[modality] += 1;
  }

  const averages: Record<Modality, number | null> = {
    voice: counts.voice > 0 ? sums.voice / counts.voice : null,
    face: counts.face > 0 ? sums.face / counts.face : null,
    fingerTap: counts.fingerTap > 0 ? sums.fingerTap / counts.fingerTap : null,
  };

  // Stage 2: renormalize confidence weights over the modalities that have data.
  const presentWeightTotal = modalities.reduce(
    (total, m) => (averages[m] !== null ? total + MODALITY_WEIGHTS[m] : total),
    0,
  );

  const breakdown = {} as Record<Modality, ModalityBreakdown>;
  let overallScore = 0;

  for (const m of modalities) {
    const average = averages[m];
    const effectiveWeight =
      average !== null && presentWeightTotal > 0
        ? MODALITY_WEIGHTS[m] / presentWeightTotal
        : 0;

    if (average !== null) {
      overallScore += average * effectiveWeight;
    }

    breakdown[m] = {
      average,
      weight: effectiveWeight,
      contribution: Math.round(effectiveWeight * 100),
      count: counts[m],
    };
  }

  overallScore = clamp01(overallScore);

  return {
    overallScore,
    riskLevel: getRiskLevel(overallScore),
    breakdown,
  };
}
