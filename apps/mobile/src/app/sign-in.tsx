import { Redirect } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { DISCLAIMER } from '@neurovoice/shared';
import { errorText, useAuth } from '@/lib/api';
import { C } from '@/theme';
import { Button, ErrorNote, H1, Screen, Soft } from '@/ui';

export default function SignIn() {
  const auth = useAuth();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (auth.profile) return <Redirect href="/" />;
  const cognito = auth.config?.authMode === 'cognito';

  async function submit() {
    setBusy(true);
    setError('');
    try {
      if (mode === 'in') await auth.signIn(email.trim(), password);
      else await auth.signUp({ email: email.trim(), password, name: name.trim(), role: 'patient' });
    } catch (err) {
      setError(errorText(err));
    }
    setBusy(false);
  }

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.brand}><View style={styles.mark}><Text style={styles.markText}>N</Text></View><Text style={styles.brandText}>NeuroVoice</Text></View>
        <H1>{mode === 'in' ? 'Welcome back' : 'Create your account'}</H1>
        <Soft style={{ marginTop: 6, marginBottom: 22 }}>{mode === 'in' ? 'Sign in to continue your daily checks.' : 'It takes less than a minute.'}</Soft>

        {cognito ? (
          <ErrorNote>This server signs people in with Amazon Cognito, which the mobile app does not support yet. Use the web app for now.</ErrorNote>
        ) : (
          <View style={{ gap: 12 }}>
            {mode === 'up' && <TextInput style={styles.input} placeholder="Your name" placeholderTextColor={C.inkFaint} value={name} onChangeText={setName} autoComplete="name" />}
            <TextInput style={styles.input} placeholder="Email" placeholderTextColor={C.inkFaint} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
            <TextInput style={styles.input} placeholder="Password" placeholderTextColor={C.inkFaint} value={password} onChangeText={setPassword} secureTextEntry onSubmitEditing={submit} />
            {error ? <ErrorNote>{error}</ErrorNote> : null}
            <Button title={mode === 'in' ? 'Sign in' : 'Create account'} onPress={submit} busy={busy} disabled={!email.trim() || !password || (mode === 'up' && !name.trim())} />
            <Pressable onPress={() => { setMode(mode === 'in' ? 'up' : 'in'); setError(''); }} style={{ padding: 12 }}>
              <Text style={styles.switch}>{mode === 'in' ? 'New here? Create an account' : 'Already have an account? Sign in'}</Text>
            </Pressable>
          </View>
        )}
        <Text style={styles.small}>{DISCLAIMER}</Text>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 24, marginBottom: 36 },
  mark: { width: 42, height: 42, borderRadius: 12, backgroundColor: C.navy, alignItems: 'center', justifyContent: 'center' },
  markText: { color: C.brand, fontSize: 22, fontWeight: '800' },
  brandText: { fontSize: 22, fontWeight: '800', color: C.ink },
  input: { backgroundColor: C.white, borderWidth: 1, borderColor: C.line, borderRadius: 14, paddingHorizontal: 16, minHeight: 54, fontSize: 17, color: C.ink },
  switch: { textAlign: 'center', color: C.brandDeep, fontWeight: '700', fontSize: 16 },
  small: { marginTop: 28, textAlign: 'center', fontSize: 12, lineHeight: 18, color: C.inkFaint },
});
