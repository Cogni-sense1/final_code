/**
 * clinicalMetrics.ts
 * ------------------------------------------------------------------
 * Centralised, research-grounded scoring for the camera/sensor based
 * screening exercises (finger tap, facial, gait/walking).
 *
 * IMPORTANT — scope & honesty:
 * These are *screening* heuristics, NOT a diagnosis. Every test here runs on a
 * single uncalibrated webcam using MediaPipe normalised landmark coordinates
 * (values 0..1 relative to the frame). That means:
 *   - We CAN measure timing (frequency, rhythm), relative amplitude (normalised
 *     to a body/hand reference), symmetry, and posture angles.
 *   - We CANNOT measure absolute distances (cm), absolute gait speed (m/s),
 *     heart rate or respiration without calibration / rPPG. Those are not
 *     estimated here and must not be presented as measured.
 *
 * Threshold direction and cut-offs are informed by the Parkinson's / movement
 * disorders literature. Sources (see README / inline notes):
 *   - MDS-UPDRS Part III items 3.2 (facial expression), 3.4 (finger tapping),
 *     3.10 (gait): speed, amplitude, hesitations/halts, decrementing amplitude.
 *   - Finger tapping: healthy ~4-6 Hz vs PD notably slower; rhythm variability
 *     (dysrhythmia) and amplitude decrement (sequence effect) are hallmark.
 *   - Blink rate: normal spontaneous ~15-20/min; reduced in PD (hypomimia).
 *   - Gait: reduced arm swing + arm-swing asymmetry (sensitive early sign),
 *     reduced cadence, stooped posture, increased steps-to-turn.
 *
 * Cut-offs are intentionally conservative and expressed as tunable constants so
 * they can be recalibrated against real labelled data later.
 * ------------------------------------------------------------------
 */

export type RiskLevel = "Low" | "Medium" | "High";

export interface SubScore {
  key: string;
  label: string;
  value: number;          // raw measured value
  displayValue: string;   // formatted for UI
  points: number;         // contribution to risk (0..maxPoints)
  maxPoints: number;
  status: "ok" | "warn" | "bad";
  note: string;           // human-readable interpretation
}

export interface ClinicalResult {
  score: number;          // 0..100 composite risk
  level: RiskLevel;
  subScores: SubScore[];
  confidence: number;     // 0..1 data-quality confidence
}

// ── helpers ──────────────────────────────────────────────────────────────────

export const clamp = (v: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, v));

export const finiteOr = (v: number, fallback = 0): number =>
  Number.isFinite(v) ? v : fallback;

/** Map a 0..100 composite risk score to a categorical level. */
export const toRiskLevel = (score: number): RiskLevel =>
  score >= 60 ? "High" : score >= 30 ? "Medium" : "Low";

/**
 * Symmetric asymmetry index between two limbs/sides, range 0..1.
 * 0 = perfectly symmetric, 1 = one side entirely absent.
 * Standard normalisation used in gait/arm-swing asymmetry literature.
 */
export const asymmetryIndex = (a: number, b: number): number => {
  const denom = Math.abs(a) + Math.abs(b);
  if (denom < 1e-6) return 0;
  return Math.abs(a - b) / denom;
};

/**
 * Least-squares slope of y over its index. Used for amplitude decrement
 * (the MDS-UPDRS "decrementing amplitude" / sequence effect) and fatigue.
 * Returns slope in units of value-per-sample.
 */
export const linearSlope = (ys: number[]): number => {
  const n = ys.length;
  if (n < 3) return 0;
  const mx = (n - 1) / 2;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - mx) * (ys[i] - my);
    den += (i - mx) ** 2;
  }
  return den === 0 ? 0 : num / den;
};

// ════════════════════════════════════════════════════════════════════════════
//  FINGER TAP  (MDS-UPDRS 3.4)
// ════════════════════════════════════════════════════════════════════════════

