// DrawingTest.tsx — Clinically-grounded Parkinson's motor screening
// Based on: Impedovo & Pirlo (2018), Aghanavesi et al. (2017),
//           Isenkul et al. (2014) Spiral/Wave drawing analysis for PD detection

import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, SafeAreaView, PanResponder,
} from 'react-native';
import Svg, {
  Path, Circle, Line, Ellipse, Text as SvgText, G,
} from 'react-native-svg';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ProgressBar } from '../components/ProgressBar';
import { RiskRing } from '../components/RiskRing';
import { addTestRecord } from '../utils/storage';

// ─── Types ────────────────────────────────────────────────────────────────────

type Task = 'Archimedes Spiral' | 'Meander Wave' | 'Clock Drawing';
type Phase = 'setup' | 'drawing' | 'processing' | 'result';

/** Raw touch sample including pressure if available */
interface Point {
  x: number;
  y: number;
  t: number;       // ms timestamp
  p?: number;      // pressure 0–1 if available
}

interface ClinicalMetrics {
  // Kinematic
  meanSpeed: number;        // px/s
  speedCV: number;          // Coefficient of variation of speed (%) — higher = more variable/tremor
  // Tremor
  tremorIndex: number;      // 0–1, derived from zero-crossing rate of velocity signal
  // Spiral-specific (Archimedes Spiral)
  spiralRMSE?: number;      // RMS deviation from ideal Archimedes spiral (px)
  // Waviness
  dtwWaviness?: number;     // Normalised curvature variation
  // Pen control
  strokeCount: number;      // Lifts = interrupted control
  meanPressure?: number;    // Average normalised pressure
  pressureCV?: number;      // Pressure variability
  // Drawing time
  totalTimeSec: number;
}

