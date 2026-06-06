import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { colors } from '../constants/colors';

const NUM_BARS = 15;
const MIN_HEIGHT = 4;
const MAX_HEIGHT = 40;
const BAR_WIDTH = 4;
const BAR_SPACING = 3;

interface WaveformBarsProps {
  isRecording: boolean;
  color?: string;
}

export const WaveformBars: React.FC<WaveformBarsProps> = ({
  isRecording,
  color,
}) => {
  const animatedValues = useRef(
    Array.from({ length: NUM_BARS }, () => new Animated.Value(MIN_HEIGHT))
  ).current;

  const animationsRef = useRef<Animated.CompositeAnimation[]>([]);

  useEffect(() => {
    if (isRecording) {
      animationsRef.current = animatedValues.map((anim, i) => {
        const phaseOffset = (i / NUM_BARS) * 600;
        const loop = Animated.loop(
          Animated.sequence([
            Animated.delay(phaseOffset),
            Animated.timing(anim, {
              toValue: MIN_HEIGHT + Math.random() * (MAX_HEIGHT - MIN_HEIGHT),
              duration: 300 + Math.random() * 200,
              useNativeDriver: false,
            }),
            Animated.timing(anim, {
              toValue: MIN_HEIGHT,
              duration: 300 + Math.random() * 200,
              useNativeDriver: false,
            }),
          ])
        );
        loop.start();
        return loop;
      });
    } else {
      animationsRef.current.forEach((anim) => anim.stop());
      animatedValues.forEach((anim) => {
        Animated.timing(anim, {
          toValue: MIN_HEIGHT,
          duration: 200,
          useNativeDriver: false,
        }).start();
      });
    }

    return () => {
      animationsRef.current.forEach((anim) => anim.stop());
    };
  }, [isRecording]);

  const barColor = color ?? (isRecording ? colors.primary : colors.muted);

  return (
    <View style={styles.container}>
      {animatedValues.map((anim, i) => (
        <Animated.View
          key={i}
          style={[
            styles.bar,
            {
              height: anim,
              backgroundColor: barColor,
            },
          ]}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    height: MAX_HEIGHT,
  },
  bar: {
    width: BAR_WIDTH,
    borderRadius: BAR_WIDTH / 2,
    marginHorizontal: BAR_SPACING / 2,
  },
});

export default WaveformBars;
