import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';

const DrawingTasks = () => {
  const [task, setTask] = useState('Spiral'); // initial task is Spiral

  const handleStroke = (x, y) => {
    // record x, y coordinates and timestamp
  };

  const calculateFeatures = () => {
    switch (task) {
      case 'Spiral':
        // Radial Error:
        // Mean Error and Max Error
        // Tremor Amplitude:
        // Tremor Frequency:
        // Drawing Speed:
        // Smoothness:
        break;
      case 'Line Tracing':
        // Mean Deviation from path
        // Max deviation
        // Completion time
        // Path efficiency (actual path length / ideal path length)
        break;
      case 'Clock Drawing':
        // symmetry
        // completeness
        // approximate placement of numbers/hands
        break;
      default:
        throw new Error('Invalid task');
    }
  };

  return (
    <View style={styles.container}>
      {task === 'Spiral' && (
        <View>
          <Text>Spiral Drawing Test</Text>
          {/* display spiral guide */}
          <TouchableOpacity
            onPress={() => {
              handleStroke(x, y);
            }}
            style={styles.strokeButton}
          >
            <Text>Start Drawing</Text>
          </TouchableOpacity>
        </View>
      )}
      {task === 'Line Tracing' && (
        <View>
          <Text>Line Tracing Task</Text>
          {/* display straight and curved paths */}
          <TouchableOpacity
            onPress={() => {
              handleStroke(x, y);
            }}
            style={styles.strokeButton}
          >
            <Text>Start Drawing</Text>
          </TouchableOpacity>
        </View>
      )}
      {task === 'Clock Drawing' && (
        <View>
          <Text>Clock Drawing Task</Text>
          {/* display clock template */}
          <TouchableOpacity
            onPress={() => {
              handleStroke(x, y);
            }}
            style={styles.strokeButton}
          >
            <Text>Start Drawing</Text>
          </TouchableOpacity>
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
  strokeButton: {
    padding: 10,
    borderRadius: 5,
    backgroundColor: '#4CAF50',
    borderWidth: 1,
    borderColor: '#000',
  },
});