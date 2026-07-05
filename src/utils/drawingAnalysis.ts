/**
 * drawingAnalysis.ts
 * ------------------------------------------------------------------
 * Clinically-grounded analysis for spiral / wave drawing tasks used in
 * Parkinson's fine-motor screening.
 *
 * References (paraphrased for compliance):
 *  - Archimedes spiral RMSE deviation for PD detection (Isenkul et al., 2014).
 *  - Velocity variability (speed CV) as intra-stroke bradykinesia/dysmetria
 *    marker (Impedovo, 2018).
 *  - Tremor index via velocity zero-crossings (Aghanavesi et al., 2017).
 *  - Spiral-drawing feature importances (Zham 2017; Pereira 2016).
 *
 * Screening only — not diagnostic. Weights are heuristic and should be
 * replaced by a validated model trained on labelled PD/HC drawings.
 * ------------------------------------------------------------------
 */

export type DrawingTask = "Archimedes Spiral" | "Meander Wave";

export interface DrawPoint {
  x: number;
  y: number;
  t: number;      // ms timestamp
  p?: number;     // pressure 0..1 if available
}

export interface DrawingMetrics {
  meanSpeed: number;
  speedCV: number;
  tremorIndex: number;      // 0..1
  spiralRMSE?: number;      // px
  waviness?: number;        // curvature variation
  strokeCount: number;
  meanPressure?: number;
  pressureCV?: number;
  totalTimeSec: number;
}

export interface DrawingResult {
  task: DrawingTask;
  riskScore: number;        // 0..1
  riskLevel: "Low" | "Medium" | "High";
  color: string;
  metrics: DrawingMetrics;
  findings: string[];
}

export const CANVAS_SIZE = 300;
const CC = CANVAS_SIZE / 2;

const RISK_COLORS = { Low: "#5DBEA3", Medium: "#FF9F43", High: "#FF6B6B" };

/** Archimedes spiral guide path (SVG/canvas point list). r = a·θ */
export const spiralGuidePoints = (): { x: number; y: number }[] => {
  const turns = 3.5;
  const a = (CC - 24) / (2 * Math.PI * turns);
  const pts: { x: number; y: number }[] = [];
  for (let deg = 0; deg <= 360 * turns; deg += 3) {
    const theta = (deg * Math.PI) / 180;
    const r = a * theta;
    pts.push({
      x: CC + r * Math.cos(theta - Math.PI / 2),
      y: CC + r * Math.sin(theta - Math.PI / 2),
    });
  }
  return pts;
};

/** Sinusoidal meander wave guide path. */
export const waveGuidePoints = (): { x: number; y: number }[] => {
  const amp = 36;
  const freq = (2 * Math.PI) / (CANVAS_SIZE - 40);
  const pts: { x: number; y: number }[] = [];
  for (let x = 20; x <= CANVAS_SIZE - 20; x += 2) {
    pts.push({ x, y: CC + amp * Math.sin(freq * (x - 20) * 3) });
  }
  return pts;
};

