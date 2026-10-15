import type { AssessmentType, Features, Level } from './schemas';
import { clamp } from './stats';

export interface FeatureSpec {
  key: string;
  label: string;
  unit: string;
  /** Which direction is a worsening. */
  worse: 'up' | 'down';
  /** Included in the personal-baseline deviation index. */
  tracked: boolean;
  /** Largest physically possible value. Anything above it is a capture fault, not a reading. */
  max?: number;
  /** Restrict to specific tasks of this modality. */
  tasks?: string[];
  dp?: number;
}

export interface ModalitySpec {
  type: AssessmentType;
  name: string;
  short: string;
  blurb: string;
  seconds: number;
  weight: number;
  tasks?: { id: string; name: string; prompt: string }[];
  features: FeatureSpec[];
}

export const VOICE_SENTENCES = [
  'The rainbow is a division of white light into many beautiful colours.',
  'When the sunlight strikes raindrops in the air, they act as a prism and form a rainbow.',
  'Please call Stella and ask her to bring these things with her from the store.',
] as const;

export const MODALITIES: Record<AssessmentType, ModalitySpec> = {
  voice: {
    type: 'voice', name: 'Voice', short: 'Voice', seconds: 20, weight: 1,
    blurb: 'Hold a steady "aah", then read one sentence.',
    tasks: [
      { id: 'vowel', name: 'Steady vowel', prompt: 'Take a breath and say "aaah" at a comfortable pitch for as long as the ring fills.' },
      { id: 'reading', name: 'Read aloud', prompt: 'Read the sentence on screen in your normal speaking voice.' },
    ],
    features: [
      { key: 'jitter_local', label: 'Pitch steadiness (jitter)', unit: '%', worse: 'up', tracked: true, dp: 2, max: 100 },
      { key: 'shimmer_local', label: 'Loudness steadiness (shimmer)', unit: '%', worse: 'up', tracked: true, dp: 2 },
      { key: 'htn', label: 'Voice clarity (HNR)', unit: 'dB', worse: 'down', tracked: true, dp: 1 },
      { key: 'degree_voice_breaks', label: 'Voice breaks', unit: '%', worse: 'up', tracked: true, tasks: ['vowel'], dp: 1 },
      { key: 'frac_unvoiced', label: 'Unvoiced time', unit: '%', worse: 'up', tracked: true, tasks: ['vowel'], dp: 1 },
      { key: 'pitch_std', label: 'Pitch variation', unit: 'Hz', worse: 'down', tracked: true, tasks: ['reading'], dp: 1 },
      { key: 'speech_rate', label: 'Speech rate', unit: 'words/s', worse: 'down', tracked: true, tasks: ['reading'], dp: 2 },
      { key: 'pitch_mean', label: 'Average pitch', unit: 'Hz', worse: 'down', tracked: false, dp: 0 },
    ],
  },
  face: {
    type: 'face', name: 'Facial expression', short: 'Face', seconds: 30, weight: 1,
    blurb: 'Look at the camera and follow three short prompts. Video stays on your device.',
    features: [
      { key: 'blink_rate', label: 'Blink rate', unit: '/min', worse: 'down', tracked: true, dp: 1, max: 150 },
      { key: 'expressivity', label: 'Facial movement', unit: '', worse: 'down', tracked: true, dp: 2 },
      { key: 'asymmetry', label: 'Left-right asymmetry', unit: '', worse: 'up', tracked: true, dp: 3 },
    ],
  },
  tap: {
    type: 'tap', name: 'Finger tapping', short: 'Tapping', seconds: 30, weight: 1,
    blurb: 'Tap thumb and index finger as big and fast as you can, one hand at a time.',
    features: [
      { key: 'taps_per_sec', label: 'Tapping speed', unit: 'taps/s', worse: 'down', tracked: true, dp: 2, max: 12 },
      { key: 'interval_cv', label: 'Rhythm variability', unit: '', worse: 'up', tracked: true, dp: 2 },
      { key: 'amplitude_decay', label: 'Amplitude decrement', unit: '', worse: 'up', tracked: true, dp: 3 },
      { key: 'fatigue_drop', label: 'Slowing over time', unit: '', worse: 'up', tracked: true, dp: 2 },
      { key: 'hand_asymmetry', label: 'Difference between hands', unit: '', worse: 'up', tracked: true, dp: 2 },
      { key: 'tremor', label: 'Hold tremor', unit: '', worse: 'up', tracked: false, dp: 2 },
    ],
  },
  spiral: {
    type: 'spiral', name: 'Spiral drawing', short: 'Spiral', seconds: 25, weight: 0.8,
    blurb: 'Trace the spiral from the centre outward in one smooth line.',
    features: [
      { key: 'rmse', label: 'Deviation from guide', unit: 'px', worse: 'up', tracked: true, dp: 1, max: 300 },
      { key: 'tremor_index', label: 'Tremor index', unit: '', worse: 'up', tracked: true, dp: 2 },
      { key: 'speed_cv', label: 'Speed variability', unit: '%', worse: 'up', tracked: true, dp: 0 },
      { key: 'mean_speed', label: 'Drawing speed', unit: 'px/s', worse: 'down', tracked: true, dp: 0, max: 6000 },
      { key: 'waviness', label: 'Line irregularity', unit: '', worse: 'up', tracked: false, dp: 2 },
      { key: 'stroke_count', label: 'Pen lifts', unit: '', worse: 'up', tracked: false, dp: 0 },
    ],
  },
  wave: {
    type: 'wave', name: 'Wave drawing', short: 'Wave', seconds: 20, weight: 0.8,
    blurb: 'Trace the wave from left to right without lifting.',
    features: [
      { key: 'rmse', label: 'Deviation from guide', unit: 'px', worse: 'up', tracked: true, dp: 1, max: 300 },
      { key: 'tremor_index', label: 'Tremor index', unit: '', worse: 'up', tracked: true, dp: 2 },
      { key: 'speed_cv', label: 'Speed variability', unit: '%', worse: 'up', tracked: true, dp: 0 },
      { key: 'mean_speed', label: 'Drawing speed', unit: 'px/s', worse: 'down', tracked: true, dp: 0, max: 6000 },
      { key: 'waviness', label: 'Line irregularity', unit: '', worse: 'up', tracked: false, dp: 2 },
    ],
  },
  clock: {
    type: 'clock', name: 'Clock drawing', short: 'Clock', seconds: 60, weight: 0.5,
    blurb: 'Draw a clock face with all twelve numbers and set the hands to ten past eleven.',
    features: [
      { key: 'total_time', label: 'Time taken', unit: 's', worse: 'up', tracked: true, dp: 1, max: 600 },
      { key: 'pause_time', label: 'Time spent paused', unit: 's', worse: 'up', tracked: true, dp: 1 },
      { key: 'tremor_index', label: 'Tremor index', unit: '', worse: 'up', tracked: true, dp: 2 },
      { key: 'stroke_count', label: 'Strokes', unit: '', worse: 'up', tracked: false, dp: 0 },
    ],
  },
  gait: {
    type: 'gait', name: 'Walking test', short: 'Walking', seconds: 30, weight: 1,
    blurb: 'Prop your phone up, step back, and walk on the spot for thirty seconds.',
    features: [
      { key: 'cadence', label: 'Cadence', unit: 'steps/min', worse: 'down', tracked: true, dp: 0, max: 260 },
      { key: 'step_time_cv', label: 'Step timing variability', unit: '', worse: 'up', tracked: true, dp: 2 },
      { key: 'arm_swing', label: 'Arm swing', unit: '', worse: 'down', tracked: true, dp: 2 },
      { key: 'arm_swing_asymmetry', label: 'Arm swing asymmetry', unit: '', worse: 'up', tracked: true, dp: 2 },
      { key: 'trunk_sway', label: 'Trunk sway', unit: '', worse: 'up', tracked: false, dp: 3 },
    ],
  },
  lsvt: {
    type: 'lsvt', name: 'BIG movements', short: 'BIG', seconds: 60, weight: 0.5,
    blurb: 'Reach wide and high to hit each target. Bigger is better.',
    features: [
      { key: 'reach_amplitude', label: 'Reach amplitude', unit: 'x shoulder', worse: 'down', tracked: true, dp: 2 },
      { key: 'reps', label: 'Targets reached', unit: '', worse: 'down', tracked: true, dp: 0 },
      { key: 'mean_reach_time', label: 'Time per reach', unit: 's', worse: 'up', tracked: true, dp: 2 },
      { key: 'game_score', label: 'Score', unit: '', worse: 'down', tracked: false, dp: 0 },
    ],
  },
};

