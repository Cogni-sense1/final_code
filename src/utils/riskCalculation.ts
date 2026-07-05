import { RiskResult } from '@/types/mediapipe';
import { scoreFace } from '@/utils/clinicalMetrics';

/**
 * Facial screening risk from FaceMesh-derived signals.
 *
 * Delegates to the research-grounded scoring in clinicalMetrics.ts
 * (MDS-UPDRS 3.2 facial-expression / hypomimia markers):
 *   - blinkRate  : spontaneous blinks per minute (reduced in PD)
 *   - rigidity   : mean facial expression motion amplitude (reduced = hypomimia)
 *   - asymmetry  : facial asymmetry (weighted low; PD is typically bilateral)
 *
 * `rigidity` is the raw normalised facial-motion value (~0.001–0.005 range);
 * the previous implementation multiplied it by 1000 for display only.
 */
export const calculateRiskFromSignals = (
  blinkRate: number,
  rigidity: number,
  asymmetry: number
): RiskResult => {
  const clinical = scoreFace({
    blinkRate,
    expressionAmplitude: rigidity,
    asymmetry,
  });

  const colorMap: Record<string, string> = {
    Low: '#5DBEA3',
    Medium: '#FF9F43',
    High: '#FF8C42',
  };

  return {
    percentage: clinical.score,
    level: clinical.level,
    color: colorMap[clinical.level],
    details: {
      blinkRate,
      // keep the ×1000 scaled value for existing UI thresholds/labels
      motion: rigidity * 1000,
      asymmetry,
    },
  };
};
