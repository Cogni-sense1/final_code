// Backend port of the web app's risk fusion logic.
//
// Kept intentionally in sync with:
//   - src/constants/risk.ts        (thresholds + MODALITY_WEIGHTS)
//   - src/utils/overallRisk.ts     (calculateOverallRisk)
//
// The three surfaces (web, mobile, backend) each keep their own copy because
// they are separate runtimes/packages. If the scheme changes, update all
// copies. See DECISIONS.md.

"use strict";

// Unified risk thresholds. One 0-1 probability drives the Low/Medium/High
// label: Low < 0.30, Medium 0.30-0.66, High > 0.66. 0.30 is a deliberate
// sensitivity-first clinical cutoff (v4 model tuned for >=0.95 recall on PD).
const RISK_THRESHOLDS = Object.freeze({
  SCREENING: 0.3,
  HIGH: 0.66,
});

// Confidence weights: voice is model-backed (trusted most); face and
// finger-tap are rule-based/unvalidated (weighted lower).
const MODALITY_WEIGHTS = Object.freeze({
  voice: 0.5,
  face: 0.3,
  fingerTap: 0.2,
});

const TYPE_TO_MODALITY = Object.freeze({
  VOICE: "voice",
  FACE: "face",
  FINGER_TAP: "fingerTap",
});

const clamp01 = (n) => Math.min(1, Math.max(0, n));

/** @param {number} score 0-1 @returns {"Low"|"Medium"|"High"} */
function getRiskLevel(score) {
  const s = clamp01(score);
  if (s < RISK_THRESHOLDS.SCREENING) return "Low";
  if (s <= RISK_THRESHOLDS.HIGH) return "Medium";
  return "High";
}

/**
 * Fuse individual test results into one overall risk figure.
 * Stage 1: average within each modality (removes test-frequency bias).
 * Stage 2: combine modality averages with confidence weights, renormalized
 *          over whichever modalities have data.
 *
 * @param {Array<{type: string, riskScore: number}>} tests already window-filtered
 * @returns {{overallScore:number, riskLevel:string, breakdown:Object}}
 */
function calculateOverallRisk(tests) {
  const modalities = ["voice", "face", "fingerTap"];
  const sums = { voice: 0, face: 0, fingerTap: 0 };
  const counts = { voice: 0, face: 0, fingerTap: 0 };

  for (const test of tests || []) {
    const modality = TYPE_TO_MODALITY[test.type];
    if (!modality) continue;
    sums[modality] += clamp01(Number(test.riskScore));
    counts[modality] += 1;
  }

  const averages = {
    voice: counts.voice > 0 ? sums.voice / counts.voice : null,
    face: counts.face > 0 ? sums.face / counts.face : null,
    fingerTap: counts.fingerTap > 0 ? sums.fingerTap / counts.fingerTap : null,
  };

  const presentWeightTotal = modalities.reduce(
    (total, m) => (averages[m] !== null ? total + MODALITY_WEIGHTS[m] : total),
    0
  );

  const breakdown = {};
  let overallScore = 0;

  for (const m of modalities) {
    const average = averages[m];
    const effectiveWeight =
      average !== null && presentWeightTotal > 0
        ? MODALITY_WEIGHTS[m] / presentWeightTotal
        : 0;

    if (average !== null) overallScore += average * effectiveWeight;

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

module.exports = {
  RISK_THRESHOLDS,
  MODALITY_WEIGHTS,
  getRiskLevel,
  calculateOverallRisk,
};
