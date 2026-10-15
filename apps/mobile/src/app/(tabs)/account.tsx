import { StyleSheet, Text, View } from 'react-native';
import { voiceModelNote } from '@neurovoice/shared';
import { API_URL, useAuth, useProfile } from '@/lib/api';
import { C } from '@/theme';
import { Button, Card, H1, Label, Screen, Soft } from '@/ui';

export default function Account() {
  const profile = useProfile();
  const { signOut } = useAuth();
  return (
    <Screen>
      <H1>Account</H1>
      <Card style={{ marginTop: 16, gap: 4 }}>
        <Text style={styles.name}>{profile.name}</Text>
        <Soft>{profile.email}</Soft>
        <Soft>{profile.diagnosed ? `Hoehn & Yahr stage ${profile.hoehnYahr}` : 'No diagnosis recorded'}</Soft>
        {profile.synthetic ? <Text style={styles.demo}>DEMO DATA</Text> : null}
      </Card>

      <Label>Privacy</Label>
      <Card style={{ gap: 6 }}>
        <Soft>Care team sharing: {profile.consent?.shareWithCareTeam ? 'on' : 'off'}</Soft>
        <Soft>Keep voice recordings: {profile.consent?.storeAudio ? 'for 30 days' : 'no, deleted after measuring'}</Soft>
        <Soft style={{ marginTop: 6 }}>Change these, manage your care team, or download or delete your data in the web app.</Soft>
      </Card>

      <Label>About the voice score</Label>
      <Card><Soft>{voiceModelNote()}</Soft></Card>

      <View style={{ height: 24 }} />
      <Button title="Sign out" variant="secondary" onPress={() => void signOut()} />
      <Text style={styles.small}>Connected to {API_URL}</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  name: { fontSize: 20, fontWeight: '800', color: C.ink },
  demo: { alignSelf: 'flex-start', marginTop: 8, backgroundColor: C.navy, color: C.white, fontSize: 11, fontWeight: '800', letterSpacing: 1, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99, overflow: 'hidden' },
  small: { marginTop: 18, textAlign: 'center', fontSize: 12, color: C.inkFaint },
});
