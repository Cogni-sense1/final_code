import { describe, expect, it } from 'vitest';
import {
  BASELINE_MIN, compositeIndex, computeBaseline, computeDeviation, daySchedule, drawingFeatures, medicationInsights, referenceScore,
  sleepHours, spiralGuide, sustainedChange, TapCounter, toSleepEntry, VOICE_MODEL, voiceModelNote, voiceModelScore,
  type Lm, type Medication, type Pt,
} from './index';

const now = '2026-10-11T00:00:00.000Z';

describe('personal baseline', () => {
  const history = [16, 17, 15, 16, 18].map((b) => ({ blink_rate: b, expressivity: 2.6, asymmetry: 0.03 }));
  const baseline = computeBaseline('face', history, now);

  it('needs a minimum number of sessions', () => {
    const early = computeBaseline('face', history.slice(0, BASELINE_MIN - 1), now);
    expect(computeDeviation('face', undefined, history[0]!, early).status).toBe('building');
  });

  it('treats a typical session as steady and a clear shift as changed', () => {
    expect(computeDeviation('face', undefined, { blink_rate: 16, expressivity: 2.6, asymmetry: 0.03 }, baseline).status).toBe('steady');
    const off = computeDeviation('face', undefined, { blink_rate: 6, expressivity: 0.9, asymmetry: 0.07 }, baseline);
    expect(off.status).toBe('changed');
    expect(off.index).toBeGreaterThan(2);
  });

  it('counts improvement as negative, not as a change', () => {
    const better = computeDeviation('face', undefined, { blink_rate: 22, expressivity: 3.4, asymmetry: 0.02 }, baseline);
    expect(better.index).toBeLessThan(0);
    expect(better.status).toBe('steady');
  });

  it('does not turn noise into alarms when the baseline is very consistent', () => {
    const flat = computeBaseline('face', Array.from({ length: 6 }, () => ({ blink_rate: 16, expressivity: 2.6, asymmetry: 0.03 })), now);
    expect(computeDeviation('face', undefined, { blink_rate: 15.5, expressivity: 2.55, asymmetry: 0.031 }, flat).status).toBe('steady');
  });

  it('flags only sustained change', () => {
    expect(sustainedChange([0.1, 2.4, 0.2, 0.1, 0.3, 0.2, 0.1])).toBe(false);
    expect(sustainedChange([0.2, 1.6, 1.8, 2.0, 1.7, 2.2, 1.9, 2.4])).toBe(true);
    expect(sustainedChange([null, 1.9, null, 2.1])).toBe(false);
  });

  it('weights modalities in the composite', () => {
    expect(compositeIndex({ face: { index: 2 }, 'voice:vowel': { index: 0 }, clock: { index: null } })).toBe(1);
    expect(compositeIndex({ face: { index: null } })).toBeNull();
  });
});

describe('voice screening model', () => {
  const m = VOICE_MODEL;
  /** A recording sitting `z` standard deviations from the task mean in the "worse" direction of each coefficient. */
  const recording = (task: string, z: number) => ({
    task,
    features: Object.fromEntries(m.features.map((f, i) => [f, m.tasks[task]!.mean[i]! + Math.sign(m.coef[i]!) * z * m.tasks[task]!.std[i]!])),
  });

  it('scores recordings that lean towards the patient group higher', () => {
    const low = voiceModelScore([recording('vowel', -1)])!;
    const high = voiceModelScore([recording('vowel', 1)])!;
    expect(low.score).toBeGreaterThan(0);
    expect(high.score).toBeLessThan(1);
    expect(high.score).toBeGreaterThan(low.score + 0.2);
  });

  it('averages across recordings and tasks', () => {
    const mixed = voiceModelScore([recording('vowel', 1), recording('reading', -1)])!;
    const typical = voiceModelScore([recording('vowel', 0)])!;
    expect(mixed.recordings).toBe(2);
    expect(mixed.score).toBeCloseTo(typical.score, 2);
  });

  it('ignores tasks it was not trained on and tolerates missing measures', () => {
    expect(voiceModelScore([{ task: 'singing', features: {} }])).toBeNull();
    expect(voiceModelScore([{ task: 'vowel', features: {} }])!.recordings).toBe(1);
  });

  it('caps the effect of one wildly out-of-range recording', () => {
    const wild = voiceModelScore([recording('vowel', 50)])!;
    const capped = voiceModelScore([recording('vowel', m.clip)])!;
    expect(wild.score).toBeCloseTo(capped.score, 6);
  });

  it('reports the accuracy that was actually measured', () => {
    expect(voiceModelNote(3)).toContain(m.metrics.subject_auc.toFixed(2));
    expect(m.metrics.subject_auc).toBeLessThan(0.9);
  });
});

