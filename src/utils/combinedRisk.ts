/**
 * combinedRisk.ts
 * ------------------------------------------------------------------
 * Fuses the individual screening exercises (voice, finger tap, face, gait)
 * into a single composite Parkinson's screening score.
 *
 * WHY A WEIGHTED FUSION (and how the weights were chosen)
 * -------------------------------------------------------
 * No single at-home test is diagnostic. A composite is more robust, but the
 * modalities differ in (a) how strongly the underlying sign is tied to PD in
 * the clinical literature, and (b) how *reliably we can measure it* on a phone.
 * Each modality's weight is the product of those two factors, then normalised.
 *
 *   modality      clinical signal (evidence)                 our measurement    weight
 *   -----------   ----------------------------------------   ----------------   ------
 *   finger tap    bradykinesia, MDS-UPDRS 3.4 (core motor)   high (MediaPipe)   0.25
 *   drawing       tremor + fine-motor (spiral/wave, well-    high (touch)       0.20
 *                 validated PD screening task)
 *   gait          MDS-UPDRS 3.10, arm-swing asymmetry         medium-high        0.20
 *   face          hypomimia, MDS-UPDRS 3.2 (specific)         medium             0.20
 *   voice         hypophonia/dysphonia, early & sensitive     LOW (AUC~0.59)     0.15
 *
 * Rationale:
 *   - Finger tap gets the most weight: bradykinesia on repetitive movement is a
 *     cardinal, required sign for PD diagnosis, and our hand-tracking measures
 *     it directly and reliably.
 *   - Drawing (Archimedes spiral / meander wave) is a well-validated PD motor
 *     screening task; tremor index and spiral deviation are measured reliably
 *     on a touchscreen, so it joins finger tap as a core motor signal.
 *   - Gait and face are weighted similarly: both map to specific MDS-UPDRS motor
 *     items we can measure with pose/face mesh.
 *   - Voice is DELIBERATELY down-weighted. Vocal changes are clinically early
 *     and sensitive, but the current acoustic model only reaches AUC ~0.59 on
 *     honest (leak-free) validation, so we must not let it dominate. Increase
 *     this weight once a stronger voice model is trained (see backend/python).
 *
 * These weights are tunable constants so they can be recalibrated (ideally by
 * fitting a logistic model on real multi-modal labelled data).
 *
 * The composite is NOT a diagnosis. It is a screening aid only.
 * ------------------------------------------------------------------
 */

import { getTestHistory, TestRecord } from "@/utils/testHistory";

export type Modality = "VOICE" | "FINGER_TAP" | "FACE" | "GAIT" | "DRAWING";
export type RiskLevel = "Low" | "Medium" | "High";

/** Base weights (must sum to 1 across the modalities). */
export const MODALITY_WEIGHTS: Record<Modality, number> = {
  FINGER_TAP: 0.25,
  DRAWING: 0.20,
  GAIT: 0.20,
  FACE: 0.20,
  VOICE: 0.15,
};

/** Composite thresholds → level. */
export const COMBINED_THRESHOLDS = { medium: 0.3, high: 0.6 };

export interface ModalityContribution {
  modality: Modality;
  present: boolean;         // did we have a recent result for this modality?
  risk: number;             // 0..1 modality risk score
  baseWeight: number;       // configured weight
  effectiveWeight: number;  // re-normalised across present modalities
  contribution: number;     // effectiveWeight * risk (0..1)
  ageDays: number;          // recency of the underlying result
}

export interface CombinedResult {
  score: number;                       // 0..1 composite risk
  percentage: number;                  // 0..100 rounded
  level: RiskLevel;
  contributions: ModalityContribution[];
  modalitiesUsed: number;
  confidence: number;                  // 0..1 — grows with coverage & recency
}

export const toLevel = (score: number): RiskLevel =>
  score >= COMBINED_THRESHOLDS.high ? "High"
    : score >= COMBINED_THRESHOLDS.medium ? "Medium" : "Low";

/**
 * How much a result's weight decays with age. Screening results older than
 * `maxAgeDays` are ignored; within that window weight decays linearly to 0.5
 * so a fresh result counts roughly twice a stale one.
 */
const RECENCY = { maxAgeDays: 30, floor: 0.5 };

