import { Redirect } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { api, errorText, useAuth } from '@/lib/api';
import { C } from '@/theme';
import { Body, Button, Card, ErrorNote, H1, Screen, Soft } from '@/ui';

const POINTS = [
  ['Voice is measured, then discarded', 'Recordings are analysed and deleted unless you choose to keep them.'],
  ['You decide who sees your data', 'Family or doctors can only see it with a code you give them.'],
  ['Leave whenever you want', 'You can download or permanently erase everything.'],
] as const;

export default function Consent() {
  const { profile, setProfile, signOut } = useAuth();
  const [share, setShare] = useState(true);
  const [storeAudio, setStoreAudio] = useState(false);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!profile) return <Redirect href="/sign-in" />;
  if (profile.consent) return <Redirect href="/" />;

  async function accept() {
    setBusy(true);
    setError('');
    try {
      setProfile(await api.consent({ storeAudio, shareWithCareTeam: share }));
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <Screen>
      <H1 style={{ marginTop: 16 }}>Hello {profile.name.split(' ')[0]}. Before we start</H1>
      <Soft style={{ marginTop: 6, marginBottom: 18 }}>Here is exactly what NeuroVoice does with your information.</Soft>
      <View style={{ gap: 10 }}>
        {POINTS.map(([title, text]) => (
          <Card key={title}><Text style={styles.title}>{title}</Text><Soft>{text}</Soft></Card>
        ))}
        <Card style={{ gap: 14 }}>
          <View style={styles.row}><Body style={styles.flex}>Let me invite family or my doctor</Body><Switch value={share} onValueChange={setShare} trackColor={{ true: C.brand }} /></View>
          <View style={styles.row}><Body style={styles.flex}>Keep my voice recordings for 30 days</Body><Switch value={storeAudio} onValueChange={setStoreAudio} trackColor={{ true: C.brand }} /></View>
        </Card>
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: agree }} onPress={() => setAgree(!agree)} style={styles.agree}>
          <View style={[styles.box, agree && styles.boxOn]}>{agree ? <Text style={styles.tick}>✓</Text> : null}</View>
          <Text style={styles.agreeText}>I understand NeuroVoice is a screening and monitoring aid, not a diagnosis, and I agree to my data being used as described above.</Text>
        </Pressable>
        {error ? <ErrorNote>{error}</ErrorNote> : null}
        <Button title="Start" onPress={accept} busy={busy} disabled={!agree} />
        <Button title="Sign out" variant="secondary" onPress={() => void signOut()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 17, fontWeight: '700', color: C.ink, marginBottom: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flex: { flex: 1 },
  agree: { flexDirection: 'row', gap: 12, backgroundColor: C.navy, borderRadius: 20, padding: 16, alignItems: 'flex-start' },
  box: { width: 26, height: 26, borderRadius: 7, borderWidth: 2, borderColor: C.brandMid, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  boxOn: { backgroundColor: C.brand, borderColor: C.brand },
  tick: { color: C.white, fontWeight: '800', fontSize: 16 },
  agreeText: { flex: 1, color: C.white, fontSize: 15, lineHeight: 22 },
});