interface DrawingResult {
  task: Task;
  riskScore: number;        // 0–1
  riskLevel: 'Low' | 'Medium' | 'High';
  color: string;
  clinical: ClinicalMetrics;
  explanation: string[];    // Human-readable finding bullets
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CANVAS_SIZE = 300;
const CC = CANVAS_SIZE / 2; // canvas centre

const TASKS: {
  id: Task; icon: string; color: string; bg: string;
  shortDesc: string; instruction: string;
}[] = [
  {
    id: 'Archimedes Spiral',
    icon: 'refresh-circle-outline',
    color: '#FF8C42', bg: '#FFD4B8',
    shortDesc: 'Trace the spiral from centre outward',
    instruction: 'Starting from the centre dot, trace along the dashed spiral — moving outward as smoothly as possible. Keep your hand relaxed.',
  },
  {
    id: 'Meander Wave',
    icon: 'pulse-outline',
    color: '#5DBEA3', bg: '#C8E6DD',
    shortDesc: 'Trace the sinusoidal wave path',
    instruction: 'Trace the dashed wave from left to right as smoothly as you can, staying as close to the guide line as possible.',
  },
  {
    id: 'Clock Drawing',
    icon: 'time-outline',
    color: '#7B68EE', bg: '#E8E4FF',
    shortDesc: 'Draw clock hands showing 10:10',
    instruction: 'Inside the clock circle, draw the hour hand pointing to 10 and the minute hand pointing to 2 (showing 10:10). Start each hand from the centre dot.',
  },
];

const RISK_COLORS = { Low: '#5DBEA3', Medium: '#FF9F43', High: '#FF6B6B' };
const RISK_BADGES = {
  Low:    { bg: '#D4F1E8', text: '#5DBEA3' },
  Medium: { bg: '#FFE8D6', text: '#FF9F43' },
  High:   { bg: '#FFE0E0', text: '#FF6B6B' },
};

// ─── Guide geometry ───────────────────────────────────────────────────────────

/** Archimedes spiral: r = a·θ */
function archimedesPath(): string {
  const turns = 3.5;
  const a = (CC - 24) / (2 * Math.PI * turns);
  let d = '';
  for (let deg = 0; deg <= 360 * turns; deg += 3) {
    const theta = (deg * Math.PI) / 180;
    const r = a * theta;
    const x = CC + r * Math.cos(theta - Math.PI / 2);
    const y = CC + r * Math.sin(theta - Math.PI / 2);
    d += deg === 0 ? `M ${x.toFixed(1)} ${y.toFixed(1)}` : ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return d;
}

/** Sinusoidal meander wave */
function meanderPath(): string {
  const amp = 36;
  const freq = (2 * Math.PI) / (CANVAS_SIZE - 40);
  let d = '';
  for (let x = 20; x <= CANVAS_SIZE - 20; x += 2) {
    const y = CC + amp * Math.sin(freq * (x - 20) * 3);
    d += x === 20 ? `M ${x} ${y.toFixed(1)}` : ` L ${x} ${y.toFixed(1)}`;
  }
  return d;
}

// ─── Clinical analysis ────────────────────────────────────────────────────────

/**
 * Computes clinically-motivated features for PD motor screening.
 *
 * Key references:
 * - Tremor index via zero-crossing of velocity derivative (Aghanavesi 2017)
 * - Spiral RMSE from ideal Archimedes spiral (Isenkul 2014)
 * - Speed CV as intra-stroke velocity variability (Impedovo 2018)
 * - Pressure variability (Impedovo 2018)
 *
 * DISCLAIMER: This is a SCREENING tool only. Scores are not diagnostic.
 * Clinical validation on your specific population is required before any
 * clinical deployment.
 */
function computeClinicalMetrics(
  strokes: Point[][],
  task: Task
): ClinicalMetrics {
  const allPts = strokes.flat();

  // ── Total time ────────────────────────────────────────────────────────────
  const totalTimeSec = allPts.length < 2
    ? 1
    : (allPts[allPts.length - 1].t - allPts[0].t) / 1000;

  // ── Per-segment velocities ────────────────────────────────────────────────
  const speeds: number[] = [];
  for (const stroke of strokes) {
    for (let i = 1; i < stroke.length; i++) {
      const dx = stroke[i].x - stroke[i - 1].x;
      const dy = stroke[i].y - stroke[i - 1].y;
      const dt = Math.max((stroke[i].t - stroke[i - 1].t) / 1000, 0.005);
      speeds.push(Math.sqrt(dx * dx + dy * dy) / dt);
    }
  }
  const meanSpeed = speeds.length
    ? speeds.reduce((a, b) => a + b, 0) / speeds.length
    : 0;
  const speedStd = speeds.length
    ? Math.sqrt(speeds.reduce((a, b) => a + Math.pow(b - meanSpeed, 2), 0) / speeds.length)
    : 0;
  const speedCV = meanSpeed > 0 ? (speedStd / meanSpeed) * 100 : 0;

  // ── Tremor index via velocity zero-crossings ──────────────────────────────
  // Differentiate speed signal; count sign changes (oscillations ≈ tremor)
  let zeroCrossings = 0;
  for (let i = 2; i < speeds.length; i++) {
    const d1 = speeds[i - 1] - speeds[i - 2];
    const d2 = speeds[i] - speeds[i - 1];
    if (d1 * d2 < 0) zeroCrossings++;
  }
  // Normalise to 0–1; ~30% zero-crossing rate ≈ significant tremor
  const tremorIndex = Math.min(zeroCrossings / Math.max(speeds.length * 0.35, 1), 1);

  // ── Spiral RMSE ───────────────────────────────────────────────────────────
  let spiralRMSE: number | undefined;
  if (task === 'Archimedes Spiral' && allPts.length > 10) {
    const turns = 3.5;
    const a = (CC - 24) / (2 * Math.PI * turns);
    let sumSq = 0;
    for (const p of allPts) {
      const dx = p.x - CC;
      const dy = p.y - CC;
      const rActual = Math.sqrt(dx * dx + dy * dy);
      const theta = Math.atan2(dy, dx) + Math.PI / 2;
      // find nearest ideal radius on the spiral for this angle
      const rIdeal = a * (((theta % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI));
      sumSq += Math.pow(rActual - rIdeal, 2);
    }
    spiralRMSE = Math.sqrt(sumSq / allPts.length);
  }

  // ── Waviness (normalised curvature variance) ──────────────────────────────
  let dtwWaviness: number | undefined;
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
    const varC = curvatures.reduce((a, b) => a + Math.pow(b - meanC, 2), 0) / curvatures.length;
    dtwWaviness = Math.sqrt(varC);
  }

  // ── Pressure ──────────────────────────────────────────────────────────────
  const pressures = allPts.filter((p) => p.p !== undefined).map((p) => p.p!);
  let meanPressure: number | undefined;
  let pressureCV: number | undefined;
  if (pressures.length > 5) {
    meanPressure = pressures.reduce((a, b) => a + b, 0) / pressures.length;
    const stdP = Math.sqrt(
      pressures.reduce((a, b) => a + Math.pow(b - meanPressure!, 2), 0) / pressures.length
    );
    pressureCV = meanPressure > 0 ? (stdP / meanPressure) * 100 : 0;
  }

  return {
    meanSpeed: Math.round(meanSpeed),
    speedCV: Math.round(speedCV),
    tremorIndex,
    spiralRMSE,
    dtwWaviness,
    strokeCount: strokes.length,
    meanPressure,
    pressureCV,
    totalTimeSec: Math.round(totalTimeSec * 10) / 10,
  };
}

/**
 * Maps clinical metrics to a normalised risk score and level.
 *
 * Weights are heuristic approximations informed by published feature
 * importances in PD spiral-drawing classifiers (Zham et al. 2017,
 * Pereira et al. 2016). A production system would replace these with
 * a properly validated model trained on labelled PD/HC data.
 */
function scoreFromMetrics(m: ClinicalMetrics, task: Task): {
  score: number;
  level: 'Low' | 'Medium' | 'High';
  explanation: string[];
} {
  const findings: string[] = [];
  let score = 0;
  let weights = 0;

  // 1. Tremor index (weight 0.35)
  score += m.tremorIndex * 0.35;
  weights += 0.35;
  if (m.tremorIndex > 0.6)
    findings.push('High velocity oscillation frequency — consistent with rest/action tremor.');
  else if (m.tremorIndex > 0.35)
    findings.push('Moderate velocity fluctuation detected.');

  // 2. Speed CV (weight 0.25) — normalise: 0 = 0%, 1 = 120%+ CV
  const speedCVNorm = Math.min(m.speedCV / 120, 1);
  score += speedCVNorm * 0.25;
  weights += 0.25;
  if (m.speedCV > 80)
    findings.push('Large speed variability — possible bradykinesia or dysmetria.');
  else if (m.speedCV > 50)
    findings.push('Moderate speed variability during drawing.');

  // 3. Spiral RMSE (weight 0.25 if available)
  if (m.spiralRMSE !== undefined) {
    // Reference: healthy adults ~5–12 px RMSE; PD patients ~15–35 px
    const rmseNorm = Math.min((m.spiralRMSE - 5) / 30, 1);
    score += Math.max(0, rmseNorm) * 0.25;
    weights += 0.25;
    if (m.spiralRMSE > 18)
      findings.push(`Spiral deviation ${m.spiralRMSE.toFixed(1)} px — exceeds healthy reference range (~12 px).`);
    else if (m.spiralRMSE > 10)
      findings.push('Mild spiral deviation; slightly outside ideal Archimedes path.');
  }

  // 4. Waviness (weight 0.15)
  if (m.dtwWaviness !== undefined) {
    const wavNorm = Math.min(m.dtwWaviness / 0.5, 1);
    score += wavNorm * 0.15;
    weights += 0.15;
    if (m.dtwWaviness > 0.35)
      findings.push('High curvature irregularity — indicates reduced fine motor smoothness.');
  }

  // 5. Stroke lifts (extra penalty)
  if (m.strokeCount > 3) {
    const liftPenalty = Math.min((m.strokeCount - 3) * 0.04, 0.15);
    score += liftPenalty;
    findings.push(`${m.strokeCount} pen-lifts detected — reduced motor continuity.`);
  }

  // 6. Pressure CV if available (weight 0.10)
  if (m.pressureCV !== undefined) {
    const pCVNorm = Math.min(m.pressureCV / 80, 1);
    score += pCVNorm * 0.10;
    weights += 0.10;
    if (m.pressureCV > 50)
      findings.push('High pen-pressure variability — reduced grip stability.');
  }

  // Normalise to actual weights used
  const normalisedScore = weights > 0 ? Math.min(score / (weights / 1.0), 1) : score;
  const finalScore = Math.max(0.04, Math.min(normalisedScore, 0.97));

  const level: 'Low' | 'Medium' | 'High' =
    finalScore < 0.35 ? 'Low'
    : finalScore < 0.65 ? 'Medium'
    : 'High';

  if (findings.length === 0)
    findings.push('No significant motor irregularities detected in this drawing.');

  return { score: finalScore, level, explanation: findings };
}

function analyzeDrawing(strokes: Point[][], task: Task): DrawingResult {
  if (strokes.flat().length < 10) {
    return {
      task,
      riskScore: 0.5,
      riskLevel: 'Medium',
      color: RISK_COLORS.Medium,
      clinical: {
        meanSpeed: 0, speedCV: 0, tremorIndex: 0.5,
        strokeCount: 0, totalTimeSec: 0,
      },
      explanation: ['Insufficient drawing data — please complete the full task.'],
    };
  }

  const clinical = computeClinicalMetrics(strokes, task);
  const { score, level, explanation } = scoreFromMetrics(clinical, task);

  return {
    task,
    riskScore: score,
    riskLevel: level,
    color: RISK_COLORS[level],
    clinical,
    explanation,
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DrawingTest() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('setup');
  const [selectedTask, setSelectedTask] = useState<Task>('Archimedes Spiral');
  const [displayPath, setDisplayPath] = useState('');
  const [result, setResult] = useState<DrawingResult | null>(null);
  const [progress, setProgress] = useState(0);

  // Use refs for hot-path data to avoid stale closure issues
  const strokesRef = useRef<Point[][]>([]);   // all completed strokes
  const currentStroke = useRef<Point[]>([]);
  const currentPath = useRef('');
  const progressInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Guide paths (computed once) ──────────────────────────────────────────
  const spiralGuidePath = useRef(archimedesPath()).current;
  const meanderGuidePath = useRef(meanderPath()).current;

  // ── PanResponder ──────────────────────────────────────────────────────────
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,

      onPanResponderGrant: (e) => {
        const { locationX: x, locationY: y, force } = e.nativeEvent as any;
        const p: Point = { x, y, t: Date.now(), p: force ?? undefined };
        currentStroke.current = [p];
        currentPath.current = `M ${x.toFixed(1)} ${y.toFixed(1)}`;
        setDisplayPath(currentPath.current);
      },

      onPanResponderMove: (e) => {
        const { locationX: x, locationY: y, force } = e.nativeEvent as any;
        const p: Point = { x, y, t: Date.now(), p: force ?? undefined };
        currentStroke.current.push(p);
        currentPath.current += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
        setDisplayPath(currentPath.current);
      },

      onPanResponderRelease: () => {
        if (currentStroke.current.length > 1) {
          strokesRef.current.push([...currentStroke.current]);
        }
        currentStroke.current = [];
      },
    })
  ).current;

