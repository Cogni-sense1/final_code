import type { Features } from './schemas';
import { clamp, round } from './stats';
import model from './voice-model.json';

/**
 * Population voice screening model. Produced by `ml/train_voice.py`; do not edit the JSON by hand.
 *
 * The model scores a person from the AVERAGE of their recent recordings. Each recording is
 * first standardised against other recordings of the same task, so "aaah" and a read
 * sentence can be combined.
 */
export const VOICE_MODEL = model as {
  version: string;
  features: string[];
  clip: number;
  tasks: Record<string, { mean: number[]; std: number[] }>;
  scaler_mean: number[];
  scaler_scale: number[];
  coef: number[];
  intercept: number;
  calibration: { a: number; b: number };
  metrics: {
    subjects: number;
    subject_auc: number;
    subject_auc_ci95: number[];
    auc_by_recordings_averaged: Record<string, number>;
    permutation_p_value: number;
  };
};

/** How many of a person's most recent usable recordings are averaged. */
export const VOICE_MODEL_WINDOW = 10;
/** Below this many recordings the score is an early estimate. */
export const VOICE_MODEL_SETTLED = 5;

export interface VoiceRecording { task?: string; features: Features }

export interface VoiceModelScore {
  version: string;
  /** Calibrated 0 to 1. Higher means more like the patient group in the training data. */
  score: number;
  /** Recordings that went into the average. */
  recordings: number;
  /** The measures pushing the score up or down the most. */
  factors: { feature: string; contribution: number }[];
}

export const VOICE_FEATURE_LABELS: Record<string, string> = {
  jitter_local: 'Jitter (local)', jitter_local_abs: 'Jitter (absolute)', jitter_rap: 'Jitter (RAP)', jitter_ppq5: 'Jitter (PPQ5)',
  jitter_ddp: 'Jitter (DDP)', shimmer_local: 'Shimmer (local)', shimmer_local_db: 'Shimmer (dB)', shimmer_apq3: 'Shimmer (APQ3)',
  shimmer_apq5: 'Shimmer (APQ5)', shimmer_apq11: 'Shimmer (APQ11)', shimmer_dda: 'Shimmer (DDA)', ac: 'Autocorrelation',
  nth: 'Noise-to-harmonics', htn: 'Harmonics-to-noise', period_std: 'Period variability', frac_unvoiced: 'Unvoiced time',
  degree_voice_breaks: 'Voice breaks',
};

const sigmoid =(x: number): number => 1 / (1 + Math.exp(-clamp(x, -30, 30)));

export function voiceModelScore(recordings: VoiceRecording[]): VoiceModelScore | null {
  const m = VOICE_MODEL;
  const n = m.features.length;
  const sum = new Array<number>(n).fill(0);
  let used = 0;
  for (const rec of recordings) {
    const stats = rec.task ? m.tasks[rec.task] : undefined;
    if (!stats) continue;
    used++;
    m.features.forEach((name, i) => {
      const value = rec.features[name];
      // A measure Praat could not compute counts as typical for the task.
      if (value !== undefined && Number.isFinite(value)) sum[i]! += clamp((value - stats.mean[i]!) / stats.std[i]!, -m.clip, m.clip);
    });
  }
  if (!used) return null;

  let logit = m.intercept;
  const factors = m.features.map((feature, i) => {
    const contribution = m.coef[i]! * ((sum[i]! / used - m.scaler_mean[i]!) / m.scaler_scale[i]!);
    logit += contribution;
    return { feature, contribution: round(contribution, 3) };
  });
  factors.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
  return {
    version: m.version,
    score: round(sigmoid(m.calibration.a * logit + m.calibration.b), 4),
    recordings: used,
    factors: factors.slice(0, 5),
  };
}

/** Plain-language accuracy statement, generated from the measured metrics so it cannot drift. */
export function voiceModelNote(recordings?: number): string {
  const k = VOICE_MODEL.metrics;
  const curve = k.auc_by_recordings_averaged;
  const based = recordings ? `This score uses your last ${recordings} recording${recordings === 1 ? '' : 's'}. ` : '';
  return (
    `${based}It comes from a model trained on ${k.subjects} people recorded in a lab. ` +
    `Its accuracy is modest: an AUC of ${curve['1']!.toFixed(2)} from one recording and ${k.subject_auc.toFixed(2)} when several are averaged ` +
    '(0.5 is chance, 1.0 is perfect), and it has not been validated on phone audio. Your own trend matters far more than this number.'
  );
}