describe('drawing', () => {
  const trace = (wobble: number): Pt[][] => [spiralGuide().map(([x, y], i) => ({ x: x + wobble * Math.sin(i * 1.3), y: y + wobble * Math.cos(i * 1.7), t: i * 16 }))];

  it('scores a clean spiral close to the guide', () => {
    const out = drawingFeatures('spiral', trace(0));
    expect(out.usable).toBe(true);
    expect(out.features.rmse).toBeLessThan(1);
  });

  it('measures a shaky spiral as further from the guide', () => {
    const clean = drawingFeatures('spiral', trace(0)).features;
    const shaky = drawingFeatures('spiral', trace(9)).features;
    expect(shaky.rmse!).toBeGreaterThan(clean.rmse! + 4);
    expect(referenceScore('spiral', shaky).score).toBeGreaterThan(referenceScore('spiral', clean).score);
  });

  it('rejects a trace that stops early', () => {
    expect(drawingFeatures('spiral', [trace(0)[0]!.slice(0, 40)]).problems).toContain('incomplete_trace');
  });
});

describe('finger tapping', () => {
  const hand = (gap: number): Lm[] => {
    const lm: Lm[] = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5 }));
    lm[0] = { x: 0.5, y: 0.8 };
    lm[9] = { x: 0.5, y: 0.6 };
    lm[4] = { x: 0.5 - gap / 2, y: 0.4 };
    lm[8] = { x: 0.5 + gap / 2, y: 0.4 };
    return lm;
  };

  it('counts taps and their rate', () => {
    const counter = new TapCounter();
    // 4 taps per second for 5 seconds at 30 frames per second.
    for (let f = 0; f < 150; f++) counter.push((f * 1000) / 30, hand(0.09 * (1 + Math.cos((f / 30) * 4 * 2 * Math.PI))));
    expect(counter.count).toBeGreaterThanOrEqual(19);
    expect(counter.count).toBeLessThanOrEqual(21);
    expect(counter.metrics().taps_per_sec).toBeCloseTo(4, 0);
    expect(counter.metrics().interval_cv).toBeLessThan(0.1);
  });
});

describe('sleep and medication', () => {
  it('handles nights that cross midnight', () => {
    expect(sleepHours('23:30', '06:00')).toBe(6.5);
    const night = toSleepEntry({ date: '2026-10-10', bedtime: '22:30', wakeTime: '06:30', awakenings: 4, actedOutDreams: true, vocalised: false, source: 'manual' });
    expect(night.rbdFlag).toBe(true);
    expect(night.score).toBeLessThan(75);
  });

  it('matches doses to schedule slots and marks the rest', () => {
    const med: Medication = { id: 'm1', name: 'Levodopa', dose: 100, unit: 'mg', times: ['08:00', '13:00', '18:00'], levodopa: true, active: true, createdAt: now };
    const minutes = (iso: string): number => new Date(iso).getUTCHours() * 60 + new Date(iso).getUTCMinutes();
    const doses = [{ id: 'd1', medicationId: 'm1', medicationName: 'Levodopa', levodopa: true, takenAt: '2026-10-11T08:10:00.000Z' }];
    const slots = daySchedule([med], doses, 15 * 60, minutes);
    expect(slots.map((s) => s.status)).toEqual(['taken', 'missed', 'upcoming']);
  });

  it('finds when off periods cluster and how long a dose lasts', () => {
    const day = (d: number, h: number, m = 0): string => new Date(Date.UTC(2026, 9, d, h, m)).toISOString();
    const doses = [1, 2, 3].map((d) => ({ id: `d${d}`, medicationId: 'm1', medicationName: 'Levodopa', levodopa: true, takenAt: day(d, 13) }));
    const symptoms = [1, 2, 3].flatMap((d) => [
      { id: `a${d}`, at: day(d, 13, 45), state: 'on' as const, tremor: 1, stiffness: 1, slowness: 1 },
      { id: `b${d}`, at: day(d, 16, 30), state: 'off' as const, tremor: 3, stiffness: 2, slowness: 3 },
    ]);
    const out = medicationInsights(doses, symptoms, 3, (iso) => new Date(iso).getUTCHours());
    expect(out.kickInMinutes).toBe(45);
    expect(out.wearingOffMinutes).toBe(210);
    expect(out.peakOffWindow?.reports).toBe(3);
    expect(out.adherencePct).toBe(100);
  });
});
