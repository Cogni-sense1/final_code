// RoleSelection — auto-selects 'user' role and navigates to /welcome
// Web behavior: no role cards shown, just auto-navigates

import { useEffect } from 'react';
import { router } from 'expo-router';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { setUserRole } from '../utils/storage';

export default function RoleSelection() {
  useEffect(() => {
    (async () => {
      await setUserRole('user');
      router.replace('/welcome');
    })();
  }, []);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#FF8C42" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#EFEBE6',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