export interface FingerTapInputs {
  /** taps per second, per hand */
  tapsPerSecLeft: number;
  tapsPerSecRight: number;
  /** coefficient of variation of inter-tap interval (rhythm), per hand */
  cvLeft: number;
  cvRight: number;
  /** normalised amplitude (pinch opening / hand size) per tap, per hand */
  amplitudesLeft: number[];
  amplitudesRight: number[];
  /** fatigue: fractional rate drop early→late (0..1), per hand */
  fatigueLeft: number;
  fatigueRight: number;
  /** tremor score (a.u.), per hand */
  tremorLeft: number;
  tremorRight: number;
}

/**
 * Evidence-based cut-offs for finger tapping.
 * Frequency: healthy sustained tapping typically >= ~3.5 taps/s; < ~2.5 taps/s
 *   is consistent with bradykinesia. (Values chosen conservatively for a phone
 *   pinch-tap, which runs slower than a keyboard/tabletop tap.)
 * CV (rhythm): < 0.30 consistent; > 0.50 markedly dysrhythmic.
 * Amplitude decrement: negative slope (shrinking) is the sequence effect.
 * Asymmetry: physiological arm/hand asymmetry is small; a large inter-hand
 *   difference is an early lateralised sign.
 */
export const FT_THRESHOLDS = {
  freqOk: 3.5,
  freqWarn: 2.5,
  cvOk: 0.3,
  cvWarn: 0.5,
  // relative decrement over the session (fraction of starting amplitude lost)
  decrementOk: 0.1,
  decrementWarn: 0.25,
  fatigueOk: 0.15,
  fatigueWarn: 0.35,
  tremorOk: 0.8,
  tremorWarn: 1.5,
  asymmetryOk: 0.15,
  asymmetryWarn: 0.3,
};

/** Relative amplitude decrement (0 = none, 1 = fully decays). */
export const amplitudeDecrement = (amps: number[]): number => {
  if (amps.length < 4) return 0;
  const slope = linearSlope(amps);        // per-tap change
  const start = amps.slice(0, Math.max(2, Math.floor(amps.length * 0.2)));
  const startMean = start.reduce((s, v) => s + v, 0) / start.length;
  if (startMean < 1e-6) return 0;
  // total expected drop across the sequence relative to starting amplitude
  const totalDrop = -slope * (amps.length - 1);
  return clamp(totalDrop / startMean, 0, 1);
};