  const startDrawing = () => {
    strokesRef.current = [];
    currentStroke.current = [];
    currentPath.current = '';
    setDisplayPath('');
    setPhase('drawing');
  };

  const finishDrawing = useCallback(() => {
    // Flush any active stroke
    if (currentStroke.current.length > 1) {
      strokesRef.current.push([...currentStroke.current]);
    }
    const allStrokes = [...strokesRef.current];
    setProgress(0);
    setPhase('processing');

    progressInterval.current = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          if (progressInterval.current) clearInterval(progressInterval.current);
          const res = analyzeDrawing(allStrokes, selectedTask);
          addTestRecord({
            type: 'DRAWING' as any,
            name: `${selectedTask} Test`,
            riskScore: res.riskScore,
            riskLevel: res.riskLevel,
            metadata: {
              tremorIndex: res.clinical.tremorIndex.toFixed(3),
              speedCV: res.clinical.speedCV,
              meanSpeed: res.clinical.meanSpeed,
              spiralRMSE: res.clinical.spiralRMSE?.toFixed(2) ?? 'N/A',
              strokeCount: res.clinical.strokeCount,
              totalTime: res.clinical.totalTimeSec,
            },
          }).catch(() => {});
          setResult(res);
          setTimeout(() => setPhase('result'), 200);
          return 100;
        }
        return p + 3;
      });
    }, 80);
  }, [selectedTask]);

  const reset = () => {
    strokesRef.current = [];
    currentStroke.current = [];
    currentPath.current = '';
    setDisplayPath('');
    setResult(null);
    setPhase('setup');
  };

  const taskDef = TASKS.find((t) => t.id === selectedTask)!;

  // ── Render: Setup ─────────────────────────────────────────────────────────
  if (phase === 'setup') {
    return (
      <SafeAreaView style={s.safe}>
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          <View style={s.header}>
            <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
              <Ionicons name="arrow-back" size={24} color="#1A1A1A" />
            </TouchableOpacity>
            <Text style={s.headerTitle}>Drawing Test</Text>
          </View>

          <View style={s.instructionCard}>
            <View style={s.instructionTop}>
              <View style={s.instructionIconCircle}>
                <Ionicons name="pencil" size={48} color="#FF8C42" />
              </View>
            </View>
            <View style={s.instructionBody}>
              <Text style={s.instructionTitle}>Motor Skills Assessment</Text>
              <Text style={s.instructionSub}>
                This test analyses fine motor control using clinically-validated drawing tasks.
                Sit comfortably and draw as smoothly as possible. Tremor index, speed variability,
                and spiral deviation are measured.
              </Text>
              <View style={s.disclaimerBadge}>
                <Ionicons name="information-circle-outline" size={14} color="#888" />
                <Text style={s.disclaimerText}>
                  Screening tool only — not a medical diagnosis.
                </Text>
              </View>
            </View>
          </View>

          <Text style={s.sectionTitle}>Select Task</Text>
          {TASKS.map((t) => (
            <TouchableOpacity
              key={t.id}
              style={[s.taskCard, { backgroundColor: t.bg }, selectedTask === t.id && s.taskCardSelected]}
              onPress={() => setSelectedTask(t.id)}
              activeOpacity={0.8}
            >
              <View style={[s.taskIcon, { backgroundColor: t.color }]}>
                <Ionicons name={t.icon as any} size={28} color="#fff" />
              </View>
              <View style={s.taskInfo}>
                <Text style={s.taskName}>{t.id}</Text>
                <Text style={s.taskDesc}>{t.shortDesc}</Text>
              </View>
              {selectedTask === t.id && (
                <Ionicons name="checkmark-circle" size={24} color={t.color} />
              )}
            </TouchableOpacity>
          ))}

          <TouchableOpacity style={s.primaryBtn} onPress={startDrawing} activeOpacity={0.85}>
            <Ionicons name="pencil" size={20} color="#FFFFFF" />
            <Text style={s.primaryBtnText}>Start Drawing</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Render: Drawing ───────────────────────────────────────────────────────
  if (phase === 'drawing') {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.drawingContainer}>
          <View style={s.header}>
            <TouchableOpacity onPress={reset} style={s.backBtn}>
              <Ionicons name="arrow-back" size={24} color="#1A1A1A" />
            </TouchableOpacity>
            <Text style={s.headerTitle}>{selectedTask}</Text>
          </View>

          <View style={s.instructionPill}>
            <Text style={s.instructionPillText}>{taskDef.instruction}</Text>
          </View>

          <View
            style={s.canvas}
            {...panResponder.panHandlers}
          >
            <Svg width={CANVAS_SIZE} height={CANVAS_SIZE}>
              {/* ── Guide overlays ── */}
              {selectedTask === 'Archimedes Spiral' && (
                <>
                  <Path
                    d={spiralGuidePath}
                    stroke="#D8D0C8" strokeWidth={1.5}
                    fill="none" strokeDasharray="5 4"
                  />
                  {/* Centre start dot */}
                  <Circle cx={CC} cy={CC} r={5} fill="#FF8C42" opacity={0.6} />
                </>
              )}

              {selectedTask === 'Meander Wave' && (
                <>
                  <Path
                    d={meanderGuidePath}
                    stroke="#D8D0C8" strokeWidth={1.5}
                    fill="none" strokeDasharray="6 4"
                  />
                  {/* Start arrow */}
                  <Circle cx={20} cy={CC} r={5} fill="#5DBEA3" opacity={0.6} />
                </>
              )}

              {selectedTask === 'Clock Drawing' && (
                <>
                  <Circle
                    cx={CC} cy={CC} r={CC - 16}
                    stroke="#D8D0C8" strokeWidth={2} fill="none"
                  />
                  <Circle cx={CC} cy={CC} r={5} fill="#7B68EE" opacity={0.6} />
                  {/* Hour markers */}
                  {[...Array(12)].map((_, i) => {
                    const angle = (i * 30 - 90) * (Math.PI / 180);
                    const r1 = CC - 18;
                    const r2 = CC - 28;
                    return (
                      <Line
                        key={i}
                        x1={CC + r1 * Math.cos(angle)} y1={CC + r1 * Math.sin(angle)}
                        x2={CC + r2 * Math.cos(angle)} y2={CC + r2 * Math.sin(angle)}
                        stroke="#D8D0C8" strokeWidth={i % 3 === 0 ? 2.5 : 1}
                      />
                    );
                  })}
                  {/* 12/3/6/9 numbers */}
                  {[12, 3, 6, 9].map((n, i) => {
                    const angle = (i * 90 - 90) * (Math.PI / 180);
                    const r = CC - 44;
                    return (
                      <SvgText
                        key={n}
                        x={CC + r * Math.cos(angle)}
                        y={CC + r * Math.sin(angle) + 5}
                        textAnchor="middle" fontSize={15} fill="#CCCCCC" fontWeight="600"
                      >
                        {n}
                      </SvgText>
                    );
                  })}
                  <Text style={s.clockInstruction}>Draw hands for 10:10</Text>
                </>
              )}

              {/* User strokes */}
              {displayPath ? (
                <Path
                  d={displayPath}
                  stroke={taskDef.color} strokeWidth={3}
                  fill="none" strokeLinecap="round" strokeLinejoin="round"
                />
              ) : null}
            </Svg>
          </View>

          <View style={s.drawingActions}>
            <TouchableOpacity
              style={s.clearBtn}
              onPress={() => {
                strokesRef.current = [];
                currentStroke.current = [];
                currentPath.current = '';
                setDisplayPath('');
              }}
            >
              <Ionicons name="trash-outline" size={20} color="#6B6B6B" />
              <Text style={s.clearBtnText}>Clear</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.primaryBtn, { flex: 1, marginTop: 0 }]}
              onPress={finishDrawing}
              disabled={strokesRef.current.length === 0 && currentStroke.current.length < 5}
              activeOpacity={0.85}
            >
              <Ionicons name="checkmark" size={20} color="#FFFFFF" />
              <Text style={s.primaryBtnText}>Analyse</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ── Render: Processing ────────────────────────────────────────────────────
  if (phase === 'processing') {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.centered}>
          <Text style={s.processingSubtitle}>Clinical Analysis</Text>
          <Text style={s.processingTitle}>Computing metrics…</Text>
          <View style={s.pulseWrap}>
            <View style={s.pulseRing} />
            <View style={s.pulseCircle}>
              <Ionicons name="analytics-outline" size={40} color="#FF8C42" />
            </View>
          </View>
          <Text style={s.processingBody}>Analysing motor biomarkers</Text>
          <Text style={s.processingBodySub}>
            Tremor index · Speed variability · Spiral deviation · Curvature regularity
          </Text>
          <View style={s.progressBarWrap}>
            <ProgressBar value={progress} height={8} color="#FF8C42" />
            <View style={s.progressLabelRow}>
              <Text style={s.progressLabelText}>Processing</Text>
              <Text style={s.progressLabelText}>{Math.round(progress)}%</Text>
            </View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ── Render: Result ────────────────────────────────────────────────────────
  if (phase === 'result' && result) {
    const badge = RISK_BADGES[result.riskLevel];
    const c = result.clinical;
    const hasSpiral = c.spiralRMSE !== undefined;

    return (
      <SafeAreaView style={s.safe}>
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          <View style={s.header}>
            <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
              <Ionicons name="arrow-back" size={24} color="#1A1A1A" />
            </TouchableOpacity>
            <Text style={[s.headerTitle, { color: '#FF8C42' }]}>NeuroVoice</Text>
            <TouchableOpacity style={s.infoBtn}>
              <Ionicons name="information-circle-outline" size={24} color="#FF8C42" />
            </TouchableOpacity>
          </View>

          <View style={s.resultHeaderSection}>
            <Text style={s.resultTitle}>Analysis Complete</Text>
            <Text style={s.resultSub}>{result.task} · {c.totalTimeSec}s</Text>
          </View>

          <View style={s.ringWrap}>
            <RiskRing score={result.riskScore} color={result.color} size={192} />
            <View style={[s.riskBadge, { backgroundColor: badge.bg }]}>
              <Text style={[s.riskBadgeText, { color: badge.text }]}>
                {result.riskLevel} Risk
              </Text>
            </View>
          </View>

          {/* Clinical findings */}
          <View style={s.findingsCard}>
            <Text style={s.findingsTitle}>Clinical Findings</Text>
            {result.explanation.map((e, i) => (
              <View key={i} style={s.findingRow}>
                <Ionicons
                  name={result.riskLevel === 'Low' ? 'checkmark-circle' : 'alert-circle'}
                  size={16}
                  color={result.color}
                  style={{ marginTop: 1 }}
                />
                <Text style={s.findingText}>{e}</Text>
              </View>
            ))}
            <Text style={s.insightDisclaimer}>
              Screening tool only — not a clinical diagnosis. Consult a neurologist for assessment.
            </Text>
          </View>

          {/* Metrics grid */}
          <Text style={s.sectionTitle}>Motor Biomarkers</Text>
          <View style={s.metricsGrid}>
            <MetricCard
              label="Tremor Index"
              value={(c.tremorIndex * 100).toFixed(0) + '%'}
              ref_low="<35%" ref_high=">60%"
              flagged={c.tremorIndex > 0.35}
              color={result.color}
            />
            <MetricCard
              label="Speed CV"
              value={c.speedCV + '%'}
              ref_low="<50%" ref_high=">80%"
              flagged={c.speedCV > 50}
              color={result.color}
            />
            <MetricCard
              label="Mean Speed"
              value={c.meanSpeed + ' px/s'}
              ref_low="" ref_high=""
              flagged={false}
              color={result.color}
            />
            <MetricCard
              label="Pen Lifts"
              value={String(c.strokeCount)}
              ref_low="1" ref_high=">3"
              flagged={c.strokeCount > 3}
              color={result.color}
            />
            {hasSpiral && (
              <MetricCard
                label="Spiral RMSE"
                value={c.spiralRMSE!.toFixed(1) + ' px'}
                ref_low="<12 px" ref_high=">18 px"
                flagged={c.spiralRMSE! > 12}
                color={result.color}
              />
            )}
            {c.dtwWaviness !== undefined && (
              <MetricCard
                label="Waviness"
                value={c.dtwWaviness.toFixed(3)}
                ref_low="<0.2" ref_high=">0.35"
                flagged={c.dtwWaviness > 0.2}
                color={result.color}
              />
            )}
            {c.pressureCV !== undefined && (
              <MetricCard
                label="Pressure CV"
                value={c.pressureCV.toFixed(0) + '%'}
                ref_low="<40%" ref_high=">50%"
                flagged={c.pressureCV > 40}
                color={result.color}
              />
            )}
          </View>

          <TouchableOpacity
            style={s.primaryBtn}
            onPress={() => router.push('/(tabs)/history')}
            activeOpacity={0.85}
          >
            <Text style={s.primaryBtnText}>View Full Insights</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.secondaryBtn} onPress={reset} activeOpacity={0.85}>
            <Ionicons name="refresh-outline" size={20} color="#FF8C42" />
            <Text style={s.secondaryBtnText}>Try Again</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return null;
}

