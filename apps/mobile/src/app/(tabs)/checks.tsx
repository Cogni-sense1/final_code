import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { type AssessmentType, BASELINE_MIN, MODALITIES } from '@neurovoice/shared';
import { api, useLoad } from '@/lib/api';
import { C } from '@/theme';
import { Card, ErrorNote, H1, Icon, Label, Loading, Screen, Soft, StatusPill } from '@/ui';

/** Checks that run natively today. The camera checks still live in the web app. */
const NATIVE: { type: AssessmentType; href: string; icon: 'mic' | 'pen' }[] = [
  { type: 'voice', href: '/check/voice', icon: 'mic' },
  { type: 'spiral', href: '/check/draw/spiral', icon: 'pen' },
  { type: 'wave', href: '/check/draw/wave', icon: 'pen' },
  { type: 'clock', href: '/check/draw/clock', icon: 'pen' },
];
const ON_WEB: AssessmentType[] = ['face', 'tap', 'gait', 'lsvt'];
const keyOf = (type: AssessmentType): string => (type === 'voice' ? 'voice:vowel' : type);

export default function Checks() {
  const { data, error, loading, reload } = useLoad(() => api.overview());
  useFocusEffect(useCallback(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []));
  if (loading && !data) return <Loading />;
  if (error || !data) return <Screen><ErrorNote>{error}</ErrorNote></Screen>;

  return (
    <Screen>
      <H1>Checks</H1>
      <Soft style={{ marginTop: 4 }}>Each one is compared with your own baseline.</Soft>
      <Label>On this phone</Label>
      <View style={{ gap: 10 }}>
        {NATIVE.map(({ type, href, icon }) => {
          const last = data.latest[keyOf(type)];
          const sessions = data.baselines.find((b) => b.key === keyOf(type))?.sessions ?? 0;
          const doneToday = !!data.todayProfile?.modalities[keyOf(type)];
          return (
            <Card key={type} onPress={() => router.push(href)} style={styles.row}>
              <View style={[styles.badge, { backgroundColor: doneToday ? C.goodSoft : C.brandSoft }]}>
                <Icon name={doneToday ? 'check' : icon} color={doneToday ? C.good : C.brandDeep} width={doneToday ? 3 : 2} />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.title}>{MODALITIES[type].name}</Text>
                <Soft>{MODALITIES[type].blurb}</Soft>
                {last && (last.deviation.status === 'building'
                  ? <Text style={styles.baseline}>Baseline {Math.min(sessions, BASELINE_MIN)} of {BASELINE_MIN}</Text>
                  : <StatusPill status={last.deviation.status} />)}
              </View>
              <Icon name="right" color={C.inkFaint} />
            </Card>
          );
        })}
      </View>
      <Label>In the web app for now</Label>
      <Card style={{ gap: 6 }}>
        {ON_WEB.map((type) => <Text key={type} style={styles.web}>{MODALITIES[type].name}</Text>)}
        <Soft style={{ marginTop: 6 }}>These use the camera to track your face, hands, or body. They run in the browser today and are coming to this app.</Soft>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14 },
  badge: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '700', color: C.ink },
  baseline: { color: C.calm, fontWeight: '700', fontSize: 14 },
  web: { fontSize: 17, fontWeight: '600', color: C.ink },
});
