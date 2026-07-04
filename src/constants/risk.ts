/**
 * Unified risk constants — single source of truth for the web app.
 *
 * A single 0–1 risk probability drives BOTH the binary screening decision
 * and the Low/Medium/High display label. Historically these used two
 * different boundary systems (screening at 0.30, labels at 0.33/0.66), so a
 * score of 0.31 was flagged "at risk" by the screening cutoff yet shown to
 * the user as "Low". They are now unified into one scheme:
 *
 *   Low     : score  <  0.30
 *   Medium  : 0.30  <=  score  <=  0.66
 *   High    : score  >   0.66
 *
 * Why 0.30 as the screening / Low–Medium boundary?
 * 0.30 is a deliberate sensitivity-first clinical choice. The v4 logistic
 * regression threshold was tuned for ≥0.95 recall on Parkinson's cases, so
 * the tool errs toward catching possible cases (accepting more false
 * positives) rather than missing them (false negatives). This is a screening
 * aid, not a diagnosis, so under-flagging is the more harmful error.
 */
export const RISK_THRESHOLDS = {
  /** Low/Medium boundary — also the binary screening cutoff. */
  SCREENING: 0.3,
  /** Medium/High boundary. */
  HIGH: 0.66,
} as const;

export type RiskLevel = 'Low' | 'Medium' | 'High';

/**
 * Map a 0–1 risk score to a Low/Medium/High label using the unified scheme.
 * Scores are clamped to [0, 1] defensively.
 */
export function getRiskLevel(score: number): RiskLevel {
  const s = Math.min(1, Math.max(0, score));
  if (s < RISK_THRESHOLDS.SCREENING) return 'Low';
  if (s <= RISK_THRESHOLDS.HIGH) return 'Medium';
  return 'High';
}

/** Binary screening decision: is this score at or above the screening cutoff? */
export function isScreeningPositive(score: number): boolean {
  return score >= RISK_THRESHOLDS.SCREENING;
}

/**
 * Multimodal fusion confidence weights (Task 4).
 *
 * Voice is model-backed (a trained, calibrated ML probability) and is
 * therefore trusted most. Face and finger-tap are hand-tuned, rule-based
 * heuristics that are not yet clinically validated, so they carry less
 * weight. Change these four lines to re-tune the fusion — nothing else needs
 * to move.
 */
export const MODALITY_WEIGHTS = {
  voice: 0.5,
  face: 0.3,
  fingerTap: 0.2,
} as const;

export type Modality = keyof typeof MODALITY_WEIGHTS;
