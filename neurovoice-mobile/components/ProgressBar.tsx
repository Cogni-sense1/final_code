import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { colors } from '../constants/colors';

interface ProgressBarProps {
  value: number; // 0–100
  color?: string;
  height?: number;
  style?: ViewStyle;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  color = colors.primary,
  height = 8,
  style,
}) => {
  const clampedValue = Math.min(100, Math.max(0, value));

  return (
    <View style={[styles.track, { height, borderRadius: height / 2 }, style]}>
      <View
        style={[
          styles.fill,
          {
            width: `${clampedValue}%`,
            backgroundColor: color,
            height,
            borderRadius: height / 2,
          },
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  track: {
    width: '100%',
    backgroundColor: colors.borderColor,
    overflow: 'hidden',
  },
  fill: {
    // dynamic styles applied inline
  },
});

export default ProgressBar;
