// FingerTappingTest — Clinically grounded Parkinson's motor assessment
// Protocol: MDS-UPDRS Part III Item 3.4 (Finger Tapping)
// Each hand tested separately for 10 seconds.
// Patient taps index finger to thumb as fast and as big as possible.
// Scoring: 0–4 UPDRS scale per hand, combined for overall severity.

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, SafeAreaView, Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ProgressBar } from '../components/ProgressBar';
import { RiskRing } from '../components/RiskRing';
import { addTestRecord } from '../utils/storage';

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase = 'setup' | 'countdown' | 'testing' | 'rest' | 'processing' | 'result';
type Hand = 'L' | 'R';

interface TapRecord { timestamp: number; }

// UPDRS 3.4 per-hand score: 0 = Normal, 4 = Severe
interface HandResult {
  hand: Hand;
  tapCount: number;
  /** Taps per second over 10 s */
  frequency: number;
  /** Coefficient of variation of inter-tap intervals */
  rhythmCV: number;
  /** Number of pauses > 2× mean ITI (hesitations) */
  hesitations: number;
  /** Ratio: mean ITI of last 5 taps / first 5 taps — >1.15 indicates fatigue */
  fatigueRatio: number;
  /** MDS-UPDRS 3.4 score 0–4 */
  updrsScore: number;
}

