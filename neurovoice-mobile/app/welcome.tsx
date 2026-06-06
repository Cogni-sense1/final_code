// Welcome screen — matches web Welcome.tsx exactly
// Logo: circular gradient bg with musical-notes icon
// White card with name input, Continue button, info card, footer

import { useState, useEffect } from 'react';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { setUserName, getUserRole, hasCompletedOnboarding } from '../utils/storage';

export default function Welcome() {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    (async () => {
      const [completed, role] = await Promise.all([
        hasCompletedOnboarding(),
        getUserRole(),
      ]);
      if (!role) {
        router.replace('/');
        return;
      }
      if (completed) {
        if (role === 'doctor') router.replace('/doctor');
        else if (role === 'caregiver') router.replace('/caregiver');
        else router.replace('/(tabs)/home');
      }
    })();
  }, []);

  const handleContinue = async () => {
    const trimmed = name.trim();
    if (!trimmed) { setError('Please enter your name'); return; }
    if (trimmed.length < 2) { setError('Name must be at least 2 characters'); return; }
    await setUserName(trimmed);
    const role = await getUserRole();
    if (role === 'doctor') router.replace('/doctor');
    else if (role === 'caregiver') router.replace('/caregiver');
    else router.replace('/(tabs)/home');
  };

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={s.container}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo row — matches web: circular gradient bg + musical-notes icon + "NeuroVoice" 3xl bold */}
          <View style={s.logoRow}>
            <View style={s.logoCircle}>
              <Ionicons name="musical-notes" size={24} color="#FFFFFF" />
            </View>
            <Text style={s.brandName}>NeuroVoice</Text>
          </View>

          {/* Welcome card */}
          <View style={s.card}>
            <Text style={s.heading}>Welcome to NeuroVoice</Text>
            <Text style={s.subheading}>
              Early detection of neurological health through voice and facial analysis
            </Text>

            {/* Name input */}
            <View style={s.inputGroup}>
              <Text style={s.label}>What's your name?</Text>
              <TextInput
                style={[s.input, focused && s.inputFocused, !!error && s.inputError]}
                value={name}
                onChangeText={(t) => { setName(t); setError(''); }}
                placeholder="Enter your full name"
                placeholderTextColor="#B8B8B8"
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleContinue}
                autoCapitalize="words"
                autoCorrect={false}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
              />
              {!!error && <Text style={s.errorText}>{error}</Text>}
            </View>

            {/* Continue button */}
            <TouchableOpacity style={s.button} onPress={handleContinue} activeOpacity={0.85}>
              <Text style={s.buttonText}>Continue</Text>
              <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          {/* Info card */}
          <View style={s.infoCard}>
            <View style={s.infoIconWrap}>
              <Ionicons name="information-circle-outline" size={20} color="#FF8C42" />
            </View>
            <View style={s.infoTextWrap}>
              <Text style={s.infoTitle}>Important Notice</Text>
              <Text style={s.infoBody}>
                This is a screening tool, not a medical diagnosis. Always consult a healthcare professional for medical advice.
              </Text>
            </View>
          </View>

          {/* Footer */}
          <Text style={s.footer}>
            By continuing, you agree to our Terms of Service and Privacy Policy
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#EFEBE6' },
  flex: { flex: 1 },
  container: {
    paddingHorizontal: 20,
    paddingTop: 40,
    paddingBottom: 32,
    alignItems: 'center',
  },

  // Logo
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 32,
  },
  logoCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FF8C42', // gradient approximated with solid (RN doesn't support CSS gradients natively)
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FF8C42',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 5,
  },
  brandName: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1A1A1A',
    letterSpacing: -0.5,
  },

  // Card
  card: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    marginBottom: 16,
  },
  heading: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1A1A1A',
    textAlign: 'center',
    marginBottom: 8,
  },
  subheading: {
    fontSize: 13,
    color: '#6B6B6B',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 28,
  },

  // Input
  inputGroup: { marginBottom: 20 },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  input: {
    borderWidth: 2,
    borderColor: '#E0E0E0',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#1A1A1A',
    backgroundColor: '#FFFFFF',
  },
  inputFocused: { borderColor: '#FF8C42' },
  inputError: { borderColor: '#FF6B6B' },
  errorText: { fontSize: 12, color: '#FF6B6B', marginTop: 6 },

  // Button
  button: {
    backgroundColor: '#FF8C42',
    borderRadius: 9999,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#FF8C42',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },

  // Info card
  infoCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
    marginBottom: 20,
  },
  infoIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFE8D6',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  infoTextWrap: { flex: 1 },
  infoTitle: { fontSize: 13, fontWeight: '600', color: '#1A1A1A', marginBottom: 4 },
  infoBody: { fontSize: 12, color: '#6B6B6B', lineHeight: 17 },

  // Footer
  footer: { fontSize: 11, color: '#999999', textAlign: 'center' },
});
