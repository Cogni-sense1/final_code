import type { Features } from '../schemas';
import { clamp, mean, round, stddev } from '../stats';
import type { Lm } from './tap';

// MediaPipe Pose indices.
export const POSE = { L_SHOULDER: 11, R_SHOULDER: 12, L_WRIST: 15, R_WRIST: 16, L_HIP: 23, R_HIP: 24, L_ANKLE: 27, R_ANKLE: 28 } as const;

const mid = (a: Lm, b: Lm): Lm => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const d = (a: Lm, b: Lm): number => Math.hypot(a.x - b.x, a.y - b.y);
const spread = (xs: number[]): number => {
  if (xs.length < 5) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length * 0.95)]! - s[Math.floor(s.length * 0.05)]!;
};

/**
 * Marching-on-the-spot gait test, facing the camera.
 * Lengths are divided by torso length so distance from the camera cancels out.
 */
export class GaitAccumulator {
  private stepTimes: number[] = [];
  private side: 'left' | 'right' | null = null;
  private lWrist: number[] = [];
  private rWrist: number[] = [];
  private sway: number[] = [];
  private start: number | null = null;
  private end = 0;
  private seen = 0;
  private missed = 0;

  push(t: number, lm: Lm[] | null): void {
    if (this.start === null) this.start = t;
    this.end = t;
    if (!lm || lm.length < 29) {
      this.missed++;
      return;
    }
    this.seen++;
    const shoulders = mid(lm[POSE.L_SHOULDER]!, lm[POSE.R_SHOULDER]!);
    const hips = mid(lm[POSE.L_HIP]!, lm[POSE.R_HIP]!);
    const torso = d(shoulders, hips) || 1;

    // A step is the moment the higher foot switches sides, with a dead band against jitter.
    const lift = (lm[POSE.R_ANKLE]!.y - lm[POSE.L_ANKLE]!.y) / torso;
    const now = lift > 0.06 ? 'left' : lift < -0.06 ? 'right' : null;
    if (now && now !== this.side) {
      const last = this.stepTimes[this.stepTimes.length - 1];
      if (last === undefined || t - last > 200) this.stepTimes.push(t);
      this.side = now;
    }

    this.lWrist.push((lm[POSE.L_WRIST]!.y - lm[POSE.L_SHOULDER]!.y) / torso);
    this.rWrist.push((lm[POSE.R_WRIST]!.y - lm[POSE.R_SHOULDER]!.y) / torso);
    this.sway.push((shoulders.x - hips.x) / torso);
  }

  get steps(): number {
    return this.stepTimes.length;
  }

  result(): { features: Features; usable: boolean; problems: string[]; quality: number } {
    const seconds = Math.max((this.end - (this.start ?? this.end)) / 1000, 0.1);
    const visible = this.seen + this.missed ? this.seen / (this.seen + this.missed) : 0;
    const gaps = this.stepTimes.slice(1).map((t, i) => t - this.stepTimes[i]!);
    const l = spread(this.lWrist);
    const r = spread(this.rWrist);
    const features: Features = {
      cadence: round((this.stepTimes.length / seconds) * 60, 0),
      step_time_cv: round(mean(gaps) > 0 ? stddev(gaps) / mean(gaps) : 0, 3),
      arm_swing: round((l + r) / 2, 3),
      arm_swing_asymmetry: round(Math.max(l, r) > 0 ? Math.abs(l - r) / Math.max(l, r) : 0, 3),
      trunk_sway: round(stddev(this.sway), 4),
      steps: this.stepTimes.length,
    };
    const problems: string[] = [];
    if (this.stepTimes.length < 10) problems.push('too_few_steps');
    if (visible < 0.7) problems.push('body_out_of_view');
    return { features, usable: problems.length === 0, problems, quality: Math.round(clamp(visible, 0, 1) * 100) };
  }
}

/** Tracks how wide the user reaches during the BIG movement game. */
export class ReachAccumulator {
  private spans: number[] = [];
  private reachTimes: number[] = [];

  /** Hand span relative to shoulder width for this frame, or null if the body is not visible. */
  push(lm: Lm[] | null): number | null {
    if (!lm || lm.length < 17) return null;
    const shoulderW = d(lm[POSE.L_SHOULDER]!, lm[POSE.R_SHOULDER]!);
    if (shoulderW < 0.02) return null;
    const span = d(lm[POSE.L_WRIST]!, lm[POSE.R_WRIST]!) / shoulderW;
    this.spans.push(span);
    return span;
  }

  hit(seconds: number): void {
    this.reachTimes.push(seconds);
  }

  result(score: number): { features: Features; usable: boolean; problems: string[] } {
    const sorted = [...this.spans].sort((a, b) => a - b);
    const features: Features = {
      reach_amplitude: round(sorted[Math.floor(sorted.length * 0.9)] ?? 0, 2),
      reps: this.reachTimes.length,
      mean_reach_time: round(mean(this.reachTimes), 2),
      game_score: score,
    };
    const problems = this.spans.length < 60 ? ['body_out_of_view'] : [];
    return { features, usable: problems.length === 0, problems };
  }
}