/** Measures outside what is physically possible, which point to a capture fault. */
export function implausible(type: AssessmentType, features: Features): string[] {
  return MODALITIES[type].features
    .filter((f) => { const v = features[f.key]; return v !== undefined && (v < 0 || (f.max !== undefined && v > f.max)); })
    .map((f) => f.key);
}

export const baselineKey = (type: AssessmentType, task?: string): string => (task ? `${type}:${task}` : type);

export function trackedFeatures(type: AssessmentType, task?: string): FeatureSpec[] {
  return MODALITIES[type].features.filter((f) => f.tracked && (!f.tasks || (task !== undefined && f.tasks.includes(task))));
}

export interface Reference {
  score: number;
  level: Level;
  findings: string[];
}

const level = (score: number, moderate: number, elevated: number): Level =>
  score >= elevated ? 'elevated' : score >= moderate ? 'moderate' : 'low';

/**
 * Reference scores use fixed thresholds taken from the original prototype and the
 * papers it cited. They are context for clinicians, not validated cut-offs.
 */
export function referenceScore(type: AssessmentType, f: Features, task?: string, modelScore?: number): Reference {
  const findings: string[] = [];
  const g = (k: string): number => f[k] ?? 0;
  let score = 0;

  switch (type) {
    case 'voice': {
      score = Math.round((modelScore ?? 0.5) * 100);
      if (task === 'vowel') {
        if (g('jitter_local') > 1.04) findings.push(`Jitter ${g('jitter_local').toFixed(2)}% is above the 1.04% lab reference.`);
        if (g('htn') > 0 && g('htn') < 15) findings.push(`Harmonics-to-noise ${g('htn').toFixed(1)} dB is on the low side.`);
        if (g('degree_voice_breaks') > 5) findings.push('Voice broke off during the held vowel.');
      } else if (task === 'reading' && f.pitch_std !== undefined && g('pitch_std') < 12) {
        findings.push('Little pitch variation while reading (monotone tendency).');
      }
      return { score, level: level(score, 45, 65), findings };
    }
    case 'face': {
      const blink = g('blink_rate');
      score += blink >= 13 ? 0 : blink >= 10 ? 12 : blink >= 7 ? 28 : blink >= 4 ? 36 : 40;
      const motion = g('expressivity');
      score += motion >= 2.5 ? 0 : motion >= 1.5 ? 5 : motion >= 1.0 ? 15 : motion >= 0.6 ? 26 : 35;
      const asym = g('asymmetry');
      score += asym < 0.035 ? 0 : asym < 0.05 ? 8 : asym < 0.07 ? 16 : 25;
      if (blink < 10) findings.push(`Blink rate ${blink.toFixed(0)}/min is below the usual 13 to 20.`);
      if (motion < 1.0) findings.push('Reduced facial movement during prompts.');
      if (asym >= 0.05) findings.push('Noticeable left-right asymmetry.');
      return { score, level: level(score, 20, 45), findings };
    }
    case 'tap': {
      const tps = g('taps_per_sec');
      const cv = g('interval_cv');
      const fd = g('fatigue_drop');
      const tr = g('tremor');
      score += tps < 2.5 ? 35 : tps < 3.5 ? 15 : 0;
      score += cv > 0.5 ? 25 : cv > 0.3 ? 10 : 0;
      score += fd > 0.35 ? 20 : fd > 0.15 ? 8 : 0;
      score += tr > 1.5 ? 20 : tr > 0.8 ? 8 : 0;
      if (tps < 3.5) findings.push(`Tapping speed ${tps.toFixed(1)}/s is on the slow side.`);
      if (cv > 0.3) findings.push('Irregular rhythm between taps.');
      if (fd > 0.15) findings.push('Slowed down towards the end.');
      if (g('amplitude_decay') > 0.01) findings.push('Taps got smaller over the run.');
      if (g('hand_asymmetry') > 0.25) findings.push('One hand was clearly slower than the other.');
      return { score: clamp(score, 0, 100), level: level(score, 34, 67), findings };
    }
    case 'spiral':
    case 'wave': {
      let s = g('tremor_index') * 0.35 + Math.min(g('speed_cv') / 120, 1) * 0.25;
      let w = 0.6;
      if (f.rmse !== undefined) {
        s += clamp((g('rmse') - 5) / 30, 0, 1) * 0.25;
        w += 0.25;
      }
      if (f.waviness !== undefined) {
        s += Math.min(g('waviness') / 0.5, 1) * 0.15;
        w += 0.15;
      }
      s = s / w + Math.min(Math.max(g('stroke_count') - 3, 0) * 0.04, 0.15);
      score = Math.round(clamp(s, 0, 1) * 100);
      if (g('tremor_index') > 0.6) findings.push('Frequent speed oscillation, consistent with tremor.');
      else if (g('tremor_index') > 0.35) findings.push('Some speed fluctuation while drawing.');
      if (g('speed_cv') > 80) findings.push('Large variation in drawing speed.');
      if (g('rmse') > 18) findings.push(`Strayed ${g('rmse').toFixed(0)} px from the guide on average.`);
      if (g('stroke_count') > 3) findings.push('Lifted the pen several times.');
      return { score, level: level(score, 35, 60), findings };
    }
    case 'clock': {
      const t = g('total_time');
      score += t > 90 ? 40 : t > 60 ? 20 : 0;
      score += g('pause_time') > 20 ? 30 : g('pause_time') > 10 ? 15 : 0;
      score += Math.round(g('tremor_index') * 30);
      if (t > 60) findings.push(`Took ${t.toFixed(0)} s to finish.`);
      if (g('pause_time') > 10) findings.push('Long pauses between strokes.');
      findings.push('Layout and numbers are for a clinician to review; they are not scored automatically.');
      return { score: clamp(score, 0, 100), level: level(score, 35, 60), findings };
    }
    case 'gait': {
      const cad = g('cadence');
      score += cad < 80 ? 30 : cad < 95 ? 12 : 0;
      score += g('step_time_cv') > 0.2 ? 25 : g('step_time_cv') > 0.1 ? 10 : 0;
      score += g('arm_swing') < 0.15 ? 25 : g('arm_swing') < 0.3 ? 10 : 0;
      score += g('arm_swing_asymmetry') > 0.4 ? 20 : g('arm_swing_asymmetry') > 0.2 ? 8 : 0;
      if (cad < 95) findings.push(`Cadence ${cad.toFixed(0)} steps/min is on the slow side.`);
      if (g('step_time_cv') > 0.1) findings.push('Uneven step timing.');
      if (g('arm_swing') < 0.3) findings.push('Reduced arm swing.');
      if (g('arm_swing_asymmetry') > 0.2) findings.push('One arm swings less than the other.');
      return { score: clamp(score, 0, 100), level: level(score, 30, 55), findings };
    }
    case 'lsvt': {
      const amp = g('reach_amplitude');
      score += amp < 1.2 ? 50 : amp < 1.8 ? 25 : 0;
      score += g('mean_reach_time') > 3 ? 30 : g('mean_reach_time') > 2 ? 15 : 0;
      if (amp < 1.8) findings.push('Movements were on the small side. Think big.');
      if (g('mean_reach_time') > 2) findings.push('Reaches were slow to complete.');
      return { score: clamp(score, 0, 100), level: level(score, 30, 55), findings };
    }
  }
}
