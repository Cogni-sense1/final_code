import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, type ColorValue, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Polyline } from 'react-native-svg';
import { type DeviationStatus, STATUS_COPY } from '@neurovoice/shared';
import { C, TONE } from './theme';

// ── Layout ───────────────────────────────────────────────────────────────────

export function Screen({ children, scroll = true, style }: { children: ReactNode; scroll?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {scroll
        ? <ScrollView contentContainerStyle={[styles.pad, style]} keyboardShouldPersistTaps="handled">{children}</ScrollView>
        : <View style={[styles.pad, styles.fill, style]}>{children}</View>}
    </SafeAreaView>
  );
}

export function Card({ children, style, onPress, tint }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; tint?: string }) {
  const body = [styles.card, tint ? { backgroundColor: tint } : null, style];
  return onPress
    ? <Pressable onPress={onPress} style={({ pressed }) => [...body, pressed && styles.pressed]}>{children}</Pressable>
    : <View style={body}>{children}</View>;
}

// ── Text ─────────────────────────────────────────────────────────────────────

export const H1 = ({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) => <Text style={[styles.h1, style]}>{children}</Text>;
export const H2 = ({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) => <Text style={[styles.h2, style]}>{children}</Text>;
export const Body = ({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) => <Text style={[styles.body, style]}>{children}</Text>;
export const Soft = ({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) => <Text style={[styles.soft, style]}>{children}</Text>;
export const Label = ({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) => <Text style={[styles.label, style]}>{children}</Text>;

// ── Controls ─────────────────────────────────────────────────────────────────

type Variant = 'primary' | 'secondary' | 'dark' | 'danger';
const VARIANT: Record<Variant, { bg: string; fg: string; border?: string }> = {
  primary: { bg: C.brand, fg: C.white },
  dark: { bg: C.navy, fg: C.white },
  secondary: { bg: C.white, fg: C.ink, border: C.line },
  danger: { bg: C.alertSoft, fg: C.alert },
};

export function Button({ title, onPress, variant = 'primary', busy, disabled, style }: {
  title: string; onPress: () => void; variant?: Variant; busy?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const v = VARIANT[variant];
  const off = disabled || busy;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} disabled={off}
      style={({ pressed }) => [styles.button, { backgroundColor: v.bg, borderColor: v.border ?? v.bg }, off && styles.off, pressed && styles.pressed, style]}>
      {busy ? <ActivityIndicator color={v.fg} /> : <Text style={[styles.buttonText, { color: v.fg }]}>{title}</Text>}
    </Pressable>
  );
}

export function StatusPill({ status }: { status: DeviationStatus }) {
  const t = TONE[status];
  return (
    <View style={[styles.pill, { backgroundColor: t.bg }]}>
      <View style={[styles.dot, { backgroundColor: t.fg }]} />
      <Text style={[styles.pillText, { color: t.fg }]}>{STATUS_COPY[status].label}</Text>
    </View>
  );
}

export const Loading = () => <View style={styles.center}><ActivityIndicator size="large" color={C.brand} /></View>;
export const ErrorNote = ({ children }: { children: ReactNode }) => <Text accessibilityRole="alert" style={styles.error}>{children}</Text>;

// ── Icons and small charts (drawn inline so no icon font is needed) ───────────

const ICONS = {
  home: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  checks: 'M3 12h4l3-8 4 16 3-8h4',
  chat: 'M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z',
  user: 'M20 21a8 8 0 10-16 0M12 11a4 4 0 100-8 4 4 0 000 8z',
  mic: 'M12 15a3 3 0 003-3V6a3 3 0 10-6 0v6a3 3 0 003 3zM19 11a7 7 0 01-14 0M12 18v4',
  pen: 'M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4L16.5 3.5z',
  check: 'M5 13l4 4L19 7',
  right: 'M9 6l6 6-6 6',
  send: 'M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z',
  back: 'M15 6l-6 6 6 6',
  volume: 'M11 5L6 9H2v6h4l5 4V5zM15.5 8.5a5 5 0 010 7',
} as const;

export function Icon({ name, size = 24, color = C.ink, width = 2 }: { name: keyof typeof ICONS; size?: number; color?: ColorValue; width?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d={ICONS[name]} stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function Spark({ values, color, width = 120, height = 36 }: { values: (number | null)[]; color: string; width?: number; height?: number }) {
  const pts = values.map((v, i) => [i, v] as const).filter((p): p is readonly [number, number] => p[1] !== null);
  if (pts.length < 2) return <View style={{ width, height }} />;
  const lo = Math.min(-0.5, ...pts.map((p) => p[1]));
  const hi = Math.max(2.5, ...pts.map((p) => p[1]));
  const x = (i: number): number => (i / Math.max(values.length - 1, 1)) * (width - 6) + 3;
  const y = (v: number): number => height - 4 - ((v - lo) / (hi - lo)) * (height - 8);
  const last = pts[pts.length - 1]!;
  return (
    <Svg width={width} height={height}>
      <Polyline points={pts.map((p) => `${x(p[0])},${y(p[1])}`).join(' ')} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={x(last[0])} cy={y(last[1])} r={3.5} fill={color} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.paper },
  pad: { padding: 20, paddingBottom: 40, width: '100%', maxWidth: 560, alignSelf: 'center' },
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  card: { backgroundColor: C.white, borderRadius: 24, padding: 18, shadowColor: '#1B1F2A', shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  h1: { fontSize: 28, fontWeight: '800', color: C.ink, letterSpacing: -0.5 },
  h2: { fontSize: 19, fontWeight: '800', color: C.ink },
  body: { fontSize: 17, lineHeight: 25, color: C.ink },
  soft: { fontSize: 15, lineHeight: 21, color: C.inkSoft },
  label: { fontSize: 13, fontWeight: '800', color: C.inkFaint, textTransform: 'uppercase', letterSpacing: 1, marginTop: 26, marginBottom: 10 },
  button: { minHeight: 54, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  buttonText: { fontSize: 17, fontWeight: '700' },
  off: { opacity: 0.5 },
  pill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 7, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 6 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  pillText: { fontSize: 14, fontWeight: '700' },
  error: { backgroundColor: C.alertSoft, color: C.alert, borderRadius: 16, padding: 14, fontSize: 15, fontWeight: '600', overflow: 'hidden' },
});
