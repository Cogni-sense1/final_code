import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

const FingerTappingTest = () => {
  const [testDuration, setTestDuration] = useState(15000); // default 15 seconds
  const [metronomeMode, setMetronomeMode] = useState(false);
  const [taps, setTaps] = useState([]);
  const [handUsed, setHandUsed] = useState('L'); // initial hand is left

  const handleTap = (x, y, duration) => {
    const tap = {
      timestamp: Date.now(),
      handUsed,
      x,
      y,
      duration,
    };
    setTaps((prevTaps) => [...prevTaps, tap]);
  };

  const calculateFeatures = () => {
    // Tap Frequency:
    const leftFrequency = taps.filter((tap) => tap.handUsed === 'L').length / (testDuration / 1000);
    const rightFrequency = taps.filter((tap) => tap.handUsed === 'R').length / (testDuration / 1000);

    // Inter-Tap Interval (ITI):
    const itiValues = taps.map((tap, index) => tap.timestamp - (index > 0 ? taps[index - 1].timestamp : 0));
    const meanIti = itiValues.reduce((acc, val) => acc + val, 0) / itiValues.length;
    const cv = Math.sqrt(itiValues.reduce((acc, val) => acc + Math.pow(val - meanIti, 2), 0) / itiValues.length);

    // Coefficient of Variation (CV):
    const leftCv = Math.sqrt(taps.filter((tap) => tap.handUsed === 'L').map((tap, index) => tap.timestamp - (index > 0 ? taps[index - 1].timestamp : 0)).reduce((acc, val) => acc + Math.pow(val - meanIti, 2), 0) / itiValues.length);
    const rightCv = Math.sqrt(taps.filter((tap) => tap.handUsed === 'R').map((tap, index) => tap.timestamp - (index > 0 ? taps[index - 1].timestamp : 0)).reduce((acc, val) => acc + Math.pow(val - meanIti, 2), 0) / itiValues.length);

    // Inter-Hand Asymmetry:
    const asymmetry = Math.abs(leftFrequency - rightFrequency);

    // Alternation Accuracy:
    let correctAlternations = 0;
    for (let i = 1; i < taps.length; i++) {
      if ((taps[i].handUsed === 'R' && taps[i - 1].handUsed === 'L') || (taps[i].handUsed === 'L' && taps[i - 1].handUsed === 'R')) {
        correctAlternations++;
      }
    }
    const alternationAccuracy = (correctAlternations / (taps.length - 1)) * 100;

    // Dwell Time:
    const dwellTimeAvg = taps.reduce((acc, tap) => acc + tap.duration, 0) / taps.length;

    // Fatigue Index:
    const earlyTaps = taps.slice(0, taps.length / 2);
    const lateTaps = taps.slice(taps.length / 2);
    const meanItiEarly = earlyTaps.reduce((acc, tap) => acc + (tap.timestamp - (earlyTaps[earlyTaps.indexOf(tap) - 1].timestamp)), 0) / earlyTaps.length;
    const meanItiLate = lateTaps.reduce((acc, tap) => acc + (tap.timestamp - (lateTaps[lateTaps.indexOf(tap) - 1].timestamp)), 0) / lateTaps.length;
    const fatigueIndex = meanItiLate - meanItiEarly;

    return {
      tap_speed_left: leftFrequency,
      tap_speed_right: rightFrequency,
      cv_left: leftCv,
      cv_right: rightCv,
      asymmetry,
      alternation_accuracy: alternationAccuracy,
      fatigue_index: fatigueIndex,
      dwell_time_avg: dwellTimeAvg,
    };
  };

  return (
    <View style={styles.container}>
      <Text>Tap using the corresponding hands:</Text>
      <View style={styles.tapZone} />
      {handUsed === 'L' ? (
        <TouchableOpacity
          onPress={() => {
            handleTap(x, y, duration);
            setHandUsed('R');
          }}
          style={styles.tapButton}
        >
          <Text>Right Hand</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          onPress={() => {
            handleTap(x, y, duration);
            setHandUsed('L');
          }}
          style={styles.tapButton}
        >
          <Text>Left Hand</Text>
        </TouchableOpacity>
      )}
      {metronomeMode && (
        <View style={styles.metronomeContainer}>
          <Text>Metronome: 60 beats per minute</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tapZone: {
    height: 200,
    width: '100%',
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tapButton: {
    padding: 10,
    borderRadius: 5,
    backgroundColor: '#4CAF50',
    borderWidth: 1,
    borderColor: '#000',
  },
  metronomeContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
});