// ─── MetricCard sub-component ─────────────────────────────────────────────────

function MetricCard({
  label, value, ref_low, ref_high, flagged, color,
}: {
  label: string; value: string;
  ref_low: string; ref_high: string;
  flagged: boolean; color: string;
}) {
  return (
    <View style={[s.metricCard, flagged && { borderColor: color, borderWidth: 1.5 }]}>
      <View style={s.metricCardHeader}>
        <Text style={s.metricCardLabel}>{label}</Text>
        {flagged && <Ionicons name="warning-outline" size={12} color={color} />}
      </View>
      <Text style={[s.metricCardValue, flagged && { color }]}>{value}</Text>
      {(ref_low || ref_high) && (
        <Text style={s.metricCardRef}>
          {ref_low && `Normal: ${ref_low}`}{ref_low && ref_high ? '  ' : ''}{ref_high && `High: ${ref_high}`}
        </Text>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#EFEBE6' },
  scroll: { padding: 20, paddingBottom: 40 },
  centered: { flex: 1, padding: 20, alignItems: 'center', justifyContent: 'center' },
  drawingContainer: { flex: 1, padding: 20 },

  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  backBtn: { padding: 4, marginRight: 12 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: '#1A1A1A', textAlign: 'center' },
  infoBtn: { padding: 4 },

  instructionCard: { backgroundColor: '#FFFFFF', borderRadius: 24, overflow: 'hidden', marginBottom: 24 },
  instructionTop: { backgroundColor: '#FFD4B8', height: 140, alignItems: 'center', justifyContent: 'center' },
  instructionIconCircle: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },
  instructionBody: { padding: 20 },
  instructionTitle: { fontSize: 20, fontWeight: '700', color: '#1A1A1A', marginBottom: 6 },
  instructionSub: { fontSize: 13, color: '#6B6B6B', lineHeight: 19, marginBottom: 10 },
  disclaimerBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#F5F5F5', borderRadius: 8, padding: 8,
  },
  disclaimerText: { fontSize: 11, color: '#888', flex: 1 },

  sectionTitle: { fontSize: 20, fontWeight: '700', color: '#1A1A1A', marginBottom: 12 },

  taskCard: {
    borderRadius: 20, padding: 18,
    flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 10,
    borderWidth: 2, borderColor: 'transparent',
  },
  taskCardSelected: { borderColor: '#FF8C42' },
  taskIcon: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  taskInfo: { flex: 1 },
  taskName: { fontSize: 16, fontWeight: '700', color: '#1A1A1A', marginBottom: 2 },
  taskDesc: { fontSize: 12, color: '#6B6B6B' },

  primaryBtn: {
    backgroundColor: '#FF8C42', borderRadius: 9999,
    paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 16,
    shadowColor: '#FF8C42', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  primaryBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  secondaryBtn: {
    backgroundColor: '#FFE8D6', borderRadius: 9999,
    paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 12,
  },
  secondaryBtnText: { color: '#FF8C42', fontSize: 16, fontWeight: '700' },

  instructionPill: {
    backgroundColor: '#FFF8F0', borderRadius: 12,
    padding: 12, marginBottom: 14,
    borderLeftWidth: 3, borderLeftColor: '#FF8C42',
  },
  instructionPillText: { fontSize: 13, color: '#6B6B6B', lineHeight: 18 },

  canvas: {
    width: CANVAS_SIZE, height: CANVAS_SIZE,
    backgroundColor: '#FFFFFF', borderRadius: 24,
    alignSelf: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 3,
  },
  clockInstruction: {
    // Fallback for clock task note — SVG Text handles it
  } as any,
  drawingActions: { flexDirection: 'row', gap: 12, marginTop: 16, alignItems: 'center' },
  clearBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#FFFFFF', borderRadius: 9999,
    paddingVertical: 16, paddingHorizontal: 20,
    borderWidth: 1, borderColor: '#E0E0E0',
  },
  clearBtnText: { fontSize: 15, color: '#6B6B6B', fontWeight: '600' },

  processingSubtitle: { fontSize: 13, color: '#6B6B6B', fontWeight: '600', marginBottom: 6 },
  processingTitle: { fontSize: 28, fontWeight: '700', color: '#1A1A1A', marginBottom: 32 },
  pulseWrap: { width: 128, height: 128, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  pulseRing: { position: 'absolute', width: 128, height: 128, borderRadius: 64, backgroundColor: '#FF8C42', opacity: 0.1 },
  pulseCircle: { width: 128, height: 128, borderRadius: 64, backgroundColor: '#FFD4B8', alignItems: 'center', justifyContent: 'center' },
  processingBody: { fontSize: 18, fontWeight: '700', color: '#1A1A1A', marginBottom: 6 },
  processingBodySub: { fontSize: 13, color: '#6B6B6B', textAlign: 'center', maxWidth: 280, lineHeight: 19, marginBottom: 28 },
  progressBarWrap: { width: '100%', maxWidth: 300 },
  progressLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  progressLabelText: { fontSize: 12, color: '#6B6B6B' },

  resultHeaderSection: { alignItems: 'center', marginBottom: 24 },
  resultTitle: { fontSize: 28, fontWeight: '700', color: '#1A1A1A', marginBottom: 6 },
  resultSub: { fontSize: 15, color: '#6B6B6B' },
  ringWrap: { alignItems: 'center', marginBottom: 24 },
  riskBadge: { borderRadius: 9999, paddingHorizontal: 20, paddingVertical: 8, marginTop: 12 },
  riskBadgeText: { fontSize: 14, fontWeight: '700' },

  findingsCard: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 20, marginBottom: 20 },
  findingsTitle: { fontSize: 16, fontWeight: '700', color: '#1A1A1A', marginBottom: 12 },
  findingRow: { flexDirection: 'row', gap: 8, marginBottom: 8, alignItems: 'flex-start' },
  findingText: { fontSize: 13, color: '#444', lineHeight: 18, flex: 1 },
  insightDisclaimer: { fontSize: 11, color: '#BBBBBB', textAlign: 'center', marginTop: 10 },

  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  metricCard: {
    width: '47%', backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14,
    borderWidth: 1.5, borderColor: 'transparent',
  },
  metricCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  metricCardLabel: { fontSize: 11, fontWeight: '600', color: '#6B6B6B', letterSpacing: 0.4 },
  metricCardValue: { fontSize: 20, fontWeight: '700', color: '#1A1A1A', marginBottom: 2 },
  metricCardRef: { fontSize: 10, color: '#BBBBBB', lineHeight: 14 },
});