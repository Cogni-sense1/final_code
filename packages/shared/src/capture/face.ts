import type { Features } from '../schemas';
import { clamp, mean, round } from '../stats';
import type { Lm } from './tap';

// MediaPipe Face Mesh indices.
const L_EYE_TOP = 159, L_EYE_BOTTOM = 145, R_EYE_TOP = 386, R_EYE_BOTTOM = 374;
const L_EYE_OUTER = 33, R_EYE_OUTER = 263, FOREHEAD = 10, CHIN = 152;
const EXPRESSIVE = [61, 291, 13, 14, 105, 334, 93, 323];
const PAIRS: [number, number][] = [[61, 291], [105, 334], [206, 426]];

/**
 * Accumulates blink rate, facial movement, and asymmetry from face landmarks.
 * Everything is measured relative to face size and corrected for head tilt, so
 * leaning in or tilting the head does not change the numbers.
 */
export class FaceAccumulator {
  private blinks = 0;
  private eyesOpen = true;
  private prev: { t: number; pts: Lm[] } | null = null;
  private motion: number[] = [];
  private asym: number[] = [];
  private start: number | null = null;
  private end = 0;
  private seen = 0;
  private missed = 0;

  push(t: number, lm: Lm[] | null): void {
    if (this.start === null) this.start = t;
    this.end = t;
    if (!lm || lm.length < 468) {
      this.missed++;
      this.prev = null;
      return;
    }
    this.seen++;
    const faceH = Math.hypot(lm[FOREHEAD]!.x - lm[CHIN]!.x, lm[FOREHEAD]!.y - lm[CHIN]!.y) || 1;

    const closed =
      Math.abs(lm[L_EYE_TOP]!.y - lm[L_EYE_BOTTOM]!.y) < faceH * 0.015 &&
      Math.abs(lm[R_EYE_TOP]!.y - lm[R_EYE_BOTTOM]!.y) < faceH * 0.015;
    if (this.eyesOpen && closed) {
      this.blinks++;
      this.eyesOpen = false;
    } else if (!this.eyesOpen && !closed) {
      this.eyesOpen = true;
    }

    // Rotate into a frame where the eye line is horizontal, centred on the nose bridge.
    const roll = Math.atan2(lm[R_EYE_OUTER]!.y - lm[L_EYE_OUTER]!.y, lm[R_EYE_OUTER]!.x - lm[L_EYE_OUTER]!.x);
    const cx = (lm[L_EYE_OUTER]!.x + lm[R_EYE_OUTER]!.x) / 2;
    const cy = (lm[L_EYE_OUTER]!.y + lm[R_EYE_OUTER]!.y) / 2;
    const cos = Math.cos(-roll);
    const sin = Math.sin(-roll);
    const norm = (p: Lm): Lm => {
      const dx = (p.x - cx) / faceH;
      const dy = (p.y - cy) / faceH;
      return { x: dx * cos - dy * sin, y: dx * sin + dy * cos };
    };
    const pts = EXPRESSIVE.map((i) => norm(lm[i]!));

    if (this.prev) {
      const dt = (t - this.prev.t) / 1000;
      if (dt > 0 && dt < 0.5) {
        const moved = mean(pts.map((p, i) => Math.hypot(p.x - this.prev!.pts[i]!.x, p.y - this.prev!.pts[i]!.y)));
        // Movement per 1/30 s, so the value does not depend on camera frame rate.
        this.motion.push((moved / dt) / 30);
      }
    }
    this.prev = { t, pts };
    this.asym.push(mean(PAIRS.map(([a, b]) => Math.abs(norm(lm[a]!).y - norm(lm[b]!).y))));
  }

  get blinkCount(): number {
    return this.blinks;
  }

  result(): { features: Features; usable: boolean; problems: string[]; quality: number } {
    const seconds = Math.max((this.end - (this.start ?? this.end)) / 1000, 0.1);
    const visible = this.seen + this.missed ? this.seen / (this.seen + this.missed) : 0;
    const features: Features = {
      blink_rate: round((this.blinks / seconds) * 60, 1),
      // Scaled so typical values land near the original prototype's 0.5 to 5 range.
      expressivity: round(mean(this.motion) * 2000, 2),
      asymmetry: round(mean(this.asym) * 2, 4),
    };
    const problems: string[] = [];
    if (seconds < 20) problems.push('too_short');
    if (visible < 0.7) problems.push('face_out_of_view');
    return { features, usable: problems.length === 0, problems, quality: Math.round(clamp(visible, 0, 1) * 100) };
  }
}
