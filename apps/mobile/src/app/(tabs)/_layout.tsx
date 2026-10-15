import { Redirect, Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';
import { useAuth } from '@/lib/api';
import { C } from '@/theme';
import { Icon } from '@/ui';

export default function TabsLayout() {
  const { profile } = useAuth();
  if (!profile) return <Redirect href="/sign-in" />;
  if (profile.role === 'patient' && !profile.consent) return <Redirect href="/consent" />;

  const tab = (title: string, name: Parameters<typeof Icon>[0]['name']) => ({
    title,
    tabBarIcon: ({ color }: { color: ColorValue }) => <Icon name={name} color={color} />,
  });
  return (
    <Tabs screenOptions={{
      headerShown: false, tabBarActiveTintColor: C.brandDeep, tabBarInactiveTintColor: C.inkFaint,
      tabBarStyle: { backgroundColor: C.white, borderTopColor: C.line, height: 64, paddingTop: 6 }, tabBarLabelStyle: { fontSize: 12, fontWeight: '700' },
      sceneStyle: { backgroundColor: C.paper },
    }}>
      <Tabs.Screen name="index" options={tab('Today', 'home')} />
      <Tabs.Screen name="checks" options={tab('Checks', 'checks')} />
      <Tabs.Screen name="companion" options={tab('Talk', 'chat')} />
      <Tabs.Screen name="account" options={tab('Account', 'user')} />
    </Tabs>
  );
}
