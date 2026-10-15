import type { DeviationStatus } from '@neurovoice/shared';

/** The same palette as the web app, so both feel like one product. */
export const C = {
  paper: '#F6F2EC', white: '#FFFFFF', line: '#E9E3DA',
  ink: '#1B1F2A', inkSoft: '#4A5160', inkFaint: '#8A909C',
  navy: '#1F2A44', navyDeep: '#161E33',
  brand: '#F0803C', brandDeep: '#D2641F', brandSoft: '#FFF1E6', brandMid: '#FFD9BF',
  good: '#23876A', goodSoft: '#E3F5EE', warn: '#B8731A', warnSoft: '#FCF1DC',
  alert: '#C4423E', alertSoft: '#FBE6E4', calm: '#5B6B8C', calmSoft: '#EEF1F6',
} as const;

export const TONE: Record<DeviationStatus, { fg: string; bg: string }> = {
  building: { fg: C.calm, bg: C.calmSoft },
  steady: { fg: C.good, bg: C.goodSoft },
  watch: { fg: C.warn, bg: C.warnSoft },
  changed: { fg: C.alert, bg: C.alertSoft },
};
