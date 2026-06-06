import { Stack, router, useSegments } from 'expo-router';
import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { getUserRole, hasCompletedOnboarding } from '../utils/storage';
import { colors } from '../constants/colors';

export default function RootLayout() {
  const [authChecked, setAuthChecked] = useState(false);
  const segments = useSegments();

  useEffect(() => {
    async function checkAuth() {
      try {
        const [role, onboarded] = await Promise.all([
          getUserRole(),
          hasCompletedOnboarding(),
        ]);

        if (!role) {
          router.replace('/');
        } else if (!onboarded) {
          router.replace('/welcome');
        } else if (role === 'doctor') {
          router.replace('/doctor');
        } else if (role === 'caregiver') {
          router.replace('/caregiver');
        } else {
          router.replace('/(tabs)/home');
        }
      } catch {
        router.replace('/');
      } finally {
        setAuthChecked(true);
      }
    }

    checkAuth();
  }, []);

  return (
    <>
      <Stack screenOptions={{ headerShown: false }} />
      {!authChecked && (
        <View style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          justifyContent: 'center', alignItems: 'center',
          backgroundColor: colors.background,
        }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      )}
    </>
  );
}
