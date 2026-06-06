export interface RiskResult {
  percentage: number;
  level: 'Low' | 'Medium' | 'High';
  color: string;
  details: {
    blinkRate: number;
    motion: number;
    asymmetry: number;
  };
}

export const calculateRiskFromSignals = (
  blinkRate: number,
  motion: number,
  asymmetry: number
): RiskResult => {
  let riskScore = 0;
  let blinkPoints = 0;
  let motionPoints = 0;
  let asymPoints = 0;

  // 1️⃣ BLINK RATE ANALYSIS (40% weight = 40 max points)
  if (blinkRate >= 17) {
    blinkPoints = 0;
  } else if (blinkRate >= 13) {
    blinkPoints = 0;
  } else if (blinkRate >= 10) {
    blinkPoints = 12;
  } else if (blinkRate >= 7) {
    blinkPoints = 28;
  } else if (blinkRate >= 4) {
    blinkPoints = 36;
  } else {
    blinkPoints = 40;
  }

  // 2️⃣ FACIAL MOTION ANALYSIS (35% weight = 35 max points)
  const motionScore = motion * 1000;

  if (motionScore >= 4.0) {
    motionPoints = 0;
  } else if (motionScore >= 2.5) {
    motionPoints = 0;
  } else if (motionScore >= 1.5) {
    motionPoints = 5;
  } else if (motionScore >= 1.0) {
    motionPoints = 15;
  } else if (motionScore >= 0.6) {
    motionPoints = 26;
  } else {
    motionPoints = 35;
  }

  // 3️⃣ ASYMMETRY ANALYSIS (25% weight = 25 max points)
  if (asymmetry < 0.035) {
    asymPoints = 0;
  } else if (asymmetry < 0.05) {
    asymPoints = 8;
  } else if (asymmetry < 0.07) {
    asymPoints = 16;
  } else {
    asymPoints = 25;
  }

  riskScore = blinkPoints + motionPoints + asymPoints;

  console.log('🔍 Risk Score Breakdown:', {
    'Blink Points': `${blinkPoints}/40 (rate: ${blinkRate.toFixed(1)}/min)`,
    'Motion Points': `${motionPoints}/35 (score: ${motionScore.toFixed(2)})`,
    'Asymmetry Points': `${asymPoints}/25 (value: ${asymmetry.toFixed(4)})`,
    'TOTAL RISK': `${riskScore}/100`,
  });

  const riskPercentage = Math.round(riskScore);

  let level: 'Low' | 'Medium' | 'High' = 'Low';
  let color = '#5DBEA3';

  if (riskPercentage >= 45) {
    level = 'High';
    color = '#FF8C42';
  } else if (riskPercentage >= 20) {
    level = 'Medium';
    color = '#FF9F43';
  }

  return {
    percentage: riskPercentage,
    level,
    color,
    details: {
      blinkRate,
      motion: motionScore,
      asymmetry,
    },
  };
};
