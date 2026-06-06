import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

interface RiskRingProps {
  score: number; // 0–1
  color: string;
  size?: number;
  label?: string;
}

export const RiskRing: React.FC<RiskRingProps> = ({
  score,
  color,
  size = 192,
  label,
}) => {
  const clampedScore = Math.min(1, Math.max(0, score));
  const radius = 80;
  const circumference = 502.7; // 2 * Math.PI * 80 ≈ 502.65
  const strokeWidth = 16;
  const center = size / 2;

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        {/* Background circle */}
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke="#E0E0E0"
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Colored arc */}
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={[clampedScore * circumference, circumference]}
          strokeLinecap="round"
          rotation="-90"
          origin={`${center}, ${center}`}
        />
      </Svg>
      <View style={styles.labelContainer}>
        <Text style={styles.percentText}>
          {Math.round(clampedScore * 100)}%
        </Text>
        {label ? <Text style={styles.labelText}>{label}</Text> : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  percentText: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  labelText: {
    fontSize: 12,
    color: '#6B6B6B',
    marginTop: 2,
  },
});

export default RiskRing;
