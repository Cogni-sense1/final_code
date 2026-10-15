import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { DISCLAIMER, STATUS_COPY } from '@neurovoice/shared';
import { api, useLoad, useProfile } from '@/lib/api';
import { C, TONE } from '@/theme';
import { Button, Card, ErrorNote, H1, Icon, Label, Loading, Screen, Soft, Spark } from '@/ui';

const CORE = [
  { key: 'voice:vowel', href: '/check/voice', label: 'Voice', hint: 'Two short recordings', icon: 'mic' },
  { key: 'spiral', href: '/check/draw/spiral', label: 'Spiral drawing', hint: 'Trace with one finger', icon: 'pen' },
] as const;

const greeting = (): string => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};
const time12 = (hhmm: string): string => {
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h! + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h! < 12 ? 'am' : 'pm'}`;
};

export default function Today() {
  const profile = useProfile();
  const { data, error, loading, reload } = useLoad(() => api.overview());
  const [logging, setLogging] = useState('');
  // Coming back from a check should show it as done.
  useFocusEffect(useCallback(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []));

  if (loading && !data) return <Loading />;
  if (error || !data) return <Screen><ErrorNote>{error}</ErrorNote></Screen>;

  const today = data.todayProfile;
  const status = today?.status ?? 'building';
  const done = CORE.filter((c) => today?.modalities[c.key]).length;
  const due = data.schedule.filter((s) => s.status === 'due' || s.status === 'missed');

  async function take(medicationId: string, time: string) {
    setLogging(medicationId + time);
    await api.logDose(medicationId, time).catch(() => undefined);
    setLogging('');
    reload();
  }

  return (
    <Screen>
      <Soft>{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</Soft>
      <H1 style={{ marginBottom: 16 }}>{greeting()}, {profile.name.split(' ')[0]}</H1>

      <Card tint={C.navy} style={{ padding: 22 }}>
        <Text style={styles.heroLabel}>TODAY{profile.synthetic ? '  ·  DEMO DATA' : ''}</Text>
        <Text style={styles.heroTitle}>
          {done === 0 ? 'Ready when you are' : today?.composite == null ? 'Building your baseline' : STATUS_COPY[status].label}
        </Text>
        <Text style={styles.heroText}>{done === 0 ? 'A couple of quick checks, about two minutes.' : 'Compared with your own baseline, not other people.'}</Text>
        <View style={styles.heroRow}>
          <Text style={styles.streak}>{data.streak ? `${data.streak} day streak` : 'Start a streak today'}</Text>
          <Spark values={data.days.slice(-14).map((d) => d.composite)} color={status === 'building' ? C.brandMid : TONE[status].fg === C.good ? '#5FD3A9' : C.brand} />
        </View>
      </Card>

      <Label>Today's checks</Label>
      <View style={{ gap: 10 }}>
        {CORE.map((c) => {
          const isDone = !!today?.modalities[c.key];
          return (
            <Card key={c.key} onPress={() => router.push(c.href)} style={styles.row}>
              <View style={[styles.badge, { backgroundColor: isDone ? C.goodSoft : C.brandSoft }]}>
                <Icon name={isDone ? 'check' : c.icon} color={isDone ? C.good : C.brandDeep} width={isDone ? 3 : 2} />
              </View>
              <View style={{ flex: 1 }}><Text style={styles.rowTitle}>{c.label}</Text><Soft>{isDone ? 'Done today' : c.hint}</Soft></View>
              <Icon name="right" color={C.inkFaint} />
            </Card>
          );
        })}
      </View>

      {due.length > 0 && (
        <>
          <Label>Medication</Label>
          <View style={{ gap: 10 }}>
            {due.map((s) => (
              <Card key={s.medicationId + s.time} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{s.name}</Text>
                  <Text style={{ color: s.status === 'missed' ? C.alert : C.warn, fontWeight: '700' }}>{s.status === 'missed' ? 'Not logged' : 'Due now'} · {time12(s.time)}</Text>
                </View>
                <Button title="Taken" onPress={() => void take(s.medicationId, s.time)} busy={logging === s.medicationId + s.time} style={{ minHeight: 46 }} />
              </Card>
            ))}
          </View>
        </>
      )}
      <Text style={styles.small}>{DISCLAIMER}</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heroLabel: { color: 'rgba(255,255,255,.6)', fontSize: 12, fontWeight: '800', letterSpacing: 1.2 },
  heroTitle: { color: C.white, fontSize: 24, fontWeight: '800', marginTop: 6 },
  heroText: { color: 'rgba(255,255,255,.7)', fontSize: 15, marginTop: 4 },
  heroRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, paddingTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,.12)' },
  streak: { color: C.white, fontWeight: '700', fontSize: 15 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14 },
  badge: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 18, fontWeight: '700', color: C.ink },
  small: { marginTop: 28, textAlign: 'center', fontSize: 12, lineHeight: 18, color: C.inkFaint },
});
