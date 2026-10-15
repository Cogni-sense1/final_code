import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@/lib/api';
import { C } from '@/theme';

/** Checks record health data, so they need a signed-in person who has consented. */
export default function CheckLayout() {
  const { profile } = useAuth();
  if (!profile) return <Redirect href="/sign-in" />;
  if (profile.role === 'patient' && !profile.consent) return <Redirect href="/consent" />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.paper } }} />;
}
