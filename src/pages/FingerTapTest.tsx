import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Info, Activity, TrendingUp, Share2, AlertTriangle, TrendingDown } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { addTestRecord, getTestsByType } from "@/utils/testHistory";
import { scoreFingerTap } from "@/utils/clinicalMetrics";
import BottomNav from "@/components/BottomNav";

// Extend window for MediaPipe globals
declare global {
  interface Window {
    Hands: any;
    Camera: any;
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase = "recording" | "processing" | "result";
type FingerState = "OPEN" | "CLOSED";
type HandLabel = "Left" | "Right";

export interface TapRecord { time: number; amplitude: number; }
export interface DistSample { t: number; d: number; }
export interface AbsenceInterval { start: number; end: number; }

export interface HandState {
  label: HandLabel;
  taps: TapRecord[];
  itiList: number[];
  distBuffer: DistSample[];
  maBuffer: number[];
  prevFingerState: FingerState;
  lastTapTime: number;
  tapMaxDist: number;
  pinchThreshold: number;
  calibrationSamples: number[];
  calibrationDone: boolean;
  lastSeenTime: number;
  absenceIntervals: AbsenceInterval[];
  currentAbsenceStart: number | null;
  trackingConfidences: number[];
}

export interface HandMetrics {
  tap_count: number;
  taps_per_sec: number;
  mean_iti_ms: number;
  iti_std_ms: number;
  interval_variability: number;
  avg_amplitude: number;
  amplitude_decay: number;
  tremor_score: number;
  fatigue_drop: number;
  consistency_score: number;
  session_quality: number;
}

interface SessionResult {
  leftMetrics: HandMetrics;
  rightMetrics: HandMetrics;
  riskScore: number;
  riskLevel: "Low" | "Medium" | "High";
  deltas: Record<string, number> | null;
  hasPriorSession: boolean;
}

interface LiveHandMetrics {
  tapCount: number;
  tapsPerSec: number;
  meanIti: number;
  cv: number;
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function euclidean(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

export function computeNormalizedPinch(lm: { x: number; y: number }[]): number {
  const denom = euclidean(lm[0], lm[9]);
  if (denom < 0.001) return 0;
  return euclidean(lm[4], lm[8]) / denom;
}

export function updateMovingAverage(buf: number[], val: number, windowSize = 5): number[] {
  const next = [...buf, val];
  return next.length > windowSize ? next.slice(next.length - windowSize) : next;
}

export function getMA(buf: number[]): number {
  if (!buf.length) return 0;
  return buf.reduce((s, v) => s + v, 0) / buf.length;
}

function safeMean(arr: number[]): number {
  if (!arr.length) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function safeStddev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = safeMean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function amplitudeDecay(amps: number[]): number {
  if (amps.length < 3) return 0;
  const xs = amps.map((_, i) => i);
  const mx = safeMean(xs), my = safeMean(amps);
  const num = xs.reduce((s, x, i) => s + (x - mx) * (amps[i] - my), 0);
  const den = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  if (!den) return 0;
  return Math.max(0, -(num / den));
}

function computeTremorRolling(distBuffer: DistSample[], windowMs = 4000): number {
  if (distBuffer.length < 4) return 0;
  const windowScores: number[] = [];
  let wStart = 0;
  while (wStart < distBuffer.length) {
    const t0 = distBuffer[wStart].t;
    const wEnd = distBuffer.findIndex((s, i) => i >= wStart && s.t >= t0 + windowMs);
    const end = wEnd === -1 ? distBuffer.length : wEnd;
    const slice = distBuffer.slice(wStart, end);
    if (slice.length >= 4) {
      const near = slice.filter(s => s.d < 0.25);
      if (near.length >= 2) {
        const deltas: number[] = [];
        for (let i = 1; i < near.length; i++) {
          const dt = near[i].t - near[i - 1].t;
          if (dt > 0) deltas.push(Math.abs(near[i].d - near[i - 1].d) / dt * 100);
        }
        if (deltas.length) windowScores.push(safeStddev(deltas));
      }
    }
    if (end >= distBuffer.length) break;
    wStart = end;
  }
  if (!windowScores.length) return 0;
  return safeMean(windowScores);
}

export function computeHandMetrics(
  state: HandState,
  sessionStartTime: number,
  sessionEndTime: number
): HandMetrics {
  const totalElapsed = Math.max((sessionEndTime - sessionStartTime) / 1000, 0.1);

  // Visible elapsed (exclude absence gaps > 500ms)
  const absenceDuration = state.absenceIntervals
    .filter(a => (a.end - a.start) > 500)
    .reduce((s, a) => s + (a.end - a.start), 0) / 1000;
  const visibleElapsed = Math.max(totalElapsed - absenceDuration, 0.1);

  const tap_count = state.taps.length;
  const taps_per_sec = tap_count / visibleElapsed;
  const mean_iti_ms = safeMean(state.itiList);
  const iti_std_ms = safeStddev(state.itiList);
  const interval_variability = mean_iti_ms > 0 ? iti_std_ms / mean_iti_ms : 0;
  const amps = state.taps.map(t => t.amplitude);
  const avg_amplitude = safeMean(amps);
  const amplitude_decay_val = amplitudeDecay(amps);
  const tremor_score = computeTremorRolling(state.distBuffer);

  // Fatigue drop
  let fatigue_drop = 0;
  if (totalElapsed >= 12 && tap_count >= 4) {
    const seg = Math.min(5, totalElapsed / 3);
    const t0 = sessionStartTime;
    const early = state.taps.filter(t => (t.time - t0) / 1000 < seg).length;
    const late = state.taps.filter(t => (t.time - t0) / 1000 > totalElapsed - seg).length;
    const earlyRate = early / seg;
    const lateRate = late / seg;
    if (earlyRate > 0) fatigue_drop = Math.max(0, (earlyRate - lateRate) / earlyRate);
  }

  const consistency_score = clamp(1 - interval_variability, 0, 1);

  // Session quality
  const visibilityPct = clamp(visibleElapsed / totalElapsed, 0, 1);
  const avgConfidence = state.trackingConfidences.length ? safeMean(state.trackingConfidences) : 1.0;
  const absencePenalty = clamp(absenceDuration / totalElapsed, 0, 1);
  const session_quality = clamp(
    Math.round(visibilityPct * 40 + avgConfidence * 40 - absencePenalty * 20),
    0, 100
  );

  return {
    tap_count,
    taps_per_sec: isFinite(taps_per_sec) ? taps_per_sec : 0,
    mean_iti_ms: isFinite(mean_iti_ms) ? mean_iti_ms : 0,
    iti_std_ms: isFinite(iti_std_ms) ? iti_std_ms : 0,
    interval_variability: isFinite(interval_variability) ? interval_variability : 0,
    avg_amplitude: isFinite(avg_amplitude) ? avg_amplitude : 0,
    amplitude_decay: isFinite(amplitude_decay_val) ? amplitude_decay_val : 0,
    tremor_score: isFinite(tremor_score) ? tremor_score : 0,
    fatigue_drop: isFinite(fatigue_drop) ? fatigue_drop : 0,
    consistency_score: isFinite(consistency_score) ? consistency_score : 0,
    session_quality: isFinite(session_quality) ? session_quality : 0,
  };
}

export function computeRiskScore(left: HandMetrics, right: HandMetrics): number {
  let score = 0;
  const avg_tps = (left.taps_per_sec + right.taps_per_sec) / 2;
  const avg_cv = (left.interval_variability + right.interval_variability) / 2;
  const avg_fd = (left.fatigue_drop + right.fatigue_drop) / 2;
  const avg_tr = (left.tremor_score + right.tremor_score) / 2;

  if (avg_tps < 2.5) score += 35; else if (avg_tps < 3.5) score += 15;
  if (avg_cv > 0.5) score += 25; else if (avg_cv > 0.3) score += 10;
  if (avg_fd > 0.35) score += 20; else if (avg_fd > 0.15) score += 8;
  if (avg_tr > 1.5) score += 20; else if (avg_tr > 0.8) score += 8;

  return clamp(Math.round(score), 0, 100);
}

export function mapRiskLevel(score: number): "Low" | "Medium" | "High" {
  if (score <= 33) return "Low";
  if (score <= 66) return "Medium";
  return "High";
}

export function computeHistoricalDeltas(
  current: HandMetrics,
  priorMeta: NonNullable<ReturnType<typeof getTestsByType>[number]["metadata"]>
): Record<string, number> {
  const priorTps = ((priorMeta.tapsPerSecLeft ?? 0) + (priorMeta.tapsPerSecRight ?? 0)) / 2;
  const priorCv = ((priorMeta.cvLeft ?? 0) + (priorMeta.cvRight ?? 0)) / 2;
  const priorFd = ((priorMeta.fatigueDropLeft ?? 0) + (priorMeta.fatigueDropRight ?? 0)) / 2;
  const priorTr = ((priorMeta.tremorScoreLeft ?? 0) + (priorMeta.tremorScoreRight ?? 0)) / 2;

  const pct = (cur: number, prior: number) => prior !== 0 ? ((cur - prior) / prior) * 100 : 0;

  return {
    taps_per_sec: pct(current.taps_per_sec, priorTps),
    interval_variability: pct(current.interval_variability, priorCv),
    tremor_score: pct(current.tremor_score, priorTr),
    fatigue_drop: pct(current.fatigue_drop, priorFd),
  };
}

// ─── Hand state factory ───────────────────────────────────────────────────────

function makeInitialHandState(label: HandLabel): HandState {
  return {
    label,
    taps: [],
    itiList: [],
    distBuffer: [],
    maBuffer: [],
    prevFingerState: "OPEN",
    lastTapTime: 0,
    tapMaxDist: 0,
    pinchThreshold: 0.12,
    calibrationSamples: [],
    calibrationDone: false,
    lastSeenTime: 0,
    absenceIntervals: [],
    currentAbsenceStart: null,
    trackingConfidences: [],
  };
}

// ─── Hand skeleton connections ────────────────────────────────────────────────

const HAND_CONNECTIONS: [number, number][] = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [0,9],[9,10],[10,11],[11,12],
  [0,13],[13,14],[14,15],[15,16],
  [0,17],[17,18],[18,19],[19,20],
  [5,9],[9,13],[13,17],
];

const DEBOUNCE_MS = 40;
const MA_WINDOW = 3;
const TEST_DURATION_MS = 30000;
const SIGNAL_BUFFER = 300; // max samples kept for the live graph

// ─── Component ────────────────────────────────────────────────────────────────

const FingerTapTest = () => {
  const navigate = useNavigate();

  // Phase & UI state
  const [phase, setPhase] = useState<Phase>("recording");
  const [recording, setRecording] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<SessionResult | null>(null);
  const [liveLeft, setLiveLeft] = useState<LiveHandMetrics>({ tapCount: 0, tapsPerSec: 0, meanIti: 0, cv: 0 });
  const [liveRight, setLiveRight] = useState<LiveHandMetrics>({ tapCount: 0, tapsPerSec: 0, meanIti: 0, cv: 0 });
  const [handsVisible, setHandsVisible] = useState(false);
  const [calibrating, setCalibrating] = useState(false);
  // Live distance signal for graph — stores last SIGNAL_BUFFER smoothed distances per hand
  const distSignalRef = useRef<{ left: number[]; right: number[] }>({ left: [], right: [] });
  const graphCanvasRef = useRef<HTMLCanvasElement>(null);

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mpCameraRef = useRef<any>(null);
  const handsRef = useRef<any>(null);
  const recordingRef = useRef(false);
  const sessionStartRef = useRef(0);
  const frameCountRef = useRef(0);
  const leftStateRef = useRef<HandState>(makeInitialHandState("Left"));
  const rightStateRef = useRef<HandState>(makeInitialHandState("Right"));
  const initialHandPositionsRef = useRef<{ Left: number; Right: number } | null>(null);
  const phaseRef = useRef<Phase>("recording");

  // Keep phaseRef in sync
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  // ── MediaPipe init (mirrors fingertap.html exactly) ──────────────────────────
  useEffect(() => {
    let isMounted = true;

    // Load scripts sequentially: camera_utils → drawing_utils → hands
    const loadScript = (src: string): Promise<void> =>
      new Promise((resolve, reject) => {
        // Reuse if already loaded
        if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
        const s = document.createElement("script");
        s.src = src;
        s.crossOrigin = "anonymous";
        s.onload = () => resolve();
        s.onerror = () => reject(new Error(`Failed to load ${src}`));
        document.head.appendChild(s);
      });

    const init = async () => {
      try {
        await loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js");
        await loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js");
        await loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js");

        if (!isMounted) return;

        const hands = new window.Hands({
          locateFile: (f: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`,
        });
        hands.setOptions({
          maxNumHands: 2,
          modelComplexity: 1,
          minDetectionConfidence: 0.7,
          minTrackingConfidence: 0.6,
        });
        hands.onResults(onHandResults);
        handsRef.current = hands;

        if (!videoRef.current) return;

        // Use MediaPipe Camera class — same as fingertap.html
        const mpCamera = new window.Camera(videoRef.current, {
          onFrame: async () => {
            if (handsRef.current && videoRef.current) {
              await handsRef.current.send({ image: videoRef.current });
            }
          },
          width: 640,
          height: 480,
        });
        mpCameraRef.current = mpCamera;
        await mpCamera.start();

        if (isMounted) setCameraReady(true);
      } catch (err: any) {
        if (isMounted) setCameraError(err?.message ?? "Failed to initialize camera or hand tracking.");
      }
    };

    init();

    return () => {
      isMounted = false;
      if (mpCameraRef.current) {
        try { mpCameraRef.current.stop(); } catch { /* ignore */ }
      }
    };
  }, []);

  // ── Core frame handler ───────────────────────────────────────────────────────
  const onHandResults = useCallback((results: any) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const W = canvas.width, H = canvas.height;
    const landmarks: any[][] = results.multiHandLandmarks ?? [];
    const handedness: any[] = results.multiHandedness ?? [];

    setHandsVisible(landmarks.length > 0);

    const now = performance.now();
    const isRec = recordingRef.current;
    const elapsed = isRec ? now - sessionStartRef.current : 0;

    // ── Stable handedness assignment ──────────────────────────────────────────
    const assignedLabels: HandLabel[] = [];
    if (landmarks.length > 0) {
      if (isRec && initialHandPositionsRef.current === null && landmarks.length === 2) {
        const wx0 = landmarks[0][0].x;
        const wx1 = landmarks[1][0].x;
        if (wx0 < wx1) {
          initialHandPositionsRef.current = { Left: wx0, Right: wx1 };
        } else {
          initialHandPositionsRef.current = { Left: wx1, Right: wx0 };
        }
      }

      for (let i = 0; i < landmarks.length; i++) {
        const lm = landmarks[i];
        if (initialHandPositionsRef.current) {
          const distToLeft = Math.abs(lm[0].x - initialHandPositionsRef.current.Left);
          const distToRight = Math.abs(lm[0].x - initialHandPositionsRef.current.Right);
          assignedLabels.push(distToLeft <= distToRight ? "Left" : "Right");
        } else {
          // Fall back to MediaPipe label (note: MediaPipe labels are from camera perspective, mirrored)
          const mpLabel = handedness[i]?.label ?? "Right";
          assignedLabels.push(mpLabel === "Left" ? "Right" : "Left");
        }
      }
    }

    // ── Draw overlays ─────────────────────────────────────────────────────────
    for (let i = 0; i < landmarks.length; i++) {
      const lm = landmarks[i];
      const smoothDist = computeNormalizedPinch(lm);
      const isClosed = smoothDist < (isRec
        ? (assignedLabels[i] === "Left" ? leftStateRef.current.pinchThreshold : rightStateRef.current.pinchThreshold)
        : 0.09);

      // Skeleton
      ctx.strokeStyle = "rgba(123,104,238,0.4)";
      ctx.lineWidth = 1.5;
      HAND_CONNECTIONS.forEach(([a, b]) => {
        ctx.beginPath();
        ctx.moveTo(lm[a].x * W, lm[a].y * H);
        ctx.lineTo(lm[b].x * W, lm[b].y * H);
        ctx.stroke();
      });

      // Landmark dots
      lm.forEach((pt: any, idx: number) => {
        ctx.beginPath();
        ctx.arc(pt.x * W, pt.y * H, idx === 4 || idx === 8 ? 5 : 3, 0, Math.PI * 2);
        ctx.fillStyle = idx === 4 || idx === 8
          ? (isClosed ? "rgba(255,90,90,0.9)" : "rgba(123,104,238,0.9)")
          : "rgba(123,104,238,0.55)";
        ctx.fill();
      });

      // Pinch line
      const p4 = lm[4], p8 = lm[8];
      ctx.beginPath();
      ctx.moveTo(p4.x * W, p4.y * H);
      ctx.lineTo(p8.x * W, p8.y * H);
      ctx.strokeStyle = isClosed ? "rgba(255,90,90,0.85)" : "rgba(255,180,64,0.7)";
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    if (!isRec) return;

    // ── Per-hand tap detection ────────────────────────────────────────────────
    const processHand = (lm: any[], label: HandLabel, confidence: number) => {
      const stateRef = label === "Left" ? leftStateRef : rightStateRef;
      const state = stateRef.current;

      state.lastSeenTime = now;
      if (state.currentAbsenceStart !== null) {
        state.absenceIntervals.push({ start: state.currentAbsenceStart, end: now });
        state.currentAbsenceStart = null;
      }
      state.trackingConfidences.push(confidence);

      const normDist = computeNormalizedPinch(lm);
      state.maBuffer = updateMovingAverage(state.maBuffer, normDist, MA_WINDOW);
      const smoothDist = getMA(state.maBuffer);
      state.distBuffer.push({ t: now, d: smoothDist });

      // Update live signal buffer for graph
      const sig = distSignalRef.current;
      const arr = label === "Left" ? sig.left : sig.right;
      arr.push(smoothDist);
      if (arr.length > SIGNAL_BUFFER) arr.shift();

      // Calibration window (first 2s)
      if (!state.calibrationDone) {
        if (elapsed < 2000) {
          state.calibrationSamples.push(smoothDist);
          setCalibrating(true);
          return;
        } else {
          const maxObs = state.calibrationSamples.length >= 10
            ? Math.max(...state.calibrationSamples)
            : null;
          state.pinchThreshold = maxObs !== null
            ? clamp(maxObs * 0.35, 0.05, 0.4)
            : 0.12;
          state.calibrationDone = true;
          setCalibrating(false);
        }
      }

      // Tap state machine
      const isClosed = smoothDist < state.pinchThreshold;
      const fingerState: FingerState = isClosed ? "CLOSED" : "OPEN";

      if (!isClosed) {
        state.tapMaxDist = Math.max(state.tapMaxDist, smoothDist);
      }

      if (state.prevFingerState === "CLOSED" && fingerState === "OPEN") {
        const dt = now - state.lastTapTime;
        if (dt > DEBOUNCE_MS) {
          const amp = state.tapMaxDist;
          state.taps.push({ time: now, amplitude: amp });
          if (state.taps.length > 1) state.itiList.push(dt);
          state.lastTapTime = now;
          state.tapMaxDist = 0;
        }
      }

      state.prevFingerState = fingerState;
    };

    for (let i = 0; i < landmarks.length; i++) {
      processHand(landmarks[i], assignedLabels[i], handedness[i]?.score ?? 1.0);
    }

    // ── Absence tracking for undetected hands ─────────────────────────────────
    const detectedLabels = new Set(assignedLabels);
    (["Left", "Right"] as HandLabel[]).forEach(label => {
      const state = label === "Left" ? leftStateRef.current : rightStateRef.current;
      if (!detectedLabels.has(label) && state.lastSeenTime > 0) {
        if (now - state.lastSeenTime > 500 && state.currentAbsenceStart === null) {
          state.currentAbsenceStart = state.lastSeenTime + 500;
        }
      }
    });

    // ── Auto-stop ─────────────────────────────────────────────────────────────
    if (elapsed >= TEST_DURATION_MS) {
      stopRecording();
      return;
    }

    // ── Throttled live UI update (every 5 frames) ─────────────────────────────
    frameCountRef.current += 1;
    if (frameCountRef.current % 5 === 0) {
      const elapsedSec = Math.max(elapsed / 1000, 0.1);
      const toLive = (state: HandState): LiveHandMetrics => ({
        tapCount: state.taps.length,
        tapsPerSec: parseFloat((state.taps.length / elapsedSec).toFixed(1)),
        meanIti: parseFloat(safeMean(state.itiList).toFixed(0)),
        cv: parseFloat((state.itiList.length >= 2
          ? safeStddev(state.itiList) / (safeMean(state.itiList) || 1)
          : 0).toFixed(2)),
      });
      setLiveLeft(toLive(leftStateRef.current));
      setLiveRight(toLive(rightStateRef.current));

      // Draw live distance graph
      drawDistGraph();
    }
  }, []);

  // ── Live distance graph ───────────────────────────────────────────────────────
  const drawDistGraph = () => {
    const gc = graphCanvasRef.current;
    if (!gc) return;
    const gctx = gc.getContext("2d");
    if (!gctx) return;
    const W = gc.width, H = gc.height;
    gctx.clearRect(0, 0, W, H);

    // Background
    gctx.fillStyle = "#F5F3FF";
    gctx.fillRect(0, 0, W, H);

    // Grid lines
    gctx.strokeStyle = "rgba(123,104,238,0.1)";
    gctx.lineWidth = 1;
    [0.25, 0.5, 0.75].forEach(frac => {
      const y = H - frac * H;
      gctx.beginPath(); gctx.moveTo(0, y); gctx.lineTo(W, y); gctx.stroke();
    });

    const drawLine = (data: number[], color: string) => {
      if (data.length < 2) return;
      const maxVal = 0.6;
      gctx.beginPath();
      gctx.strokeStyle = color;
      gctx.lineWidth = 1.5;
      data.forEach((v, i) => {
        const x = (i / (data.length - 1)) * W;
        const y = H - clamp(v / maxVal, 0, 1) * H;
        i === 0 ? gctx.moveTo(x, y) : gctx.lineTo(x, y);
      });
      gctx.stroke();

      // Fill under line
      gctx.lineTo(W, H); gctx.lineTo(0, H); gctx.closePath();
      gctx.fillStyle = color.replace(")", ", 0.08)").replace("rgb", "rgba");
      gctx.fill();
    };

    const sig = distSignalRef.current;
    drawLine(sig.left, "rgb(123,104,238)");   // purple — left
    drawLine(sig.right, "rgb(93,190,163)");   // teal — right

    // Threshold line
    const leftThresh = leftStateRef.current.pinchThreshold;
    const threshY = H - clamp(leftThresh / 0.6, 0, 1) * H;
    gctx.setLineDash([4, 3]);
    gctx.strokeStyle = "rgba(255,90,90,0.5)";
    gctx.lineWidth = 1;
    gctx.beginPath(); gctx.moveTo(0, threshY); gctx.lineTo(W, threshY); gctx.stroke();
    gctx.setLineDash([]);
  };

  // ── Start / Stop ─────────────────────────────────────────────────────────────
  const startRecording = () => {
    distSignalRef.current = { left: [], right: [] };
    leftStateRef.current = makeInitialHandState("Left");
    rightStateRef.current = makeInitialHandState("Right");
    initialHandPositionsRef.current = null;
    frameCountRef.current = 0;
    sessionStartRef.current = performance.now();
    recordingRef.current = true;
    setRecording(true);
    setCalibrating(true);
    setLiveLeft({ tapCount: 0, tapsPerSec: 0, meanIti: 0, cv: 0 });
    setLiveRight({ tapCount: 0, tapsPerSec: 0, meanIti: 0, cv: 0 });
  };

  const stopRecording = () => {
    if (!recordingRef.current) return;
    recordingRef.current = false;
    setRecording(false);
    setCalibrating(false);

    const endTime = performance.now();
    const startTime = sessionStartRef.current;

    // Close any open absence intervals
    (["Left", "Right"] as HandLabel[]).forEach(label => {
      const state = label === "Left" ? leftStateRef.current : rightStateRef.current;
      if (state.currentAbsenceStart !== null) {
        state.absenceIntervals.push({ start: state.currentAbsenceStart, end: endTime });
        state.currentAbsenceStart = null;
      }
    });

    const leftMetrics = computeHandMetrics(leftStateRef.current, startTime, endTime);
    const rightMetrics = computeHandMetrics(rightStateRef.current, startTime, endTime);

    // Research-based composite risk (MDS-UPDRS 3.4 markers: speed, amplitude
    // decrement / sequence effect, rhythm variability, inter-hand asymmetry,
    // fatigue, tremor). See src/utils/clinicalMetrics.ts.
    const clinical = scoreFingerTap({
      tapsPerSecLeft: leftMetrics.taps_per_sec,
      tapsPerSecRight: rightMetrics.taps_per_sec,
      cvLeft: leftMetrics.interval_variability,
      cvRight: rightMetrics.interval_variability,
      amplitudesLeft: leftStateRef.current.taps.map(t => t.amplitude),
      amplitudesRight: rightStateRef.current.taps.map(t => t.amplitude),
      fatigueLeft: leftMetrics.fatigue_drop,
      fatigueRight: rightMetrics.fatigue_drop,
      tremorLeft: leftMetrics.tremor_score,
      tremorRight: rightMetrics.tremor_score,
    });
    const riskScore = clinical.score;
    const riskLevel = clinical.level;

    // Historical comparison
    let deltas: Record<string, number> | null = null;
    let hasPriorSession = false;
    try {
      const prior = getTestsByType("FINGER_TAP");
      if (prior.length > 0 && prior[0].metadata) {
        deltas = computeHistoricalDeltas(leftMetrics, prior[0].metadata);
        hasPriorSession = true;
      }
    } catch (e) { console.error("History lookup error:", e); }

    // Persist
    try {
      addTestRecord({
        type: "FINGER_TAP",
        name: "Finger Tap Assessment",
        riskScore: riskScore / 100,
        riskLevel,
        metadata: {
          tapCountLeft: leftMetrics.tap_count,
          tapCountRight: rightMetrics.tap_count,
          tapsPerSecLeft: leftMetrics.taps_per_sec,
          tapsPerSecRight: rightMetrics.taps_per_sec,
          cvLeft: leftMetrics.interval_variability,
          cvRight: rightMetrics.interval_variability,
          fatigueDropLeft: leftMetrics.fatigue_drop,
          fatigueDropRight: rightMetrics.fatigue_drop,
          tremorScoreLeft: leftMetrics.tremor_score,
          tremorScoreRight: rightMetrics.tremor_score,
        },
      });
    } catch (e) { console.error("addTestRecord error:", e); }

    setResult({ leftMetrics, rightMetrics, riskScore, riskLevel, deltas, hasPriorSession });
    setPhase("processing");
  };

  // ── Processing progress ───────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "processing") return;
    setProgress(0);
    const interval = setInterval(() => {
      setProgress(p => {
        if (p >= 100) { clearInterval(interval); setTimeout(() => setPhase("result"), 400); return 100; }
        return p + 3;
      });
    }, 90);
    return () => clearInterval(interval);
  }, [phase]);

  // ── Progress bar value during recording ───────────────────────────────────────
  const [recProgress, setRecProgress] = useState(0);
  useEffect(() => {
    if (!recording) { setRecProgress(0); return; }
    const interval = setInterval(() => {
      const elapsed = performance.now() - sessionStartRef.current;
      setRecProgress(Math.min(100, (elapsed / TEST_DURATION_MS) * 100));
    }, 200);
    return () => clearInterval(interval);
  }, [recording]);

  // ── Risk color helpers ────────────────────────────────────────────────────────
  const riskColor = (level: string) =>
    level === "Low" ? "#5DBEA3" : level === "Medium" ? "#FF9F43" : "#FF5A5A";
  const riskBg = (level: string) =>
    level === "Low" ? "#D4F1E8" : level === "Medium" ? "#FFF3E0" : "#FFE8E8";

  // ── Camera error screen ───────────────────────────────────────────────────────
  if (cameraError) {
    return (
      <div className="min-h-screen bg-[#EFEBE6] flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center">
          <div className="w-20 h-20 bg-red-100 rounded-3xl mx-auto mb-6 flex items-center justify-center">
            <Activity className="w-10 h-10 text-red-500" />
          </div>
          <h2 className="text-2xl font-bold text-[#1A1A1A] mb-4">Camera Access Required</h2>
          <p className="text-[#6B6B6B] mb-6">{cameraError}</p>
          <button
            onClick={() => window.location.reload()}
            className="bg-[#7B68EE] hover:bg-[#6A58DD] text-white font-semibold py-3 px-6 rounded-2xl transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // ── Processing screen ─────────────────────────────────────────────────────────
  if (phase === "processing") {
    return (
      <div className="min-h-screen bg-[#EFEBE6] flex flex-col items-center justify-center px-6">
        <p className="text-[#6B6B6B] font-semibold text-sm mb-2">Finger Tap Processing</p>
        <h2 className="text-3xl font-bold text-[#1A1A1A] mb-12">Just a moment…</h2>
        <div className="relative mb-12">
          <div className="w-32 h-32 rounded-full bg-[#7B68EE] opacity-10 animate-pulse absolute inset-0" />
          <div className="w-32 h-32 rounded-full bg-[#DDD8F5] flex items-center justify-center relative">
            <Activity size={32} className="text-[#7B68EE]" />
          </div>
        </div>
        <h3 className="text-lg font-bold text-[#1A1A1A] mb-1">Analyzing finger tap patterns…</h3>
        <p className="text-[#6B6B6B] text-sm text-center mb-6 max-w-xs">
          Computing rhythm, coordination, and motor control metrics.
        </p>
        <div className="w-full max-w-xs mb-2">
          <Progress value={progress} className="h-2" />
        </div>
        <div className="w-full max-w-xs flex justify-between text-xs text-[#6B6B6B]">
          <span>Processing</span>
          <span>{Math.round(progress)}%</span>
        </div>
      </div>
    );
  }

  // ── Result screen ─────────────────────────────────────────────────────────────
  if (phase === "result" && result) {
    const { leftMetrics, rightMetrics, riskScore, riskLevel, deltas, hasPriorSession } = result;
    const lowQuality = leftMetrics.session_quality < 60 || rightMetrics.session_quality < 60;
    const circumference = 603;

    const interpChecks = [
      {
        key: "Tap Rate",
        val: `${((leftMetrics.taps_per_sec + rightMetrics.taps_per_sec) / 2).toFixed(1)} taps/s`,
        avg: (leftMetrics.taps_per_sec + rightMetrics.taps_per_sec) / 2,
        ok: (v: number) => v >= 3.5,
        warn: (v: number) => v >= 2.5,
        note: (v: number) => v >= 3.5 ? "normal (≥3.5)" : v >= 2.5 ? "mildly reduced" : "reduced — possible bradykinesia",
      },
      {
        key: "Variability (CV)",
        val: ((leftMetrics.interval_variability + rightMetrics.interval_variability) / 2).toFixed(2),
        avg: (leftMetrics.interval_variability + rightMetrics.interval_variability) / 2,
        ok: (v: number) => v < 0.3,
        warn: (v: number) => v < 0.5,
        note: (v: number) => v < 0.3 ? "consistent rhythm" : v < 0.5 ? "moderate irregularity" : "high irregularity",
      },
      {
        key: "Fatigue Drop",
        val: `${(((leftMetrics.fatigue_drop + rightMetrics.fatigue_drop) / 2) * 100).toFixed(0)}%`,
        avg: (leftMetrics.fatigue_drop + rightMetrics.fatigue_drop) / 2,
        ok: (v: number) => v < 0.15,
        warn: (v: number) => v < 0.35,
        note: (v: number) => v < 0.15 ? "no significant fatigue" : v < 0.35 ? "mild fatigue" : "significant fatigue",
      },
      {
        key: "Tremor Score",
        val: ((leftMetrics.tremor_score + rightMetrics.tremor_score) / 2).toFixed(2),
        avg: (leftMetrics.tremor_score + rightMetrics.tremor_score) / 2,
        ok: (v: number) => v < 0.8,
        warn: (v: number) => v < 1.5,
        note: (v: number) => v < 0.8 ? "minimal tremor" : v < 1.5 ? "mild tremor" : "notable tremor detected",
      },
    ];

    const deltaKeys: { key: string; label: string; higherIsBetter: boolean }[] = [
      { key: "taps_per_sec", label: "Tap Rate", higherIsBetter: true },
      { key: "interval_variability", label: "Variability", higherIsBetter: false },
      { key: "tremor_score", label: "Tremor", higherIsBetter: false },
      { key: "fatigue_drop", label: "Fatigue", higherIsBetter: false },
    ];

    return (
      <div className="min-h-screen bg-[#EFEBE6] pb-24">
        <div className="max-w-md mx-auto px-5 pt-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-8 relative">
            <button onClick={() => navigate("/home")} className="p-1 -ml-1">
              <ArrowLeft size={24} className="text-[#1A1A1A]" />
            </button>
            <h1 className="text-lg font-bold text-[#7B68EE] absolute left-1/2 -translate-x-1/2">NeuroVoice</h1>
            <button className="p-1"><Info size={24} className="text-[#1A1A1A]" /></button>
          </div>

          {/* Title */}
          <div className="text-center mb-8 animate-fade-in">
            <h2 className="text-3xl font-bold text-[#1A1A1A] mb-2">Analysis Complete</h2>
            <p className="text-[#6B6B6B] text-base">Here's your finger tap assessment.</p>
          </div>

          {/* Risk ring */}
          <div className="flex flex-col items-center mb-8 animate-fade-in">
            <div className="relative w-56 h-56 mb-4">
              <svg viewBox="0 0 224 224" className="w-full h-full -rotate-90">
                <circle cx="112" cy="112" r="96" fill="none" stroke="#F0F0F0" strokeWidth="20" />
                <circle
                  cx="112" cy="112" r="96"
                  fill="none"
                  stroke={riskColor(riskLevel)}
                  strokeWidth="20"
                  strokeLinecap="round"
                  strokeDasharray={`${riskScore * (circumference / 100)} ${circumference}`}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-6xl font-bold" style={{ color: riskColor(riskLevel) }}>{riskScore}%</span>
              </div>
            </div>
            <div className="px-5 py-2 rounded-full text-sm font-bold uppercase tracking-wide"
              style={{ backgroundColor: riskBg(riskLevel), color: riskColor(riskLevel) }}>
              {riskLevel} Risk
            </div>
          </div>

          {/* Session quality warning */}
          {lowQuality && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6 flex items-start gap-3 animate-fade-in">
              <AlertTriangle size={18} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-amber-700">
                Session quality is low for one or both hands. Results may be less reliable. Try again with better lighting and keep hands in frame.
              </p>
            </div>
          )}

          {/* Historical deltas */}
          {hasPriorSession && deltas && (
            <div className="bg-white rounded-2xl p-4 mb-6 shadow-sm animate-fade-in">
              <p className="text-xs font-bold text-[#6B6B6B] uppercase tracking-wider mb-3">vs. Last Session</p>
              <div className="grid grid-cols-2 gap-2">
                {deltaKeys.map(({ key, label, higherIsBetter }) => {
                  const val = deltas[key] ?? 0;
                  const improved = higherIsBetter ? val > 0 : val < 0;
                  const color = improved ? "#5DBEA3" : "#FF5A5A";
                  const Icon = improved ? TrendingUp : TrendingDown;
                  return (
                    <div key={key} className="flex items-center gap-2">
                      <Icon size={14} style={{ color }} />
                      <span className="text-xs text-[#6B6B6B]">{label}</span>
                      <span className="text-xs font-bold ml-auto" style={{ color }}>
                        {val > 0 ? "+" : ""}{val.toFixed(1)}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {!hasPriorSession && (
            <div className="bg-white rounded-2xl p-4 mb-6 shadow-sm animate-fade-in">
              <p className="text-xs text-[#999999] text-center">No previous session to compare</p>
            </div>
          )}

          {/* Per-hand metrics grid */}
          <div className="grid grid-cols-2 gap-3 mb-6 animate-fade-in">
            {[
              { label: "Tap Rate", left: `${leftMetrics.taps_per_sec.toFixed(1)}/s`, right: `${rightMetrics.taps_per_sec.toFixed(1)}/s` },
              { label: "Variability", left: leftMetrics.interval_variability.toFixed(2), right: rightMetrics.interval_variability.toFixed(2) },
              { label: "Fatigue Drop", left: `${(leftMetrics.fatigue_drop * 100).toFixed(0)}%`, right: `${(rightMetrics.fatigue_drop * 100).toFixed(0)}%` },
              { label: "Tremor Score", left: leftMetrics.tremor_score.toFixed(2), right: rightMetrics.tremor_score.toFixed(2) },
              { label: "Consistency", left: leftMetrics.consistency_score.toFixed(2), right: rightMetrics.consistency_score.toFixed(2) },
              { label: "Session Quality", left: `${leftMetrics.session_quality}`, right: `${rightMetrics.session_quality}` },
            ].map(({ label, left, right }) => (
              <div key={label} className="bg-white rounded-2xl p-4 shadow-sm col-span-2">
                <p className="text-xs font-bold text-[#6B6B6B] uppercase tracking-wide mb-2">{label}</p>
                <div className="flex gap-4">
                  <div className="flex-1">
                    <p className="text-[10px] text-[#999999] mb-0.5">Left</p>
                    <p className="text-xl font-bold text-[#1A1A1A]">{left}</p>
                  </div>
                  <div className="w-px bg-[#F0F0F0]" />
                  <div className="flex-1">
                    <p className="text-[10px] text-[#999999] mb-0.5">Right</p>
                    <p className="text-xl font-bold text-[#1A1A1A]">{right}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Clinical interpretation */}
          <div className="bg-white rounded-2xl p-4 mb-6 shadow-sm animate-fade-in">
            <p className="text-xs font-bold text-[#6B6B6B] uppercase tracking-wider mb-3">Clinical Interpretation</p>
            {interpChecks.map(c => {
              const isOk = c.ok(c.avg);
              const isWarn = !isOk && c.warn(c.avg);
              const dotColor = isOk ? "#5DBEA3" : isWarn ? "#FF9F43" : "#FF5A5A";
              const textColor = isOk ? "#5DBEA3" : isWarn ? "#FF9F43" : "#FF5A5A";
              return (
                <div key={c.key} className="flex items-center gap-3 py-2 border-b border-[#F5F5F5] last:border-0">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: dotColor }} />
                  <span className="text-xs text-[#6B6B6B] w-28 flex-shrink-0">{c.key}</span>
                  <span className="text-xs text-[#999999] mr-2">{c.val}</span>
                  <span className="text-xs font-medium" style={{ color: textColor }}>{c.note(c.avg)}</span>
                </div>
              );
            })}
          </div>

          {/* Action buttons */}
          <div className="flex flex-col gap-3 animate-fade-in">
            <button
              onClick={() => navigate("/insights")}
              className="w-full bg-[#7B68EE] hover:bg-[#6A58DD] text-white font-bold text-base rounded-full py-4 flex items-center justify-center gap-2 shadow-lg active:scale-[0.98] transition-all"
            >
              <TrendingUp size={20} />
              View Insights
            </button>
            <button
              className="w-full bg-white border-2 border-[#E0E0E0] text-[#1A1A1A] font-bold text-base rounded-full py-4 flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
            >
              <Share2 size={20} />
              Share Report
            </button>
          </div>
        </div>
        <BottomNav />
      </div>
    );
  }

  // ── Recording screen ──────────────────────────────────────────────────────────
  const formatTime = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  };
  const elapsed = recording ? Math.min(recProgress / 100 * TEST_DURATION_MS, TEST_DURATION_MS) : 0;

  return (
    <div className="min-h-screen bg-[#EFEBE6]">
      <div className="max-w-md mx-auto px-5 pt-4 pb-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 relative">
          <button onClick={() => navigate(-1)} className="p-1 -ml-1">
            <ArrowLeft size={24} className="text-[#1A1A1A]" />
          </button>
          <h1 className="text-lg font-bold text-[#1A1A1A] absolute left-1/2 -translate-x-1/2">Finger Tap Assessment</h1>
          <button className="p-1"><Info size={24} className="text-[#1A1A1A]" /></button>
        </div>

        {/* Progress bar */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-[#7B68EE] uppercase tracking-wider">
              {calibrating && recording ? "Calibrating…" : "Recording Progress"}
            </span>
            <span className="text-sm text-[#6B6B6B]">{formatTime(elapsed)} / 00:30</span>
          </div>
          <div className="h-1.5 bg-[#E0E0E0] rounded-full overflow-hidden">
            <div className="h-full bg-[#7B68EE] rounded-full transition-all" style={{ width: `${recProgress}%` }} />
          </div>
        </div>

        {/* Camera frame */}
        <div className="bg-[#B8B0F0] rounded-[32px] overflow-hidden shadow-2xl mb-5 relative" style={{ paddingBottom: "75%" }}>
          <video
            ref={videoRef}
            autoPlay playsInline muted
            className="absolute inset-0 w-full h-full object-cover"
            style={{ transform: "scaleX(-1)" }}
          />
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full"
            style={{ transform: "scaleX(-1)", pointerEvents: "none" }}
          />

          {!cameraReady && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-800/50">
              <div className="text-white text-center">
                <Activity className="w-12 h-12 mx-auto mb-3 animate-spin" />
                <p className="text-sm">Initializing camera…</p>
              </div>
            </div>
          )}

          {recording && (
            <div className="absolute top-4 right-4 bg-[#7B68EE] text-white px-4 py-2 rounded-full flex items-center gap-2 animate-pulse">
              <div className="w-3 h-3 bg-white rounded-full" />
              <span className="font-semibold text-sm">{calibrating ? "Calibrating" : "Recording"}</span>
            </div>
          )}

          {!handsVisible && cameraReady && (
            <div className="absolute inset-0 flex items-end justify-center pb-6 pointer-events-none">
              <div className="bg-black/70 backdrop-blur-sm rounded-full px-5 py-2.5">
                <span className="text-sm font-medium text-white">Place both hands in frame</span>
              </div>
            </div>
          )}
        </div>

        {/* Live metrics — Left / Right */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          {[
            { label: "Left Hand", live: liveLeft, color: "#7B68EE" },
            { label: "Right Hand", live: liveRight, color: "#7B68EE" },
          ].map(({ label, live, color }) => (
            <div key={label} className="bg-white rounded-2xl p-4 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color }}>{label}</p>
              <div className="grid grid-cols-2 gap-1">
                <div>
                  <p className="text-lg font-bold text-[#1A1A1A]">{live.tapCount}</p>
                  <p className="text-[10px] text-[#999999]">taps</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-[#1A1A1A]">{live.tapsPerSec}</p>
                  <p className="text-[10px] text-[#999999]">taps/s</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-[#1A1A1A]">{live.meanIti > 0 ? Math.round(live.meanIti) : "—"}</p>
                  <p className="text-[10px] text-[#999999]">ITI ms</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-[#1A1A1A]">{live.cv > 0 ? live.cv : "—"}</p>
                  <p className="text-[10px] text-[#999999]">CV</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Live distance graph */}
        <div className="bg-white rounded-2xl p-4 mb-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold text-[#6B6B6B] uppercase tracking-wide">Pinch Distance Signal</p>
            <div className="flex items-center gap-3 text-[10px] text-[#999999]">
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-[#7B68EE] rounded" />Left</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-[#5DBEA3] rounded" />Right</span>
              <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-red-400 rounded" style={{ borderTop: "1px dashed" }} />threshold</span>
            </div>
          </div>
          <canvas
            ref={graphCanvasRef}
            width={600}
            height={100}
            className="w-full rounded-lg"
            style={{ height: "80px" }}
          />
        </div>

        {/* Instructions */}
        <div className="bg-white rounded-2xl p-4 mb-5 shadow-sm text-center">
          <p className="text-sm font-semibold text-[#1A1A1A]">Tap thumb and index finger together repeatedly as fast as you can</p>
          <p className="text-xs text-[#999999] mt-1">Use both hands simultaneously for 30 seconds</p>
        </div>

        {/* CTA */}
        {!recording ? (
          <button
            onClick={startRecording}
            disabled={!cameraReady}
            className={`w-full font-bold text-base rounded-full py-4 flex items-center justify-center gap-2 shadow-lg active:scale-[0.98] transition-all mb-3 ${
              !cameraReady
                ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                : "bg-[#7B68EE] hover:bg-[#6A58DD] text-white"
            }`}
          >
            {!cameraReady ? "Initializing…" : "Start Recording"}
          </button>
        ) : (
          <button
            onClick={stopRecording}
            className="w-full bg-[#DDD8F5] text-[#7B68EE] font-bold text-base rounded-full py-4 flex items-center justify-center gap-2 shadow-lg mb-3 active:scale-[0.98] transition-all"
          >
            Stop Early
          </button>
        )}

        <button onClick={() => navigate(-1)} className="w-full text-[#999999] font-medium text-sm py-2">
          Cancel Assessment
        </button>
      </div>
    </div>
  );
};

export default FingerTapTest;