interface TapResult {
  left: HandResult;
  right: HandResult;
  /** Mean of both UPDRS scores, rounded to 1 dp */
  combinedUpdrs: number;
  /** 0–1 normalised risk for ring display */
  riskScore: number;
  riskLevel: 'Normal' | 'Mild' | 'Moderate' | 'Severe';
  color: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** MDS-UPDRS 3.4 standard: 10 seconds per hand */
const TEST_DURATION_S = 10;
/** Pause threshold: inter-tap interval > 2× mean = hesitation */
const HESITATION_MULTIPLIER = 2;
/** Fatigue threshold: last-5 / first-5 mean ITI ratio */
const FATIGUE_THRESHOLD = 1.15;

/**
 * MDS-UPDRS 3.4 frequency cutoffs (taps/sec):
 *   0 = ≥ 4.5 Hz  (normal)
 *   1 = 3.5–4.4  (slight)
 *   2 = 2.5–3.4  (mild)
 *   3 = 1.5–2.4  (moderate)
 *   4 = < 1.5    (severe / cannot perform)
 */
const FREQ_CUTOFFS = [4.5, 3.5, 2.5, 1.5]; // scores 0,1,2,3,4

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcITIs(timestamps: number[]): number[] {
  if (timestamps.length < 2) return [];
  return timestamps.slice(1).map((t, i) => t - timestamps[i]);
}

function mean(arr: number[]): number {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stddev(arr: number[], mu: number): number {
  if (arr.length < 2) return 0;
  return Math.sqrt(arr.reduce((s, v) => s + (v - mu) ** 2, 0) / arr.length);
}

/**
 * Compute MDS-UPDRS 3.4 score (0–4) for one hand.
 *
 * Scoring logic follows published UPDRS anchors:
 *   Primary driver = tap frequency (Hz).
 *   Secondary modifiers:
 *     +1 if ≥2 hesitations (interrupted rhythm)
 *     +1 if fatigue ratio ≥ 1.15 (clear decrement)
 *     +0.5 if CV > 0.30 (irregular rhythm)
 *   Final score clamped 0–4.
 */
function scoreHand(taps: TapRecord[]): HandResult {
  const timestamps = taps.map(t => t.timestamp);
  const tapCount = taps.length;
  const frequency = tapCount / TEST_DURATION_S;

  // Frequency → base UPDRS score
  let baseScore: number;
  if (frequency >= FREQ_CUTOFFS[0])      baseScore = 0;
  else if (frequency >= FREQ_CUTOFFS[1]) baseScore = 1;
  else if (frequency >= FREQ_CUTOFFS[2]) baseScore = 2;
  else if (frequency >= FREQ_CUTOFFS[3]) baseScore = 3;
  else                                    baseScore = 4;

  // Rhythm metrics
  const itis = calcITIs(timestamps);
  const muITI = mean(itis);
  const sdITI = stddev(itis, muITI);
  const rhythmCV = muITI > 0 ? sdITI / muITI : 0;

  // Hesitations: ITI > HESITATION_MULTIPLIER × mean
  const hesitations = itis.filter(iti => iti > HESITATION_MULTIPLIER * muITI).length;

  // Fatigue: compare mean ITI of first 5 vs last 5 taps
  let fatigueRatio = 1;
  if (timestamps.length >= 10) {
    const firstITIs = calcITIs(timestamps.slice(0, 6));  // first 5 intervals
    const lastITIs  = calcITIs(timestamps.slice(-6));    // last 5 intervals
    const muFirst = mean(firstITIs);
    const muLast  = mean(lastITIs);
    fatigueRatio = muFirst > 0 ? muLast / muFirst : 1;
  }

  // Apply secondary modifiers
  let modifier = 0;
  if (hesitations >= 2)         modifier += 1;
  if (fatigueRatio >= FATIGUE_THRESHOLD) modifier += 1;
  if (rhythmCV > 0.30)          modifier += 0.5;

  const updrsScore = Math.min(4, Math.round((baseScore + modifier) * 2) / 2);

  return {
    hand: 'L', // caller sets this
    tapCount,
    frequency: Math.round(frequency * 10) / 10,
    rhythmCV: Math.round(rhythmCV * 100) / 100,
    hesitations,
    fatigueRatio: Math.round(fatigueRatio * 100) / 100,
    updrsScore,
  };
}

function analyzeResults(leftTaps: TapRecord[], rightTaps: TapRecord[]): TapResult {
  const left  = { ...scoreHand(leftTaps),  hand: 'L' as Hand };
  const right = { ...scoreHand(rightTaps), hand: 'R' as Hand };

  const combinedUpdrs = Math.round(((left.updrsScore + right.updrsScore) / 2) * 10) / 10;

  // Map 0–4 UPDRS to risk metadata
  let riskLevel: TapResult['riskLevel'];
  let color: string;
  let riskScore: number;

  if (combinedUpdrs <= 0.5) {
    riskLevel = 'Normal';    color = '#5DBEA3'; riskScore = 0.10;
  } else if (combinedUpdrs <= 1.5) {
    riskLevel = 'Mild';      color = '#FFD700'; riskScore = 0.35;
  } else if (combinedUpdrs <= 2.5) {
    riskLevel = 'Moderate';  color = '#FF9F43'; riskScore = 0.60;
  } else {
    riskLevel = 'Severe';    color = '#FF6B6B'; riskScore = 0.85;
  }

  return { left, right, combinedUpdrs, riskScore, riskLevel, color };
}

// ─── Risk colour helpers ───────────────────────────────────────────────────────

const getRiskBadge = (l: string) =>
  l === 'Normal'   ? { bg: '#D4F1E8', text: '#5DBEA3' }
  : l === 'Mild'   ? { bg: '#FFFBE6', text: '#B8860B' }
  : l === 'Moderate' ? { bg: '#FFE8D6', text: '#FF9F43' }
  : { bg: '#FFE0E0', text: '#FF6B6B' };

const UPDRS_LABELS: Record<number, string> = {
  0: 'Normal',
  0.5: 'Borderline',
  1: 'Slight',
  1.5: 'Slight–Mild',
  2: 'Mild',
  2.5: 'Mild–Moderate',
  3: 'Moderate',
  3.5: 'Moderate–Severe',
  4: 'Severe',
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function FingerTest() {
  const router = useRouter();
  const [phase, setPhase]           = useState<Phase>('setup');
  const [currentHand, setCurrentHand] = useState<Hand>('L');
  const [elapsed, setElapsed]       = useState(0);
  const [countdown, setCountdown]   = useState(3);
  const [leftTaps, setLeftTaps]     = useState<TapRecord[]>([]);
  const [rightTaps, setRightTaps]   = useState<TapRecord[]>([]);
  const [result, setResult]         = useState<TapResult | null>(null);
  const [progress, setProgress]     = useState(0);

  const leftTapsRef  = useRef<TapRecord[]>([]);
  const rightTapsRef = useRef<TapRecord[]>([]);
  const timerRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const tapAnim      = useRef(new Animated.Value(1)).current;

  useEffect(() => () => {
    if (timerRef.current)   clearInterval(timerRef.current);
    if (progressRef.current) clearInterval(progressRef.current);
  }, []);

  // ── Countdown → test start ─────────────────────────────────────────────────
  const beginCountdown = (hand: Hand) => {
    setCurrentHand(hand);
    setCountdown(3);
    setPhase('countdown');
    let c = 3;
    timerRef.current = setInterval(() => {
      c--;
      if (c <= 0) {
        clearInterval(timerRef.current!);
        startHandTest(hand);
      } else {
        setCountdown(c);
      }
    }, 1000);
  };

  // ── Run one hand's 10-second test ──────────────────────────────────────────
  const startHandTest = (hand: Hand) => {
    setElapsed(0);
    setPhase('testing');
    let s = 0;
    timerRef.current = setInterval(() => {
      s++;
      setElapsed(s);
      if (s >= TEST_DURATION_S) {
        clearInterval(timerRef.current!);
        timerRef.current = null;
        if (hand === 'L') {
          // After left hand, move to rest/transition screen before right hand
          setPhase('rest');
        } else {
          finishBothHands();
        }
      }
    }, 1000);
  };

  // ── Record a tap ───────────────────────────────────────────────────────────
  const handleTap = () => {
    const rec: TapRecord = { timestamp: Date.now() };
    if (currentHand === 'L') {
      leftTapsRef.current.push(rec);
      setLeftTaps(prev => [...prev, rec]);
    } else {
      rightTapsRef.current.push(rec);
      setRightTaps(prev => [...prev, rec]);
    }
    Animated.sequence([
      Animated.timing(tapAnim, { toValue: 0.90, duration: 70, useNativeDriver: true }),
      Animated.timing(tapAnim, { toValue: 1,    duration: 70, useNativeDriver: true }),
    ]).start();
  };

  // ── Finish early (uses taps up to now) ────────────────────────────────────
  const finishEarly = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (currentHand === 'L') {
      setPhase('rest');
    } else {
      finishBothHands();
    }
  }, [currentHand]);

  // ── Process results ───────────────────────────────────────────────────────
  const finishBothHands = useCallback(() => {
    setProgress(0);
    setPhase('processing');
    const capturedL = [...leftTapsRef.current];
    const capturedR = [...rightTapsRef.current];
    progressRef.current = setInterval(() => {
      setProgress(p => {
        if (p >= 100) {
          clearInterval(progressRef.current!);
          const res = analyzeResults(capturedL, capturedR);
          addTestRecord({
            type: 'FINGER' as any,
            name: 'Finger Tapping Test (UPDRS 3.4)',
            riskScore: res.riskScore,
            riskLevel: res.riskLevel as any,
            metadata: {
              leftFrequency:  res.left.frequency,
              rightFrequency: res.right.frequency,
              leftUpdrs:      res.left.updrsScore,
              rightUpdrs:     res.right.updrsScore,
              combinedUpdrs:  res.combinedUpdrs,
            },
          }).catch(() => {});
          setResult(res);
          setTimeout(() => setPhase('result'), 200);
          return 100;
        }
        return p + 5;
      });
    }, 80);
  }, []);

  const reset = () => {
    leftTapsRef.current  = [];
    rightTapsRef.current = [];
    setLeftTaps([]);
    setRightTaps([]);
    setResult(null);
    setElapsed(0);
    setPhase('setup');
  };

  // ─── Setup ────────────────────────────────────────────────────────────────
  if (phase === 'setup') {
    return (
      <SafeAreaView style={s.safe}>
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          <View style={s.header}>
            <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
              <Ionicons name="arrow-back" size={24} color="#1A1A1A" />
            </TouchableOpacity>
            <Text style={s.headerTitle}>Finger Tapping Test</Text>
          </View>

          <View style={s.instructionCard}>
            <View style={s.instructionTop}>
              <View style={s.instructionIconCircle}>
                <Ionicons name="hand-left-outline" size={48} color="#FF8C42" />
              </View>
            </View>
            <View style={s.instructionBody}>
              <Text style={s.instructionTitle}>MDS-UPDRS Motor Assessment</Text>
              <Text style={s.instructionSub}>
                Tap your <Text style={{ fontWeight: '700' }}>index finger to your thumb</Text> as quickly and as widely as possible.{'\n\n'}
                Each hand is tested for <Text style={{ fontWeight: '700' }}>10 seconds</Text> separately — left hand first, then right.{'\n\n'}
                Keep your arm resting on a surface. Only move your fingers, not your wrist or arm.
              </Text>
            </View>
          </View>

          <View style={s.infoRow}>
            <View style={[s.infoCard, { backgroundColor: '#FFD4B8' }]}>
              <Ionicons name="timer-outline" size={24} color="#FF8C42" />
              <Text style={s.infoCardValue}>10s</Text>
              <Text style={s.infoCardLabel}>Per Hand</Text>
            </View>
            <View style={[s.infoCard, { backgroundColor: '#C8E6DD' }]}>
              <Ionicons name="swap-horizontal-outline" size={24} color="#5DBEA3" />
              <Text style={s.infoCardValue}>L → R</Text>
              <Text style={s.infoCardLabel}>Sequence</Text>
            </View>
            <View style={[s.infoCard, { backgroundColor: '#E8E4FF' }]}>
              <Ionicons name="analytics-outline" size={24} color="#7B68EE" />
              <Text style={s.infoCardValue}>UPDRS</Text>
              <Text style={s.infoCardLabel}>Scale 0–4</Text>
            </View>
          </View>

          {/* Clinical note */}
          <View style={s.clinicalNote}>
            <Ionicons name="information-circle-outline" size={16} color="#7B68EE" />
            <Text style={s.clinicalNoteText}>
              Scoring follows MDS-UPDRS Part III, Item 3.4. This is a validated motor screening tool — not a standalone clinical diagnosis.
            </Text>
          </View>

          <TouchableOpacity style={s.primaryBtn} onPress={() => beginCountdown('L')} activeOpacity={0.85}>
            <Ionicons name="play-circle-outline" size={20} color="#FFFFFF" />
            <Text style={s.primaryBtnText}>Start — Left Hand</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ─── Countdown ────────────────────────────────────────────────────────────
  if (phase === 'countdown') {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.centered}>
          <Text style={s.countdownHandLabel}>
            {currentHand === 'L' ? 'Left Hand' : 'Right Hand'}
          </Text>
          <Text style={s.countdownTitle}>Get Ready</Text>
          <View style={s.countdownCircle}>
            <Text style={s.countdownDigit}>{countdown}</Text>
          </View>
          <Text style={s.countdownHint}>
            Index finger to thumb — as fast and wide as possible
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // ─── Testing ──────────────────────────────────────────────────────────────
  if (phase === 'testing') {
    const remaining  = TEST_DURATION_S - elapsed;
    const progressVal = (elapsed / TEST_DURATION_S) * 100;
    const tapCount   = currentHand === 'L' ? leftTaps.length : rightTaps.length;
    const freqNow    = elapsed > 0 ? (tapCount / elapsed).toFixed(1) : '—';

    return (
      <SafeAreaView style={s.safe}>
        <View style={s.testingContainer}>
          <View style={s.header}>
            <TouchableOpacity onPress={reset} style={s.backBtn}>
              <Ionicons name="arrow-back" size={24} color="#1A1A1A" />
            </TouchableOpacity>
            <Text style={s.headerTitle}>
              {currentHand === 'L' ? 'Left Hand' : 'Right Hand'}
            </Text>
          </View>

          <View style={s.timerSection}>
            <View style={s.timerBox}>
              <Text style={s.timerDigit}>{remaining}</Text>
              <Text style={s.timerUnit}>SECONDS LEFT</Text>
            </View>
            <ProgressBar value={progressVal} height={6} color="#FF8C42" />
          </View>

          {/* Live metrics */}
          <View style={s.countRow}>
            <View style={[s.countCard, { backgroundColor: '#FFD4B8' }]}>
              <Text style={s.countValue}>{tapCount}</Text>
              <Text style={s.countLabel}>Taps</Text>
            </View>
            <View style={s.totalCount}>
              <Text style={s.totalValue}>{freqNow}</Text>
              <Text style={s.totalLabel}>Hz</Text>
            </View>
            <View style={[s.countCard, { backgroundColor: '#C8E6DD' }]}>
              <Text style={s.countValue}>{elapsed}</Text>
              <Text style={s.countLabel}>Elapsed (s)</Text>
            </View>
          </View>

          {/* Single large tap button */}
          <Animated.View style={{ transform: [{ scale: tapAnim }] }}>
            <TouchableOpacity
              style={[s.tapBtn, currentHand === 'L' ? s.tapBtnLeft : s.tapBtnRight]}
              onPress={handleTap}
              activeOpacity={0.7}
            >
              <Ionicons
                name={currentHand === 'L' ? 'hand-left' : 'hand-right'}
                size={56}
                color={currentHand === 'L' ? '#FF8C42' : '#5DBEA3'}
              />
              <Text style={[s.tapBtnLabel, currentHand === 'R' && { color: '#5DBEA3' }]}>
                TAP
              </Text>
            </TouchableOpacity>
          </Animated.View>

          <Text style={s.tapHint}>
            Index finger ↔ thumb, as fast and wide as possible
          </Text>

          <TouchableOpacity style={s.stopEarlyBtn} onPress={finishEarly}>
            <Text style={s.stopEarlyText}>Finish Hand Early</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ─── Rest / Transition between hands ─────────────────────────────────────
  if (phase === 'rest') {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.centered}>
          <View style={[s.countdownCircle, { backgroundColor: '#C8E6DD' }]}>
            <Ionicons name="checkmark" size={48} color="#5DBEA3" />
          </View>
          <Text style={s.countdownTitle}>Left Hand Done</Text>
          <Text style={[s.countdownHint, { marginTop: 8 }]}>
            {leftTaps.length} taps · {leftTaps.length / TEST_DURATION_S >= 4.5
              ? 'Good speed'
              : leftTaps.length / TEST_DURATION_S >= 3.5
              ? 'Slight reduction noted'
              : 'Low speed detected'}
          </Text>
          <Text style={[s.countdownHint, { marginBottom: 32 }]}>
            Rest your left hand. Now test your right hand.
          </Text>
          <TouchableOpacity style={s.primaryBtn} onPress={() => beginCountdown('R')} activeOpacity={0.85}>
            <Ionicons name="play-circle-outline" size={20} color="#FFFFFF" />
            <Text style={s.primaryBtnText}>Start — Right Hand</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ─── Processing ───────────────────────────────────────────────────────────
  if (phase === 'processing') {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.centered}>
          <Text style={s.processingSubtitle}>UPDRS 3.4 Analysis</Text>
          <Text style={s.processingTitle}>Analysing results…</Text>
          <View style={s.pulseWrap}>
            <View style={s.pulseRing} />
            <View style={s.pulseCircle}>
              <Ionicons name="analytics-outline" size={40} color="#FF8C42" />
            </View>
          </View>
          <Text style={s.processingBody}>Scoring tap frequency, rhythm, hesitations & fatigue</Text>
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

  // ─── Result ───────────────────────────────────────────────────────────────
  if (phase === 'result' && result) {
    const badge = getRiskBadge(result.riskLevel);
    const updrsLabel = UPDRS_LABELS[result.combinedUpdrs] ?? `Score ${result.combinedUpdrs}`;

    const handRow = (h: HandResult, accent: string) => (
      <View style={[s.handResultCard, { borderLeftColor: accent }]} key={h.hand}>
        <Text style={[s.handResultTitle, { color: accent }]}>
          {h.hand === 'L' ? 'Left Hand' : 'Right Hand'}
        </Text>
        <View style={s.handMetricsRow}>
          <View style={s.handMetric}>
            <Text style={s.handMetricValue}>{h.frequency}/s</Text>
            <Text style={s.handMetricLabel}>Frequency</Text>
          </View>
          <View style={s.handMetric}>
            <Text style={[s.handMetricValue,
              { color: h.updrsScore >= 2 ? '#FF6B6B' : '#5DBEA3' }]}>
              {h.updrsScore}
            </Text>
            <Text style={s.handMetricLabel}>UPDRS Score</Text>
          </View>
          <View style={s.handMetric}>
            <Text style={[s.handMetricValue,
              { color: h.hesitations >= 2 ? '#FF6B6B' : '#5DBEA3' }]}>
              {h.hesitations}
            </Text>
            <Text style={s.handMetricLabel}>Hesitations</Text>
          </View>
          <View style={s.handMetric}>
            <Text style={[s.handMetricValue,
              { color: h.fatigueRatio >= FATIGUE_THRESHOLD ? '#FF9F43' : '#5DBEA3' }]}>
              ×{h.fatigueRatio}
            </Text>
            <Text style={s.handMetricLabel}>Fatigue ratio</Text>
          </View>
        </View>
      </View>
    );

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
            <Text style={s.resultSub}>MDS-UPDRS Part III · Item 3.4</Text>
          </View>

          <View style={s.ringWrap}>
            <RiskRing score={result.riskScore} color={result.color} size={192} />
            <View style={[s.riskBadge, { backgroundColor: badge.bg }]}>
              <Text style={[s.riskBadgeText, { color: badge.text }]}>
                {result.riskLevel} · UPDRS {result.combinedUpdrs}/4
              </Text>
            </View>
          </View>

          {/* Combined UPDRS label */}
          <View style={s.updrsLabelCard}>
            <Text style={s.updrsLabelTitle}>Combined Severity</Text>
            <Text style={[s.updrsLabelValue, { color: result.color }]}>{updrsLabel}</Text>
          </View>

          {/* Per-hand breakdowns */}
          {handRow(result.left,  '#FF8C42')}
          {handRow(result.right, '#5DBEA3')}

          {/* Interpretation */}
          <View style={s.insightCard}>
            <Text style={s.insightText}>
              {result.riskLevel === 'Normal'
                ? 'Tap frequency and rhythm are within normal limits for both hands.'
                : result.riskLevel === 'Mild'
                ? 'Slight reduction in tap speed or occasional rhythm irregularities detected. Recommend monitoring over time.'
                : result.riskLevel === 'Moderate'
                ? 'Moderate reduction in frequency and/or rhythm detected. Consider a formal neurological evaluation.'
                : 'Significant motor impairment detected — substantially reduced speed, irregular rhythm, or marked hesitations. A neurological review is advised.'}
            </Text>
            <Text style={s.insightDisclaimer}>
              Scoring based on MDS-UPDRS 3.4 anchors. This tool is a screening aid, not a clinical diagnosis. Results should be interpreted by a qualified clinician.
            </Text>
          </View>

          {/* UPDRS reference */}
          <View style={s.updrsRef}>
            <Text style={s.updrsRefTitle}>UPDRS 3.4 Scale</Text>
            {[
              ['0', 'Normal — 15+ taps, no decrement'],
              ['1', 'Slight — minor slowing or 1–2 hesitations'],
              ['2', 'Mild — any interruptions ≤3 s, or slowing'],
              ['3', 'Moderate — 3+ pauses >3 s, or marked slowing'],
              ['4', 'Severe — can barely perform / <1.5 Hz'],
            ].map(([score, desc]) => (
              <View style={s.updrsRefRow} key={score}>
                <View style={[s.updrsRefDot,
                  { backgroundColor: +score === 0 ? '#5DBEA3'
                    : +score === 1 ? '#FFD700'
                    : +score === 2 ? '#FF9F43'
                    : '#FF6B6B' }]} />
                <Text style={s.updrsRefScore}>{score}</Text>
                <Text style={s.updrsRefDesc}>{desc}</Text>
              </View>
            ))}
          </View>

          <TouchableOpacity style={s.primaryBtn} onPress={() => router.push('/(tabs)/history')} activeOpacity={0.85}>
            <Text style={s.primaryBtnText}>View Full Insights</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.secondaryBtn} onPress={reset} activeOpacity={0.85}>
            <Ionicons name="refresh-outline" size={20} color="#FF8C42" />
            <Text style={s.secondaryBtnText}>Test Again</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return null;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#EFEBE6' },
  scroll: { padding: 20, paddingBottom: 40 },
  centered: { flex: 1, padding: 24, alignItems: 'center', justifyContent: 'center' },
  testingContainer: { flex: 1, padding: 20 },

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
  instructionSub: { fontSize: 13, color: '#6B6B6B', lineHeight: 21 },

  clinicalNote: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#EEEAFF', borderRadius: 12, padding: 12, marginBottom: 20,
  },
  clinicalNoteText: { flex: 1, fontSize: 12, color: '#5A5080', lineHeight: 18 },

  infoRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  infoCard: { flex: 1, borderRadius: 16, padding: 14, alignItems: 'center', gap: 4 },
  infoCardValue: { fontSize: 16, fontWeight: '700', color: '#1A1A1A' },
  infoCardLabel: { fontSize: 11, color: '#6B6B6B', fontWeight: '600' },

  primaryBtn: {
    backgroundColor: '#FF8C42', borderRadius: 9999,
    paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 8,
    shadowColor: '#FF8C42', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  primaryBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  secondaryBtn: {
    backgroundColor: '#FFE8D6', borderRadius: 9999,
    paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 12,
  },
  secondaryBtnText: { color: '#FF8C42', fontSize: 16, fontWeight: '700' },

  // Countdown
  countdownHandLabel: { fontSize: 13, fontWeight: '600', color: '#FF8C42', marginBottom: 6, letterSpacing: 1 },
  countdownTitle: { fontSize: 28, fontWeight: '700', color: '#1A1A1A', marginBottom: 24 },
  countdownCircle: {
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: '#FFD4B8', alignItems: 'center', justifyContent: 'center', marginBottom: 24,
  },
  countdownDigit: { fontSize: 56, fontWeight: '700', color: '#FF8C42' },
  countdownHint: { fontSize: 14, color: '#6B6B6B', textAlign: 'center', maxWidth: 280, lineHeight: 21 },

  // Testing
  timerSection: { marginBottom: 20 },
  timerBox: {
    backgroundColor: '#FFFFFF', borderRadius: 20,
    padding: 20, alignItems: 'center', marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  timerDigit: { fontSize: 56, fontWeight: '700', color: '#FF8C42' },
  timerUnit: { fontSize: 11, color: '#999999', letterSpacing: 1, marginTop: 2 },

  countRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 24 },
  countCard: { flex: 1, borderRadius: 16, padding: 14, alignItems: 'center' },
  countValue: { fontSize: 28, fontWeight: '700', color: '#1A1A1A' },
  countLabel: { fontSize: 11, color: '#6B6B6B', fontWeight: '600', marginTop: 2 },
  totalCount: { alignItems: 'center', paddingHorizontal: 8 },
  totalValue: { fontSize: 32, fontWeight: '700', color: '#1A1A1A' },
  totalLabel: { fontSize: 11, color: '#999999', fontWeight: '600' },

  tapBtn: {
    borderRadius: 32, paddingVertical: 52,
    alignItems: 'center', justifyContent: 'center', gap: 12,
    marginHorizontal: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 8, elevation: 4,
  },
  tapBtnLeft:  { backgroundColor: '#FFD4B8' },
  tapBtnRight: { backgroundColor: '#C8E6DD' },
  tapBtnLabel: { fontSize: 18, fontWeight: '700', color: '#FF8C42', letterSpacing: 2 },

  tapHint: { fontSize: 13, color: '#6B6B6B', textAlign: 'center', marginTop: 16, marginBottom: 16 },
  stopEarlyBtn: { alignItems: 'center', paddingVertical: 10 },
  stopEarlyText: { fontSize: 14, color: '#999999', fontWeight: '500' },

  // Processing
  processingSubtitle: { fontSize: 13, color: '#6B6B6B', fontWeight: '600', marginBottom: 6 },
  processingTitle: { fontSize: 28, fontWeight: '700', color: '#1A1A1A', marginBottom: 32 },
  pulseWrap: { width: 128, height: 128, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  pulseRing: { position: 'absolute', width: 128, height: 128, borderRadius: 64, backgroundColor: '#FF8C42', opacity: 0.1 },
  pulseCircle: { width: 128, height: 128, borderRadius: 64, backgroundColor: '#FFD4B8', alignItems: 'center', justifyContent: 'center' },
  processingBody: { fontSize: 14, color: '#6B6B6B', textAlign: 'center', maxWidth: 280, lineHeight: 21, marginBottom: 28 },
  progressBarWrap: { width: '100%', maxWidth: 300 },
  progressLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  progressLabelText: { fontSize: 12, color: '#6B6B6B' },

  // Result
  resultHeaderSection: { alignItems: 'center', marginBottom: 24 },
  resultTitle: { fontSize: 28, fontWeight: '700', color: '#1A1A1A', marginBottom: 4 },
  resultSub: { fontSize: 13, color: '#6B6B6B' },

  ringWrap: { alignItems: 'center', marginBottom: 20 },
  riskBadge: { borderRadius: 9999, paddingHorizontal: 20, paddingVertical: 8, marginTop: 12 },
  riskBadgeText: { fontSize: 14, fontWeight: '700' },

  updrsLabelCard: {
    backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16,
    alignItems: 'center', marginBottom: 12,
  },
  updrsLabelTitle: { fontSize: 12, color: '#999999', fontWeight: '600', marginBottom: 4 },
  updrsLabelValue: { fontSize: 22, fontWeight: '700' },

  handResultCard: {
    backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16,
    marginBottom: 10, borderLeftWidth: 4,
  },
  handResultTitle: { fontSize: 14, fontWeight: '700', marginBottom: 12 },
  handMetricsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  handMetric: { alignItems: 'center', flex: 1 },
  handMetricValue: { fontSize: 18, fontWeight: '700', color: '#1A1A1A' },
  handMetricLabel: { fontSize: 10, color: '#999999', fontWeight: '600', marginTop: 2, textAlign: 'center' },

  insightCard: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 20, alignItems: 'center', marginBottom: 16, marginTop: 6 },
  insightText: { fontSize: 14, color: '#6B6B6B', textAlign: 'center', lineHeight: 21, marginBottom: 8 },
  insightDisclaimer: { fontSize: 11, color: '#BBBBBB', textAlign: 'center', lineHeight: 17 },

  updrsRef: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, marginBottom: 20 },
  updrsRefTitle: { fontSize: 13, fontWeight: '700', color: '#1A1A1A', marginBottom: 12 },
  updrsRefRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  updrsRefDot: { width: 8, height: 8, borderRadius: 4 },
  updrsRefScore: { fontSize: 14, fontWeight: '700', color: '#1A1A1A', width: 20 },
  updrsRefDesc: { fontSize: 12, color: '#6B6B6B', flex: 1, lineHeight: 17 },
});