export const computeDrawingMetrics = (
  strokes: DrawPoint[][],
  task: DrawingTask
): DrawingMetrics => {
  const allPts = strokes.flat();
  const totalTimeSec = allPts.length < 2
    ? 1
    : (allPts[allPts.length - 1].t - allPts[0].t) / 1000;

  const speeds: number[] = [];
  for (const stroke of strokes) {
    for (let i = 1; i < stroke.length; i++) {
      const dx = stroke[i].x - stroke[i - 1].x;
      const dy = stroke[i].y - stroke[i - 1].y;
      const dt = Math.max((stroke[i].t - stroke[i - 1].t) / 1000, 0.005);
      speeds.push(Math.sqrt(dx * dx + dy * dy) / dt);
    }
  }
  const meanSpeed = speeds.length ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0;
  const speedStd = speeds.length
    ? Math.sqrt(speeds.reduce((a, b) => a + (b - meanSpeed) ** 2, 0) / speeds.length)
    : 0;
  const speedCV = meanSpeed > 0 ? (speedStd / meanSpeed) * 100 : 0;

  // Tremor index via velocity zero-crossings
  let zeroCrossings = 0;
  for (let i = 2; i < speeds.length; i++) {
    const d1 = speeds[i - 1] - speeds[i - 2];
    const d2 = speeds[i] - speeds[i - 1];
    if (d1 * d2 < 0) zeroCrossings++;
  }
  const tremorIndex = Math.min(zeroCrossings / Math.max(speeds.length * 0.35, 1), 1);

  // Spiral RMSE
  let spiralRMSE: number | undefined;
  if (task === "Archimedes Spiral" && allPts.length > 10) {
    const turns = 3.5;
    const a = (CC - 24) / (2 * Math.PI * turns);
    let sumSq = 0;
    for (const p of allPts) {
      const dx = p.x - CC;
      const dy = p.y - CC;
      const rActual = Math.sqrt(dx * dx + dy * dy);
      const theta = Math.atan2(dy, dx) + Math.PI / 2;
      const rIdeal = a * (((theta % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI));
      sumSq += (rActual - rIdeal) ** 2;
    }
    spiralRMSE = Math.sqrt(sumSq / allPts.length);
  }

  // Waviness (curvature variation)
  let waviness: number | undefined;
  if (allPts.length > 5) {
    const curvatures: number[] = [];
    for (let i = 1; i < allPts.length - 1; i++) {
      const ax = allPts[i].x - allPts[i - 1].x;
      const ay = allPts[i].y - allPts[i - 1].y;
      const bx = allPts[i + 1].x - allPts[i].x;
      const by = allPts[i + 1].y - allPts[i].y;
      const cross = ax * by - ay * bx;
      const denom = Math.sqrt((ax * ax + ay * ay) * (bx * bx + by * by));
      curvatures.push(denom > 0 ? Math.abs(cross / denom) : 0);
    }
    const meanC = curvatures.reduce((a, b) => a + b, 0) / curvatures.length;
    const varC = curvatures.reduce((a, b) => a + (b - meanC) ** 2, 0) / curvatures.length;
    waviness = Math.sqrt(varC);
  }

  const pressures = allPts.filter((p) => p.p !== undefined && p.p > 0).map((p) => p.p!);
  let meanPressure: number | undefined;
  let pressureCV: number | undefined;
  if (pressures.length > 5) {
    meanPressure = pressures.reduce((a, b) => a + b, 0) / pressures.length;
    const stdP = Math.sqrt(pressures.reduce((a, b) => a + (b - meanPressure!) ** 2, 0) / pressures.length);
    pressureCV = meanPressure > 0 ? (stdP / meanPressure) * 100 : 0;
  }

  return {
    meanSpeed: Math.round(meanSpeed),
    speedCV: Math.round(speedCV),
    tremorIndex,
    spiralRMSE,
    waviness,
    strokeCount: strokes.length,
    meanPressure,
    pressureCV,
    totalTimeSec: Math.round(totalTimeSec * 10) / 10,
  };
};

const scoreFromMetrics = (m: DrawingMetrics) => {
  const findings: string[] = [];
  let score = 0;
  let weights = 0;

  score += m.tremorIndex * 0.35; weights += 0.35;
  if (m.tremorIndex > 0.6) findings.push("High velocity oscillation — consistent with tremor.");
  else if (m.tremorIndex > 0.35) findings.push("Moderate velocity fluctuation detected.");

  const speedCVNorm = Math.min(m.speedCV / 120, 1);
  score += speedCVNorm * 0.25; weights += 0.25;
  if (m.speedCV > 80) findings.push("Large speed variability — possible bradykinesia or dysmetria.");
  else if (m.speedCV > 50) findings.push("Moderate speed variability during drawing.");

  if (m.spiralRMSE !== undefined) {
    const rmseNorm = Math.min((m.spiralRMSE - 5) / 30, 1);
    score += Math.max(0, rmseNorm) * 0.25; weights += 0.25;
    if (m.spiralRMSE > 18) findings.push(`Spiral deviation ${m.spiralRMSE.toFixed(1)} px — exceeds healthy range (~12 px).`);
    else if (m.spiralRMSE > 10) findings.push("Mild spiral deviation from the ideal path.");
  }

  if (m.waviness !== undefined) {
    const wavNorm = Math.min(m.waviness / 0.5, 1);
    score += wavNorm * 0.15; weights += 0.15;
    if (m.waviness > 0.35) findings.push("High curvature irregularity — reduced fine-motor smoothness.");
  }

  if (m.strokeCount > 3) {
    score += Math.min((m.strokeCount - 3) * 0.04, 0.15);
    findings.push(`${m.strokeCount} pen-lifts — reduced motor continuity.`);
  }

  if (m.pressureCV !== undefined) {
    const pCVNorm = Math.min(m.pressureCV / 80, 1);
    score += pCVNorm * 0.1; weights += 0.1;
    if (m.pressureCV > 50) findings.push("High pen-pressure variability — reduced grip stability.");
  }

  const normalised = weights > 0 ? Math.min(score / weights, 1) : score;
  const finalScore = Math.max(0.04, Math.min(normalised, 0.97));
  const level: "Low" | "Medium" | "High" =
    finalScore < 0.35 ? "Low" : finalScore < 0.65 ? "Medium" : "High";
  if (findings.length === 0) findings.push("No significant motor irregularities detected.");
  return { score: finalScore, level, findings };
};

export const analyzeDrawing = (strokes: DrawPoint[][], task: DrawingTask): DrawingResult => {
  if (strokes.flat().length < 10) {
    return {
      task, riskScore: 0.5, riskLevel: "Medium", color: RISK_COLORS.Medium,
      metrics: { meanSpeed: 0, speedCV: 0, tremorIndex: 0.5, strokeCount: 0, totalTimeSec: 0 },
      findings: ["Insufficient drawing data — please complete the full task."],
    };
  }
  const metrics = computeDrawingMetrics(strokes, task);
  const { score, level, findings } = scoreFromMetrics(metrics);
  return { task, riskScore: score, riskLevel: level, color: RISK_COLORS[level], metrics, findings };
};