export const scoreFingerTap = (inp: FingerTapInputs): ClinicalResult => {
  const avgFreq = (finiteOr(inp.tapsPerSecLeft) + finiteOr(inp.tapsPerSecRight)) / 2;
  const avgCv = (finiteOr(inp.cvLeft) + finiteOr(inp.cvRight)) / 2;
  const decL = amplitudeDecrement(inp.amplitudesLeft);
  const decR = amplitudeDecrement(inp.amplitudesRight);
  const avgDec = (decL + decR) / 2;
  const avgFatigue = (finiteOr(inp.fatigueLeft) + finiteOr(inp.fatigueRight)) / 2;
  const avgTremor = (finiteOr(inp.tremorLeft) + finiteOr(inp.tremorRight)) / 2;
  const freqAsym = asymmetryIndex(inp.tapsPerSecLeft, inp.tapsPerSecRight);

  const T = FT_THRESHOLDS;
  const subScores: SubScore[] = [];

  // Speed / bradykinesia — 30 pts (most weight: core UPDRS marker)
  {
    const pts = avgFreq >= T.freqOk ? 0 : avgFreq >= T.freqWarn ? 15 : 30;
    subScores.push({
      key: "speed", label: "Tap Speed", value: avgFreq,
      displayValue: `${avgFreq.toFixed(1)} taps/s`, points: pts, maxPoints: 30,
      status: pts === 0 ? "ok" : pts <= 15 ? "warn" : "bad",
      note: avgFreq >= T.freqOk ? "normal speed"
        : avgFreq >= T.freqWarn ? "mildly slowed" : "slowed — possible bradykinesia",
    });
  }

  // Amplitude decrement / sequence effect — 25 pts (hallmark of 3.4)
  {
    const pts = avgDec < T.decrementOk ? 0 : avgDec < T.decrementWarn ? 12 : 25;
    subScores.push({
      key: "decrement", label: "Amplitude Decrement", value: avgDec,
      displayValue: `${(avgDec * 100).toFixed(0)}%`, points: pts, maxPoints: 25,
      status: pts === 0 ? "ok" : pts <= 12 ? "warn" : "bad",
      note: avgDec < T.decrementOk ? "amplitude maintained"
        : avgDec < T.decrementWarn ? "mild decrement" : "progressive decrement (sequence effect)",
    });
  }

  // Rhythm variability — 20 pts
  {
    const pts = avgCv < T.cvOk ? 0 : avgCv < T.cvWarn ? 10 : 20;
    subScores.push({
      key: "rhythm", label: "Rhythm (CV)", value: avgCv,
      displayValue: avgCv.toFixed(2), points: pts, maxPoints: 20,
      status: pts === 0 ? "ok" : pts <= 10 ? "warn" : "bad",
      note: avgCv < T.cvOk ? "consistent rhythm"
        : avgCv < T.cvWarn ? "moderate irregularity" : "dysrhythmic",
    });
  }

  // Asymmetry — 15 pts (lateralised onset)
  {
    const pts = freqAsym < T.asymmetryOk ? 0 : freqAsym < T.asymmetryWarn ? 7 : 15;
    subScores.push({
      key: "asymmetry", label: "Inter-hand Asymmetry", value: freqAsym,
      displayValue: freqAsym.toFixed(2), points: pts, maxPoints: 15,
      status: pts === 0 ? "ok" : pts <= 7 ? "warn" : "bad",
      note: freqAsym < T.asymmetryOk ? "symmetric"
        : freqAsym < T.asymmetryWarn ? "mild asymmetry" : "marked asymmetry",
    });
  }

  // Fatigue + tremor — 10 pts combined
  {
    const fatiguePts = avgFatigue < T.fatigueOk ? 0 : avgFatigue < T.fatigueWarn ? 3 : 5;
    const tremorPts = avgTremor < T.tremorOk ? 0 : avgTremor < T.tremorWarn ? 3 : 5;
    subScores.push({
      key: "fatigue", label: "Fatigue Drop", value: avgFatigue,
      displayValue: `${(avgFatigue * 100).toFixed(0)}%`, points: fatiguePts, maxPoints: 5,
      status: fatiguePts === 0 ? "ok" : fatiguePts <= 3 ? "warn" : "bad",
      note: avgFatigue < T.fatigueOk ? "no significant fatigue"
        : avgFatigue < T.fatigueWarn ? "mild fatigue" : "significant fatigue",
    });
    subScores.push({
      key: "tremor", label: "Tremor", value: avgTremor,
      displayValue: avgTremor.toFixed(2), points: tremorPts, maxPoints: 5,
      status: tremorPts === 0 ? "ok" : tremorPts <= 3 ? "warn" : "bad",
      note: avgTremor < T.tremorOk ? "minimal tremor"
        : avgTremor < T.tremorWarn ? "mild tremor" : "notable tremor",
    });
  }

  const score = clamp(Math.round(subScores.reduce((s, x) => s + x.points, 0)), 0, 100);
  return { score, level: toRiskLevel(score), subScores, confidence: 1 };
};

// ════════════════════════════════════════════════════════════════════════════
//  FACE  (MDS-UPDRS 3.2 — facial expression / hypomimia)
// ════════════════════════════════════════════════════════════════════════════

export interface FaceInputs {
  /** spontaneous blinks per minute */
  blinkRate: number;
  /** mean facial expression motion amplitude (a.u., normalised to face size) */
  expressionAmplitude: number;
  /** facial asymmetry (normalised, 0 = symmetric) */
  asymmetry: number;
}

