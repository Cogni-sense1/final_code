import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { type Assessment, BASELINE_MIN, MODALITIES, PROBLEM_COPY, STATUS_COPY, trackedFeatures } from '@neurovoice/shared';
import { C, TONE } from '@/theme';
import { Button, Card, H1, Icon, Soft } from '@/ui';

const TEXT: Record<Assessment['deviation']['status'], string> = {
  building: '',
  steady: 'Today looks like your usual. Keep going, the daily habit is what makes changes visible.',
  watch: 'A bit different from your usual today. One day on its own does not mean much. Tiredness, a cold, or a noisy room can do this.',
  changed: 'Noticeably different from your usual today. If this continues over several days we will let you know, and it may be worth mentioning to your doctor.',
};

export function Result({ assessment: a, onAgain }: { assessment: Assessment; onAgain: () => void }) {
  const d = a.deviation;
  const tone = TONE[d.status];
  const z = new Map(d.drivers.map((x) => [x.key, x.z]));
  const shown = trackedFeatures(a.type, a.task).filter((f) => a.features[f.key] !== undefined);
  return (
    <View style={{ gap: 12 }}>
      <Card tint={tone.bg} style={{ padding: 22 }}>
        <View style={styles.tick}><Icon name="check" color={tone.fg} width={3} /></View>
        <Text style={[styles.status, { color: tone.fg }]}>{STATUS_COPY[d.status].label}</Text>
        <Soft style={{ marginTop: 6 }}>
          {d.status === 'building'
            ? `That is ${Math.min(d.sessionsInBaseline, BASELINE_MIN)} of ${BASELINE_MIN} sessions needed to learn what is usual for you. After that, each check is compared with your own baseline.`
            : TEXT[d.status]}
        </Soft>
      </Card>
      <Card>
        <Text style={styles.heading}>WHAT WE MEASURED</Text>
        {shown.map((f, i) => {
          const off = z.get(f.key);
          return (
            <View key={f.key} style={[styles.row, i > 0 && styles.divider]}>
              <Text style={styles.name}>{f.label}</Text>
              <Text style={styles.value}>{a.features[f.key]!.toFixed(f.dp ?? 2)} <Text style={styles.unit}>{f.unit}</Text></Text>
              {off !== undefined && <Text style={[styles.tag, off >= 1 ? styles.tagOff : styles.tagOk]}>{off >= 1 ? 'off usual' : 'usual'}</Text>}
            </View>
          );
        })}
        {a.reference.findings.map((f) => <Soft key={f} style={{ marginTop: 8 }}>{f}</Soft>)}
      </Card>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
        <Button title="Repeat" variant="secondary" onPress={onAgain} />
        <Button title="Done" onPress={() => router.back()} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

export function Unusable({ problems, onRetry }: { problems: string[]; onRetry: () => void }) {
  return (
    <View style={{ gap: 12 }}>
      <H1>Let's try that once more</H1>
      {(problems.length ? problems : ['unknown']).map((p) => <Soft key={p} style={{ fontSize: 17 }}>{PROBLEM_COPY[p] ?? 'We could not get a clear reading.'}</Soft>)}
      <Soft>This attempt was not added to your trend.</Soft>
      <Button title="Try again" onPress={onRetry} />
    </View>
  );
}

export const checkTitle = (a: Assessment): string => MODALITIES[a.type].name;

const styles = StyleSheet.create({
  tick: { width: 48, height: 48, borderRadius: 24, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center' },
  status: { fontSize: 24, fontWeight: '800', marginTop: 14 },
  heading: { fontSize: 13, fontWeight: '800', color: C.inkFaint, letterSpacing: 1, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  divider: { borderTopWidth: 1, borderTopColor: C.line },
  name: { flex: 1, fontSize: 16, fontWeight: '600', color: C.ink },
  value: { fontSize: 16, fontWeight: '800', color: C.ink },
  unit: { fontSize: 13, fontWeight: '600', color: C.inkFaint },
  tag: { fontSize: 12, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99, overflow: 'hidden' },
  tagOk: { backgroundColor: C.goodSoft, color: C.good },
  tagOff: { backgroundColor: C.warnSoft, color: C.warn },
});
