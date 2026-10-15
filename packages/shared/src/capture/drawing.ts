import type { Features } from '../schemas';
import { clamp, finite, mean, round, stddev } from '../stats';

/** All drawing maths runs in a fixed 300 x 300 space so scores do not depend on screen size. */
export const CANVAS = 300;
const C = CANVAS / 2;

export type DrawingTask = 'spiral' | 'wave' | 'clock';
/** x, y in canvas units; t in milliseconds. */
export interface Pt { x: number; y: number; t: number }

const TURNS = 3.5;
const SPIRAL_A = (C - 24) / (2 * Math.PI * TURNS);
const WAVE_AMP = 36;
const WAVE_FREQ = ((2 * Math.PI) / (CANVAS - 40)) * 3;

export function spiralGuide(): [number, number][] {
  const pts: [number, number][] = [];
  for (let deg = 0; deg <= 360 * TURNS; deg += 3) {
    const th = (deg * Math.PI) / 180;
    pts.push([C + SPIRAL_A * th * Math.cos(th - Math.PI / 2), C + SPIRAL_A * th * Math.sin(th - Math.PI / 2)]);
  }
  return pts;
}

export function waveGuide(): [number, number][] {
  const pts: [number, number][] = [];
  for (let x = 20; x <= CANVAS - 20; x += 2) pts.push([x, C + WAVE_AMP * Math.sin(WAVE_FREQ * (x - 20))]);
  return pts;
}

function guideError(task: DrawingTask, p: Pt): number | null {
  if (task === 'spiral') {
    const dx = p.x - C;
    const dy = p.y - C;
    const r = Math.hypot(dx, dy);
    const th = ((Math.atan2(dy, dx) + Math.PI / 2) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
    // The same angle occurs once per turn; compare against the nearest arm.
    let best = Infinity;
    for (let k = 0; k <= Math.ceil(TURNS); k++) best = Math.min(best, Math.abs(r - SPIRAL_A * (th + 2 * Math.PI * k)));
    return best;
  }
  if (task === 'wave') {
    if (p.x < 20 || p.x > CANVAS - 20) return null;
    return Math.abs(p.y - (C + WAVE_AMP * Math.sin(WAVE_FREQ * (p.x - 20))));
  }
  return null;
}

export function drawingFeatures(task: DrawingTask, strokes: Pt[][]): { features: Features; usable: boolean; problems: string[] } {
  const all = strokes.flat();
  const problems: string[] = [];
  if (all.length < 20) problems.push('too_few_points');

  const speeds: number[] = [];
  let pause = 0;
  let pathLength = 0;
  let prevEnd: Pt | undefined;
  // Tremor index: how often acceleration flips sign along the path. Counted within
  // each stroke, on smoothed speeds, so pen lifts and uneven touch-event timing are
  // not mistaken for tremor. Very short strokes (a clock tick) carry no information.
  let flips = 0;
  let flipSamples = 0;
  for (const stroke of strokes) {
    if (prevEnd && stroke[0]) {
      const gap = (stroke[0].t - prevEnd.t) / 1000;
      if (gap > 1) pause += gap;
    }
    const own: number[] = [];
    for (let i = 1; i < stroke.length; i++) {
      const a = stroke[i - 1]!;
      const b = stroke[i]!;
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      const dt = Math.max((b.t - a.t) / 1000, 0.005);
      if (dt > 1) pause += dt;
      else own.push(d / dt);
      pathLength += d;
    }
    speeds.push(...own);
    if (own.length >= 8) {
      const smooth = own.map((_, i) => mean(own.slice(Math.max(0, i - 2), i + 3)));
      for (let i = 2; i < smooth.length; i++) {
        if ((smooth[i - 1]! - smooth[i - 2]!) * (smooth[i]! - smooth[i - 1]!) < 0) flips++;
      }
      flipSamples += smooth.length;
    }
    prevEnd = stroke[stroke.length - 1];
  }

  const meanSpeed = mean(speeds);
  const speedCv = meanSpeed > 0 ? (stddev(speeds) / meanSpeed) * 100 : 0;
  const tremorIndex = flipSamples ? Math.min(flips / (flipSamples * 0.35), 1) : 0;

  const curv: number[] = [];
  for (let i = 1; i < all.length - 1; i++) {
    const ax = all[i]!.x - all[i - 1]!.x;
    const ay = all[i]!.y - all[i - 1]!.y;
    const bx = all[i + 1]!.x - all[i]!.x;
    const by = all[i + 1]!.y - all[i]!.y;
    const den = Math.sqrt((ax * ax + ay * ay) * (bx * bx + by * by));
    curv.push(den > 0 ? Math.abs((ax * by - ay * bx) / den) : 0);
  }

  const totalTime = all.length > 1 ? (all[all.length - 1]!.t - all[0]!.t) / 1000 : 0;
  const features: Features = {
    mean_speed: round(finite(meanSpeed), 0),
    speed_cv: round(finite(speedCv), 0),
    tremor_index: round(tremorIndex, 3),
    waviness: round(stddev(curv), 3),
    stroke_count: strokes.length,
    total_time: round(totalTime, 1),
    pause_time: round(pause, 1),
    path_length: round(pathLength, 0),
  };

  if (task !== 'clock') {
    const errs = all.map((p) => guideError(task, p)).filter((e): e is number => e !== null);
    if (errs.length > 10) features.rmse = round(Math.sqrt(mean(errs.map((e) => e * e))), 1);
    const expected = task === 'spiral' ? 900 : 380;
    if (pathLength < expected * 0.5) problems.push('incomplete_trace');
  } else if (pathLength < 300) {
    problems.push('incomplete_drawing');
  }
  return { features, usable: problems.length === 0, problems };
}

/** Downsample strokes for storage: [x, y, t] with t relative to the first point. */
export function packStrokes(strokes: Pt[][], maxPerStroke = 300): [number, number, number][][] {
  const t0 = strokes[0]?.[0]?.t ?? 0;
  return strokes.slice(0, 60).map((s) => {
    const step = Math.max(1, Math.ceil(s.length / maxPerStroke));
    return s.filter((_, i) => i % step === 0).map((p) => [round(clamp(p.x, 0, CANVAS), 1), round(clamp(p.y, 0, CANVAS), 1), Math.round(p.t - t0)]);
  });
}