const recencyFactor = (ageDays: number): number => {
  if (ageDays >= RECENCY.maxAgeDays) return 0;
  const t = ageDays / RECENCY.maxAgeDays;
  return 1 - (1 - RECENCY.floor) * t;
};

/** History TestRecord.type → Modality (GAIT/LSVT are not yet persisted). */
const typeToModality = (t: TestRecord["type"]): Modality | null => {
  switch (t) {
    case "VOICE": return "VOICE";
    case "FINGER_TAP": return "FINGER_TAP";
    case "FACE": return "FACE";
    case "GAIT": return "GAIT";
    case "DRAWING": return "DRAWING";
    default: return null;  // LSVT_BIG (therapy) is intentionally excluded
  }
};

export interface LatestByModality {
  risk: number;      // 0..1
  timestamp: number;
}

/**
 * Pick the most recent record per modality from a history list.
 * riskScore in history is stored 0..1.
 */
export const latestPerModality = (
  history: TestRecord[] = getTestHistory(),
  now: number = Date.now()
): Partial<Record<Modality, LatestByModality>> => {
  const out: Partial<Record<Modality, LatestByModality>> = {};
  for (const rec of history) {
    const m = typeToModality(rec.type);
    if (!m) continue;
    if (!out[m] || rec.timestamp > out[m]!.timestamp) {
      out[m] = { risk: clamp01(rec.riskScore), timestamp: rec.timestamp };
    }
  }
  return out;
};

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/**
 * Compute the composite from a map of per-modality risks (0..1) and timestamps.
 * Missing modalities are dropped and the remaining weights re-normalised, so a
 * user who has only done 2 of 4 tests still gets a sensible score (with lower
 * confidence).
 */
export const computeCombinedRisk = (
  latest: Partial<Record<Modality, LatestByModality>>,
  now: number = Date.now()
): CombinedResult => {
  const modalities: Modality[] = ["FINGER_TAP", "DRAWING", "GAIT", "FACE", "VOICE"];

  // Determine present modalities (recent enough to count).
  const rows = modalities.map((m) => {
    const entry = latest[m];
    const ageDays = entry ? (now - entry.timestamp) / 86_400_000 : Infinity;
    const rf = entry ? recencyFactor(ageDays) : 0;
    const present = !!entry && rf > 0;
    return { m, entry, ageDays, rf, present };
  });

  const presentRows = rows.filter((r) => r.present);
  const weightSum = presentRows.reduce((s, r) => s + MODALITY_WEIGHTS[r.m] * r.rf, 0);

  const contributions: ModalityContribution[] = rows.map((r) => {
    const baseWeight = MODALITY_WEIGHTS[r.m];
    const effectiveWeight = r.present && weightSum > 0
      ? (baseWeight * r.rf) / weightSum
      : 0;
    const risk = r.entry ? r.entry.risk : 0;
    return {
      modality: r.m,
      present: r.present,
      risk,
      baseWeight,
      effectiveWeight,
      contribution: effectiveWeight * risk,
      ageDays: Number.isFinite(r.ageDays) ? Math.round(r.ageDays) : -1,
    };
  });

  const score = clamp01(contributions.reduce((s, c) => s + c.contribution, 0));

  // Confidence: coverage (how many modalities present, weighted by base weight)
  // × mean recency of present modalities.
  const coverage = presentRows.reduce((s, r) => s + MODALITY_WEIGHTS[r.m], 0); // 0..1
  const meanRecency = presentRows.length
    ? presentRows.reduce((s, r) => s + r.rf, 0) / presentRows.length
    : 0;
  const confidence = clamp01(coverage * meanRecency);

  return {
    score,
    percentage: Math.round(score * 100),
    level: toLevel(score),
    contributions,
    modalitiesUsed: presentRows.length,
    confidence,
  };
};

/** Convenience: compute the combined risk straight from stored history. */
export const computeCombinedRiskFromHistory = (
  history: TestRecord[] = getTestHistory(),
  now: number = Date.now()
): CombinedResult => computeCombinedRisk(latestPerModality(history, now), now);

export const MODALITY_LABELS: Record<Modality, string> = {
  VOICE: "Voice",
  FINGER_TAP: "Finger Tap",
  FACE: "Facial",
  GAIT: "Gait / Walking",
  DRAWING: "Drawing",
};
