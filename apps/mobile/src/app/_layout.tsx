import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { API_URL, AuthProvider, useAuth } from '@/lib/api';
import { C } from '@/theme';
import { Button, H1, Loading, Screen, Soft } from '@/ui';

/**
 * Nothing below renders until the app knows whether someone is signed in. Without this,
 * a screen opened directly would redirect to sign-in before the saved session had loaded.
 */
function Routes() {
  const { ready, offline, retry } = useAuth();
  if (!ready) return <View style={{ flex: 1, backgroundColor: C.paper }}><Loading /></View>;
  if (offline) {
    return (
      <Screen scroll={false} style={{ justifyContent: 'center' }}>
        <H1>Can't reach NeuroVoice</H1>
        <Soft style={{ marginTop: 8 }}>The app tried {API_URL}. Check your connection. On a phone, that address must be your computer's, set as EXPO_PUBLIC_API_URL.</Soft>
        <View style={{ height: 20 }} />
        <Button title="Try again" onPress={retry} />
      </Screen>
    );
  }
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.paper } }} />;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <Routes />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
