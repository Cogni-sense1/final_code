import { calculateRiskFromSignals, RiskResult } from './riskCalculation';

describe('calculateRiskFromSignals', () => {
  it('returns Low risk for healthy signals', () => {
    const result = calculateRiskFromSignals(18, 0.005, 0.02);
    expect(result.level).toBe('Low');
    expect(result.percentage).toBe(0);
    expect(result.color).toBe('#5DBEA3');
  });

  it('returns High risk for severely abnormal signals', () => {
    // blinkRate < 4 → 40pts, motion*1000 < 0.6 → 35pts, asymmetry >= 0.07 → 25pts
    const result = calculateRiskFromSignals(1, 0.0001, 0.08);
    expect(result.level).toBe('High');
    expect(result.percentage).toBe(100);
    expect(result.color).toBe('#FF8C42');
  });

  it('returns Medium risk for moderate signals', () => {
    // blinkRate 7-9 → 28pts, motion*1000 ~1.2 → 15pts, asymmetry < 0.035 → 0pts = 43 → Medium
    const result = calculateRiskFromSignals(8, 0.0012, 0.02);
    expect(result.level).toBe('Medium');
    expect(result.percentage).toBeGreaterThanOrEqual(20);
    expect(result.percentage).toBeLessThan(45);
  });

  it('populates details correctly', () => {
    const result = calculateRiskFromSignals(15, 0.003, 0.04);
    expect(result.details.blinkRate).toBe(15);
    expect(result.details.motion).toBeCloseTo(3.0);
    expect(result.details.asymmetry).toBe(0.04);
  });

  it('returns a RiskResult with all required fields', () => {
    const result: RiskResult = calculateRiskFromSignals(12, 0.002, 0.03);
    expect(typeof result.percentage).toBe('number');
    expect(['Low', 'Medium', 'High']).toContain(result.level);
    expect(typeof result.color).toBe('string');
    expect(result.details).toHaveProperty('blinkRate');
    expect(result.details).toHaveProperty('motion');
    expect(result.details).toHaveProperty('asymmetry');
  });

  it('percentage is always between 0 and 100', () => {
    const cases: [number, number, number][] = [
      [0, 0, 0],
      [20, 0.01, 0.01],
      [5, 0.0005, 0.1],
    ];
    for (const [b, m, a] of cases) {
      const result = calculateRiskFromSignals(b, m, a);
      expect(result.percentage).toBeGreaterThanOrEqual(0);
      expect(result.percentage).toBeLessThanOrEqual(100);
    }
  });
});
