import type { Features } from '../schemas';
import { clamp, finite, mean, round, stddev } from '../stats';

/** A MediaPipe landmark in normalised image coordinates. */
export interface Lm { x: number; y: number; z?: number }

const dist = (a: Lm, b: Lm): number => Math.hypot(a.x - b.x, a.y - b.y);

/** Thumb tip to index tip, divided by palm length so distance from the camera cancels out. */
export function pinchDistance(hand: Lm[]): number {
  const palm = dist(hand[0]!, hand[9]!);
  return palm < 0.001 ? 0 : dist(hand[4]!, hand[8]!) / palm;
}

interface Tap { t: number; amplitude: number }

/**
 * Counts thumb-index taps for one hand from a stream of pinch distances.
 * A tap is an open -> closed transition, with thresholds that adapt to how wide
 * this person opens their fingers.
 */
export class TapCounter {
  private taps: Tap[] = [];
  private samples: { t: number; d: number }[] = [];
  private open = true;
  private peak = 0;
  private recentMax = 0.6;
  private start: number | null = null;
  private end = 0;
  private seen = 0;
  private missed = 0;

  push(t: number, hand: Lm[] | null): void {
    if (this.start === null) this.start = t;
    this.end = t;
    if (!hand) {
      this.missed++;
      return;
    }
    this.seen++;
    const d = pinchDistance(hand);
    this.samples.push({ t, d });
    this.peak = Math.max(this.peak, d);
    const closeAt = Math.max(0.12, this.recentMax * 0.3);
    const openAt = Math.max(0.2, this.recentMax * 0.5);
    if (this.open && d < closeAt) {
      this.open = false;
      const last = this.taps[this.taps.length - 1];
      // Ignore bounces faster than any real tap (12 Hz).
      if (!last || t - last.t > 80) {
        this.taps.push({ t, amplitude: this.peak });
        this.recentMax = this.recentMax * 0.7 + this.peak * 0.3;
      }
      this.peak = 0;
    } else if (!this.open && d > openAt) {
      this.open = true;
    }
  }

  get count(): number {
    return this.taps.length;
  }

  metrics(): { taps: number; taps_per_sec: number; interval_cv: number; amplitude: number; amplitude_decay: number; fatigue_drop: number; tremor: number; visible: number } {
    const elapsed = Math.max(((this.end - (this.start ?? this.end)) / 1000), 0.1);
    const times = this.taps.map((x) => x.t);
    const itis = times.slice(1).map((t, i) => t - times[i]!);
    const amps = this.taps.map((x) => x.amplitude);
    const meanIti = mean(itis);

    // Amplitude decrement: fractional drop per tap from a least-squares fit.
    let decay = 0;
    if (amps.length >= 4) {
      const mx = (amps.length - 1) / 2;
      const my = mean(amps);
      let num = 0;
      let den = 0;
      amps.forEach((a, i) => { num += (i - mx) * (a - my); den += (i - mx) ** 2; });
      decay = my > 0 && den ? Math.max(0, -(num / den) / my) : 0;
    }

    let fatigue = 0;
    if (this.taps.length >= 6 && this.start !== null) {
      const third = elapsed / 3;
      const early = this.taps.filter((x) => (x.t - this.start!) / 1000 < third).length;
      const late = this.taps.filter((x) => (x.t - this.start!) / 1000 > elapsed - third).length;
      if (early > 0) fatigue = Math.max(0, (early - late) / early);
    }

    // Jitter of the fingertip gap while the fingers are near-closed.
    const near = this.samples.filter((s) => s.d < 0.25);
    const rates: number[] = [];
    for (let i = 1; i < near.length; i++) {
      const dt = near[i]!.t - near[i - 1]!.t;
      if (dt > 0 && dt < 200) rates.push((Math.abs(near[i]!.d - near[i - 1]!.d) / dt) * 100);
    }

    return {
      taps: this.taps.length,
      taps_per_sec: finite(this.taps.length / elapsed),
      interval_cv: meanIti > 0 ? finite(stddev(itis) / meanIti) : 0,
      amplitude: finite(mean(amps)),
      amplitude_decay: finite(decay),
      fatigue_drop: finite(fatigue),
      tremor: finite(stddev(rates)),
      visible: this.seen + this.missed ? this.seen / (this.seen + this.missed) : 0,
    };
  }
}

export function tapFeatures(left: TapCounter, right: TapCounter): { features: Features; usable: boolean; problems: string[]; quality: number } {
  const l = left.metrics();
  const r = right.metrics();
  const avg = (a: number, b: number): number => (a + b) / 2;
  const fast = Math.max(l.taps_per_sec, r.taps_per_sec);
  const features: Features = {
    taps_per_sec: round(avg(l.taps_per_sec, r.taps_per_sec), 2),
    interval_cv: round(avg(l.interval_cv, r.interval_cv), 3),
    amplitude_decay: round(avg(l.amplitude_decay, r.amplitude_decay), 4),
    fatigue_drop: round(avg(l.fatigue_drop, r.fatigue_drop), 3),
    tremor: round(avg(l.tremor, r.tremor), 3),
    hand_asymmetry: round(fast > 0 ? Math.abs(l.taps_per_sec - r.taps_per_sec) / fast : 0, 3),
    left_taps: l.taps, right_taps: r.taps,
    left_taps_per_sec: round(l.taps_per_sec, 2), right_taps_per_sec: round(r.taps_per_sec, 2),
    left_amplitude: round(l.amplitude, 3), right_amplitude: round(r.amplitude, 3),
  };
  const problems: string[] = [];
  if (l.taps < 5 || r.taps < 5) problems.push('too_few_taps');
  if (Math.min(l.visible, r.visible) < 0.6) problems.push('hand_out_of_view');
  const quality = Math.round(clamp(Math.min(l.visible, r.visible), 0, 1) * 100);
  return { features, usable: problems.length === 0, problems, quality };
}