/**
 * Face cut-offs.
 * Blink: normal spontaneous ~15-20/min; <12/min suggestive of hypomimia,
 *   <8/min markedly reduced. (Elevated blink >30 also abnormal but not scored
 *   toward PD risk here.)
 * Expression amplitude is device/scale dependent — expressed relative to the
 *   normalised face-motion units this pipeline produces.
 * Asymmetry is weighted lowest: PD is typically bilateral, so facial asymmetry
 *   is a less specific PD marker (more relevant to Bell's palsy / stroke).
 */
export const FACE_THRESHOLDS = {
  blinkOk: 12,
  blinkWarn: 8,
  // normalised expression-motion units produced by the FaceMesh motion metric
  exprOk: 0.0015,
  exprWarn: 0.0009,
  asymOk: 0.035,
  asymWarn: 0.06,
};

export const scoreFace = (inp: FaceInputs): ClinicalResult => {
  const T = FACE_THRESHOLDS;
  const subScores: SubScore[] = [];

  // Blink rate — 40 pts
  {
    const b = finiteOr(inp.blinkRate);
    const pts = b >= T.blinkOk ? 0 : b >= T.blinkWarn ? 22 : 40;
    subScores.push({
      key: "blink", label: "Blink Rate", value: b,
      displayValue: `${b.toFixed(0)}/min`, points: pts, maxPoints: 40,
      status: pts === 0 ? "ok" : pts <= 22 ? "warn" : "bad",
      note: b >= T.blinkOk ? "normal blink rate"
        : b >= T.blinkWarn ? "reduced blink rate" : "markedly reduced (hypomimia)",
    });
  }

  // Expression amplitude / hypomimia — 40 pts
  {
    const e = finiteOr(inp.expressionAmplitude);
    const pts = e >= T.exprOk ? 0 : e >= T.exprWarn ? 22 : 40;
    subScores.push({
      key: "expression", label: "Facial Motion", value: e,
      displayValue: e >= T.exprOk ? "Normal" : e >= T.exprWarn ? "Reduced" : "Very reduced",
      points: pts, maxPoints: 40,
      status: pts === 0 ? "ok" : pts <= 22 ? "warn" : "bad",
      note: e >= T.exprOk ? "expressive facial movement"
        : e >= T.exprWarn ? "reduced expressivity" : "masked facies (hypomimia)",
    });
  }

  // Asymmetry — 20 pts
  {
    const a = finiteOr(inp.asymmetry);
    const pts = a < T.asymOk ? 0 : a < T.asymWarn ? 10 : 20;
    subScores.push({
      key: "asymmetry", label: "Asymmetry", value: a,
      displayValue: `${(a * 100).toFixed(1)}%`, points: pts, maxPoints: 20,
      status: pts === 0 ? "ok" : pts <= 10 ? "warn" : "bad",
      note: a < T.asymOk ? "symmetric" : a < T.asymWarn ? "mild asymmetry" : "notable asymmetry",
    });
  }

  const score = clamp(Math.round(subScores.reduce((s, x) => s + x.points, 0)), 0, 100);
  return { score, level: toRiskLevel(score), subScores, confidence: 1 };
};

// ════════════════════════════════════════════════════════════════════════════
//  GAIT / WALKING  (MDS-UPDRS 3.10)
// ════════════════════════════════════════════════════════════════════════════

export interface GaitInputs {
  /** arm-swing range per side (normalised to frame) */
  leftArmRange: number;
  rightArmRange: number;
  /** cadence: steps per second detected from ankle oscillation */
  cadence: number;
  /** trunk forward-lean angle in degrees */
  trunkAngle: number;
  /** steps taken to complete the turn */
  turnSteps: number;
}

/**
 * Gait cut-offs.
 * Arm-swing asymmetry: physiological asymmetry is small; asymmetry above the
 *   normal range is a sensitive early-PD sign. We flag > ~0.35.
 * Reduced arm swing: very small swing on the more-affected side.
 * Cadence: typical comfortable walking cadence ~1.6-2.0 steps/s (~100-120
 *   steps/min); reduced cadence accompanies parkinsonian gait. (Cadence from a
 *   fixed camera during a short walk is a rough proxy, not a lab measurement.)
 * Trunk: forward flexion > ~15° indicates stooped posture.
 * Turn: healthy pivot turns take few steps; > ~4-5 steps ("turning en bloc")
 *   is abnormal.
 */
export const GAIT_THRESHOLDS = {
  armAsymOk: 0.35,
  armSwingReduced: 0.04,   // normalised range considered hypokinetic
  cadenceOk: 1.3,
  cadenceWarn: 0.9,
  trunkOk: 15,
  trunkWarn: 25,
  turnOk: 4,
  turnWarn: 6,
};

export const scoreGait = (inp: GaitInputs): ClinicalResult => {
  const T = GAIT_THRESHOLDS;
  const subScores: SubScore[] = [];
  const armAsym = asymmetryIndex(inp.leftArmRange, inp.rightArmRange);
  const minArm = Math.min(inp.leftArmRange, inp.rightArmRange);

  // Arm-swing asymmetry — 30 pts (sensitive early sign)
  {
    const pts = armAsym < T.armAsymOk ? 0 : armAsym < 0.55 ? 18 : 30;
    subScores.push({
      key: "armAsym", label: "Arm-swing Asymmetry", value: armAsym,
      displayValue: armAsym.toFixed(2), points: pts, maxPoints: 30,
      status: pts === 0 ? "ok" : pts <= 18 ? "warn" : "bad",
      note: armAsym < T.armAsymOk ? "symmetric arm swing"
        : "asymmetric arm swing",
    });
  }

  // Reduced arm swing — 20 pts
  {
    const pts = minArm >= T.armSwingReduced ? 0 : minArm >= T.armSwingReduced * 0.5 ? 10 : 20;
    subScores.push({
      key: "armSwing", label: "Arm-swing Amplitude", value: minArm,
      displayValue: (minArm * 100).toFixed(1), points: pts, maxPoints: 20,
      status: pts === 0 ? "ok" : pts <= 10 ? "warn" : "bad",
      note: minArm >= T.armSwingReduced ? "adequate arm swing" : "reduced arm swing",
    });
  }

  // Cadence — 20 pts
  {
    const c = finiteOr(inp.cadence);
    const pts = c >= T.cadenceOk ? 0 : c >= T.cadenceWarn ? 10 : 20;
    subScores.push({
      key: "cadence", label: "Cadence", value: c,
      displayValue: `${c.toFixed(1)} steps/s`, points: pts, maxPoints: 20,
      status: pts === 0 ? "ok" : pts <= 10 ? "warn" : "bad",
      note: c >= T.cadenceOk ? "normal cadence"
        : c >= T.cadenceWarn ? "mildly reduced cadence" : "reduced cadence",
    });
  }

  // Trunk posture — 15 pts
  {
    const a = finiteOr(inp.trunkAngle);
    const pts = a < T.trunkOk ? 0 : a < T.trunkWarn ? 8 : 15;
    subScores.push({
      key: "trunk", label: "Trunk Posture", value: a,
      displayValue: `${a.toFixed(0)}°`, points: pts, maxPoints: 15,
      status: pts === 0 ? "ok" : pts <= 8 ? "warn" : "bad",
      note: a < T.trunkOk ? "upright posture" : a < T.trunkWarn ? "mild stoop" : "stooped posture",
    });
  }

  // Turning — 15 pts
  {
    const s = finiteOr(inp.turnSteps);
    const pts = s <= T.turnOk ? 0 : s <= T.turnWarn ? 8 : 15;
    subScores.push({
      key: "turn", label: "Turn Steps", value: s,
      displayValue: `${s.toFixed(0)}`, points: pts, maxPoints: 15,
      status: pts === 0 ? "ok" : pts <= 8 ? "warn" : "bad",
      note: s <= T.turnOk ? "efficient turn" : s <= T.turnWarn ? "several steps to turn" : "turning en bloc",
    });
  }

  const score = clamp(Math.round(subScores.reduce((s, x) => s + x.points, 0)), 0, 100);
  return { score, level: toRiskLevel(score), subScores, confidence: 1 };
};
