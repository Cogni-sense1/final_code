// VoiceTest screen — matches web VoiceTest.tsx exactly across all 4 phases
// No emojis — uses Ionicons throughout
// Requirements: 5.1–5.12

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  ScrollView,
  SafeAreaView,
  Linking,
  Animated,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { Audio } from 'expo-av';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { WaveformBars } from '../components/WaveformBars';
import { ProgressBar } from '../components/ProgressBar';
import { RiskRing } from '../components/RiskRing';
import { analyzeVoice, VoiceAnalysisMetadata, VoiceAnalysisResult } from '../utils/voiceAnalysisAPI';
import { addTestRecord } from '../utils/storage';
import { VOICE_PROMPTS, playVoicePrompt, stopVoicePrompt } from '../utils/voicePrompts';

type Phase = 'setup' | 'recording' | 'processing' | 'result' | 'error';

const getRiskColor = (level: string) =>
  level === 'Low' ? '#5DBEA3' : level === 'Medium' ? '#FF9F43' : '#FF6B6B';

const getRiskBadge = (level: string) =>
  level === 'Low' ? { bg: '#D4F1E8', text: '#5DBEA3' }
  : level === 'Medium' ? { bg: '#FFE8D6', text: '#FF9F43' }
  : { bg: '#FFE0E0', text: '#FF6B6B' };

export default function VoiceTest() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('setup');

  // Health profile
  const [age60Plus, setAge60Plus] = useState(false);
  const [neuroHistory, setNeuroHistory] = useState(false);
  const [hypertension, setHypertension] = useState(false);
  const [updrsScore, setUpdrsScore] = useState(0);

  const [permissionError, setPermissionError] = useState<string | null>(null);

  // Recording
  const recordingRef = useRef<Audio.Recording | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const promptsPlayedRef = useRef<Set<number>>(new Set());
  const [isPaused, setIsPaused] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  // Processing
  const [progress, setProgress] = useState(0);
  const progressAnim = useRef(new Animated.Value(0)).current;

  // Result
  const [result, setResult] = useState<VoiceAnalysisResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Current prompt index for display
  const [currentPromptIndex, setCurrentPromptIndex] = useState(0);

  useEffect(() => {
    return () => {
      stopVoicePrompt();
      if (timerRef.current) clearInterval(timerRef.current);
      if (recordingRef.current) recordingRef.current.stopAndUnloadAsync().catch(() => {});
    };
  }, []);

  // ─── Setup ────────────────────────────────────────────────────────────────

  const handleContinueToRecording = async () => {
    setPermissionError(null);
    const { status } = await Audio.requestPermissionsAsync();
    if (status !== 'granted') {
      setPermissionError('Microphone permission is required to record your voice.');
      return;
    }
    await startRecording();
  };

  // ─── Recording ────────────────────────────────────────────────────────────

  const startRecording = async () => {
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      recordingRef.current = recording;
      promptsPlayedRef.current = new Set();
      setElapsed(0);
      setCurrentPromptIndex(0);
      setIsPaused(false);
      setPhase('recording');
      playPromptIfNeeded(0);
      timerRef.current = setInterval(() => {
        setElapsed((prev) => {
          const next = prev + 1;
          playPromptIfNeeded(next);
          if (next >= 15) stopRecording();
          return next;
        });
      }, 1000);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to start recording.');
      setPhase('error');
    }
  };

  const playPromptIfNeeded = (t: number) => {
    const prompt = VOICE_PROMPTS.find((p) => p.timing === t);
    if (prompt && !promptsPlayedRef.current.has(prompt.id)) {
      promptsPlayedRef.current.add(prompt.id);
      setCurrentPromptIndex(prompt.id);
      playVoicePrompt(prompt.text).catch(() => {});
    }
  };

  const stopRecording = async () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    stopVoicePrompt();
    const recording = recordingRef.current;
    if (!recording) return;
    try {
      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      const uri = recording.getURI();
      recordingRef.current = null;
      if (!uri) { setErrorMessage('Recording failed: no audio captured.'); setPhase('error'); return; }
      await processRecording(uri);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to stop recording.');
      setPhase('error');
    }
  };

  // ─── Processing ───────────────────────────────────────────────────────────

  const processRecording = async (uri: string) => {
    setProgress(0);
    setPhase('processing');
    Animated.timing(progressAnim, { toValue: 90, duration: 3000, useNativeDriver: false }).start();
    progressAnim.addListener(({ value }) => setProgress(Math.round(value)));

    const metadata: VoiceAnalysisMetadata = {
      ac: age60Plus ? 1 : 0,
      nth: neuroHistory ? 1 : 0,
      htn: hypertension ? 1 : 0,
      updrs: updrsScore,
    };

    try {
      const analysisResult = await analyzeVoice(uri, metadata);
      progressAnim.stopAnimation();
      progressAnim.removeAllListeners();
      setProgress(100);
      await addTestRecord({
        type: 'VOICE',
        name: 'Voice Stability Test',
        riskScore: analysisResult.risk_score,
        riskLevel: analysisResult.risk_level,
        metadata: { age60Plus, neuroHistory, hypertension, updrsScore },
      });
      setResult(analysisResult);
      setPhase('result');
    } catch (err) {
      progressAnim.stopAnimation();
      progressAnim.removeAllListeners();
      setErrorMessage(err instanceof Error ? err.message : 'Analysis failed. Please try again.');
      setPhase('error');
    }
  };

  const resetToSetup = () => {
    setPermissionError(null);
    setErrorMessage(null);
    setElapsed(0);
    setProgress(0);
    progressAnim.setValue(0);
    setResult(null);
    setPhase('setup');
  };

  // ─── SETUP PHASE ─────────────────────────────────────────────────────────

  if (phase === 'setup') {
    return (
      <SafeAreaView style={s.safe}>
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          {/* Header: back arrow + centered title */}
          <View style={s.header}>
            <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
              <Ionicons name="arrow-back" size={24} color="#1A1A1A" />
            </TouchableOpacity>
            <Text style={s.headerTitle}>Voice Check Setup</Text>
          </View>

          {/* Progress bar: "Setup Progress" + "Step 1 of 3", teal fill 33% */}
          <View style={s.progressSection}>
            <View style={s.progressLabelRow}>
              <Text style={s.progressLabel}>Setup Progress</Text>
              <Text style={s.progressStep}>Step 1 of 3</Text>
            </View>
            <View style={s.progressTrack}>
              <View style={[s.progressFill, { width: '33%', backgroundColor: '#5DBEA3' }]} />
            </View>
          </View>

          {/* Instruction card: white rounded-3xl, #FFD4B8 top section with mic icon */}
          <View style={s.instructionCard}>
            <View style={s.instructionTop}>
              <View style={s.instructionIconCircle}>
                <Ionicons name="mic" size={48} color="#FF8C42" />
              </View>
            </View>
            <View style={s.instructionBody}>
              <Text style={s.instructionTitle}>Prepare your voice</Text>
              <Text style={s.instructionSub}>
                Find a quiet space and prepare to record your voice. We use advanced neuro-analysis to monitor vocal markers.
              </Text>
            </View>
          </View>

          {/* Purple prompt card: bg #B8B5FF */}
          <View style={s.promptCard}>
            <View style={s.promptCardHeader}>
              <Ionicons name="volume-high" size={16} color="#5B4FD8" />
              <Text style={s.promptCardLabel}>Interactive Voice Prompts</Text>
            </View>
            <Text style={s.promptCardDesc}>
              Our AI assistant will guide you through the recording with voice prompts. Simply follow the instructions and speak naturally.
            </Text>
            <TouchableOpacity
              style={s.testVoiceBtn}
              onPress={() => playVoicePrompt('Testing voice. Can you hear me?').catch(() => {})}
            >
              <Text style={s.testVoiceBtnText}>Test Voice</Text>
            </TouchableOpacity>
          </View>

          {/* Health Profiles section */}
          <Text style={s.sectionTitle}>Health Profiles</Text>

          <View style={[s.toggleRow, { backgroundColor: '#FFE8D6' }]}>
            <View>
              <Text style={s.toggleLabel}>Age 60+</Text>
              <Text style={s.toggleSub}>Tailored benchmarks</Text>
            </View>
            <Switch value={age60Plus} onValueChange={setAge60Plus}
              trackColor={{ false: '#E0E0E0', true: '#FF8C42' }} thumbColor="#FFFFFF" />
          </View>

          <View style={[s.toggleRow, { backgroundColor: '#D4F1E8' }]}>
            <View>
              <Text style={s.toggleLabel}>Neurological History</Text>
              <Text style={s.toggleSub}>Include medical context</Text>
            </View>
            <Switch value={neuroHistory} onValueChange={setNeuroHistory}
              trackColor={{ false: '#E0E0E0', true: '#5DBEA3' }} thumbColor="#FFFFFF" />
          </View>

          <View style={[s.toggleRow, { backgroundColor: '#E8E4FF' }]}>
            <View>
              <Text style={s.toggleLabel}>Hypertension</Text>
              <Text style={s.toggleSub}>High blood pressure check</Text>
            </View>
            <Switch value={hypertension} onValueChange={setHypertension}
              trackColor={{ false: '#E0E0E0', true: '#7B68EE' }} thumbColor="#FFFFFF" />
          </View>

          {/* UPDRS Slider */}
          <View style={[s.toggleRow, { backgroundColor: '#FFF4E6', flexDirection: 'column', alignItems: 'stretch' }]}>
            <View style={s.sliderHeader}>
              <View>
                <Text style={s.toggleLabel}>UPDRS Score</Text>
                <Text style={s.toggleSub}>Unified Parkinson's Disease Rating Scale</Text>
              </View>
              <Text style={s.sliderValue}>{updrsScore}</Text>
            </View>
            <Slider
              style={s.slider}
              minimumValue={0} maximumValue={108} step={1}
              value={updrsScore} onValueChange={setUpdrsScore}
              minimumTrackTintColor="#FF8C42"
              maximumTrackTintColor="#E0E0E0"
              thumbTintColor="#FF8C42"
            />
            <View style={s.sliderLabels}>
              <Text style={s.sliderLabelText}>0 (None)</Text>
              <Text style={s.sliderLabelText}>54 (Moderate)</Text>
              <Text style={s.sliderLabelText}>108 (Severe)</Text>
            </View>
          </View>

          {/* Permission error */}
          {permissionError ? (
            <View style={s.errorBox}>
              <Text style={s.errorBoxText}>{permissionError}</Text>
              <TouchableOpacity onPress={() => Linking.openSettings()} style={s.openSettingsBtn}>
                <Text style={s.openSettingsBtnText}>Open Settings</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {/* CTA: "Continue to Recording" with mic icon */}
          <TouchableOpacity style={s.primaryBtn} onPress={handleContinueToRecording} activeOpacity={0.85}>
            <Ionicons name="mic" size={20} color="#FFFFFF" />
            <Text style={s.primaryBtnText}>Continue to Recording</Text>
          </TouchableOpacity>

          <Text style={s.disclaimer}>By continuing, you agree to the NeuroVoice data processing terms.</Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ─── RECORDING PHASE ─────────────────────────────────────────────────────

  if (phase === 'recording') {
    const minutes = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const seconds = String(elapsed % 60).padStart(2, '0');
    const currentPrompt = VOICE_PROMPTS.slice().reverse().find((p) => p.timing <= elapsed);

    return (
      <SafeAreaView style={s.safe}>
        <View style={s.recordingContainer}>
          {/* Header */}
          <View style={s.header}>
            <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
              <Ionicons name="arrow-back" size={24} color="#1A1A1A" />
            </TouchableOpacity>
            <Text style={s.headerTitle}>NeuroVoice AI</Text>
          </View>

          {/* Timer boxes: white cards, orange digits */}
          <View style={s.timerRow}>
            <View style={s.timerBox}>
              <Text style={s.timerDigit}>{minutes}</Text>
              <Text style={s.timerUnit}>MINUTES</Text>
            </View>
            <Text style={s.timerColon}>:</Text>
            <View style={s.timerBox}>
              <Text style={s.timerDigit}>{seconds}</Text>
              <Text style={s.timerUnit}>SECONDS</Text>
            </View>
          </View>

          {/* "Nice and steady!" feedback badge after 3s */}
          {elapsed >= 3 && (
            <View style={s.steadyBadge}>
              <View style={s.steadyDot} />
              <Text style={s.steadyText}>Nice and steady!</Text>
            </View>
          )}

          {/* Waveform */}
          <View style={s.waveformWrap}>
            <WaveformBars isRecording={true} color="#FF8C42" />
          </View>

          {/* Prompt card with volume-high icon */}
          <View style={s.recordingPromptCard}>
            <View style={s.recordingPromptHeader}>
              <Ionicons name="volume-high" size={16} color="#FFB89D" />
              <Text style={s.recordingPromptLabel}>Voice Prompt</Text>
            </View>
            <Text style={s.recordingPromptText}>
              {currentPrompt ? currentPrompt.displayText : 'Get ready to speak...'}
            </Text>
            {/* Prompt dots */}
            <View style={s.promptDots}>
              {VOICE_PROMPTS.map((p) => (
                <View
                  key={p.id}
                  style={[
                    s.promptDot,
                    elapsed >= p.timing ? s.promptDotActive : s.promptDotInactive,
                  ]}
                />
              ))}
            </View>
          </View>

          {/* Controls: pause, stop (large orange circle), mute */}
          <View style={s.controls}>
            <TouchableOpacity style={s.controlBtn} onPress={() => setIsPaused(!isPaused)}>
              <Ionicons name="pause" size={24} color="#1A1A1A" />
            </TouchableOpacity>
            <TouchableOpacity style={s.stopBtn} onPress={stopRecording}>
              <Ionicons name="stop" size={32} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity style={s.controlBtn} onPress={() => setIsMuted(!isMuted)}>
              <Ionicons name="mic-off" size={24} color={isMuted ? '#FF8C42' : '#1A1A1A'} />
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ─── PROCESSING PHASE ─────────────────────────────────────────────────────

  if (phase === 'processing') {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.centeredContainer}>
          <Text style={s.processingSubtitle}>Voice Processing</Text>
          <Text style={s.processingTitle}>Just a moment...</Text>

          {/* Pulsing orange circle with waveform bars inside */}
          <View style={s.pulseWrap}>
            <View style={s.pulseRing} />
            <View style={s.pulseCircle}>
              <WaveformBars isRecording={true} color="#FF8C42" />
            </View>
          </View>

          <Text style={s.processingBody}>Analyzing voice stability...</Text>
          <Text style={s.processingBodySub}>
            Checking pitch consistency and tone patterns against healthy baselines.
          </Text>

          <View style={s.progressBarWrap}>
            <ProgressBar value={progress} height={8} color="#FF8C42" />
            <View style={s.progressLabelRow}>
              <Text style={s.progressLabelText}>Voice Processing</Text>
              <Text style={s.progressLabelText}>{progress}%</Text>
            </View>
          </View>

          {/* "Did you know?" tip card with bulb-outline icon */}
          <View style={s.tipCard}>
            <View style={s.tipIcon}>
              <Ionicons name="bulb-outline" size={20} color="#FF8C42" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.tipTitle}>Did you know?</Text>
              <Text style={s.tipBody}>Regular voice exercises can help maintain vocal strength over time.</Text>
            </View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ─── RESULT PHASE ─────────────────────────────────────────────────────────

  if (phase === 'result' && result) {
    const badge = getRiskBadge(result.risk_level);
    const ringColor = getRiskColor(result.risk_level);
    const insightMsg =
      result.risk_level === 'Low'
        ? 'Your voice analysis shows healthy vocal patterns. Continue regular monitoring for early detection.'
        : result.risk_level === 'Medium'
        ? 'Your voice shows some markers that warrant attention. Consider consulting with a healthcare professional.'
        : 'Your voice analysis indicates significant markers. We recommend consulting with a neurologist for comprehensive evaluation.';

    return (
      <SafeAreaView style={s.safe}>
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={s.header}>
            <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
              <Ionicons name="arrow-back" size={24} color="#1A1A1A" />
            </TouchableOpacity>
            <Text style={s.headerTitle}>NeuroVoice</Text>
            <TouchableOpacity style={s.infoBtn}>
              <Ionicons name="information-circle-outline" size={24} color="#FF8C42" />
            </TouchableOpacity>
          </View>

          <View style={s.resultHeaderSection}>
            <Text style={s.resultTitle}>Analysis Complete</Text>
            <Text style={s.resultSub}>Your voice scan is ready for review</Text>
          </View>

          {/* Risk ring (SVG, 192x192) */}
          <View style={s.ringWrap}>
            <RiskRing score={result.risk_score} color={ringColor} size={192} />
            <View style={[s.riskBadge, { backgroundColor: badge.bg }]}>
              <Text style={[s.riskBadgeText, { color: badge.text }]}>{result.risk_level} Risk</Text>
            </View>
          </View>

          {/* Insight message card */}
          <View style={s.insightCard}>
            <Text style={s.insightText}>{insightMsg}</Text>
            <Text style={s.insightDisclaimer}>This is a screening tool, not a medical diagnosis.</Text>
          </View>

          {/* Health Profile Used section — same 4 rows */}
          <View style={s.profileSection}>
            <View style={s.profileSectionHeader}>
              <Text style={s.profileSectionTitle}>Health Profile Used</Text>
              <Ionicons name="information-circle-outline" size={18} color="#999999" />
            </View>
            {[
              { label: 'Age 60+', value: age60Plus ? 'Yes' : 'No' },
              { label: 'Neurological History', value: neuroHistory ? 'Yes' : 'No' },
              { label: 'Hypertension', value: hypertension ? 'Yes' : 'No' },
              { label: 'UPDRS Score', value: `${updrsScore}/108` },
            ].map((row) => (
              <View key={row.label} style={s.profileRow}>
                <Text style={s.profileRowLabel}>{row.label}</Text>
                <Text style={s.profileRowValue}>{row.value}</Text>
              </View>
            ))}
          </View>

          {/* "View Full Insights" + "Share Report" buttons */}
          <TouchableOpacity style={s.primaryBtn} onPress={() => router.push('/(tabs)/history')} activeOpacity={0.85}>
            <Text style={s.primaryBtnText}>View Full Insights</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.secondaryBtn} onPress={resetToSetup} activeOpacity={0.85}>
            <View style={s.secondaryBtnInner}>
              <Ionicons name="share-outline" size={20} color="#FF8C42" />
              <Text style={s.secondaryBtnText}>Share Report</Text>
            </View>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ─── ERROR PHASE ──────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.centeredContainer}>
        <View style={[s.header, { alignSelf: 'stretch' }]}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#1A1A1A" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Error</Text>
        </View>
        <Ionicons name="warning-outline" size={56} color="#FF6B6B" style={{ marginBottom: 16 }} />
        <Text style={s.errorTitle}>Something went wrong</Text>
        <Text style={s.errorBody}>{errorMessage ?? 'An unexpected error occurred.'}</Text>
        <TouchableOpacity style={s.primaryBtn} onPress={resetToSetup} activeOpacity={0.85}>
          <Text style={s.primaryBtnText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#EFEBE6' },
  scroll: { padding: 20, paddingBottom: 40 },
  recordingContainer: { flex: 1, padding: 20 },
  centeredContainer: { flex: 1, padding: 20, alignItems: 'center', justifyContent: 'center' },

  // Header
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  backBtn: { padding: 4, marginRight: 12 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: '#1A1A1A', textAlign: 'center' },
  infoBtn: { padding: 4 },

  // Progress section
  progressSection: { marginBottom: 24 },
  progressLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  progressLabel: { fontSize: 14, fontWeight: '600', color: '#1A1A1A' },
  progressStep: { fontSize: 14, color: '#6B6B6B' },
  progressTrack: { height: 8, backgroundColor: '#E0E0E0', borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 4 },

  // Instruction card
  instructionCard: { backgroundColor: '#FFFFFF', borderRadius: 24, overflow: 'hidden', marginBottom: 20 },
  instructionTop: {
    backgroundColor: '#FFD4B8', height: 160,
    alignItems: 'center', justifyContent: 'center',
  },
  instructionIconCircle: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },
  instructionBody: { padding: 24 },
  instructionTitle: { fontSize: 20, fontWeight: '700', color: '#1A1A1A', marginBottom: 8 },
  instructionSub: { fontSize: 14, color: '#6B6B6B', lineHeight: 20 },

  // Purple prompt card
  promptCard: {
    backgroundColor: '#B8B5FF', borderRadius: 24,
    padding: 20, marginBottom: 24, alignItems: 'center',
  },
  promptCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  promptCardLabel: { fontSize: 11, fontWeight: '700', color: '#5B4FD8', letterSpacing: 0.8 },
  promptCardDesc: { fontSize: 13, color: '#1A1A1A', textAlign: 'center', lineHeight: 19, marginBottom: 12 },
  testVoiceBtn: {
    backgroundColor: '#5B4FD8', borderRadius: 9999,
    paddingHorizontal: 16, paddingVertical: 8,
  },
  testVoiceBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' },

  // Section title
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#1A1A1A', marginBottom: 14 },

  // Toggle rows
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: 16, padding: 16, marginBottom: 10,
  },
  toggleLabel: { fontSize: 15, fontWeight: '700', color: '#1A1A1A' },
  toggleSub: { fontSize: 12, color: '#6B6B6B', marginTop: 2 },

  // Slider
  sliderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  sliderValue: { fontSize: 24, fontWeight: '700', color: '#FF8C42' },
  slider: { width: '100%', height: 40 },
  sliderLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  sliderLabelText: { fontSize: 11, color: '#999999' },

  // Error box
  errorBox: { backgroundColor: '#FDECEA', borderRadius: 12, padding: 16, marginBottom: 16 },
  errorBoxText: { fontSize: 14, color: '#C0392B', marginBottom: 10 },
  openSettingsBtn: { alignSelf: 'flex-start', backgroundColor: '#FF8C42', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8 },
  openSettingsBtnText: { color: '#FFFFFF', fontWeight: '600', fontSize: 13 },

  // Buttons
  primaryBtn: {
    backgroundColor: '#FF8C42', borderRadius: 9999,
    paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 16,
    shadowColor: '#FF8C42', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  primaryBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  secondaryBtn: { backgroundColor: '#FFE8D6', borderRadius: 9999, paddingVertical: 16, alignItems: 'center', marginTop: 12 },
  secondaryBtnInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  secondaryBtnText: { color: '#FF8C42', fontSize: 16, fontWeight: '700' },
  disclaimer: { fontSize: 11, color: '#999999', textAlign: 'center', marginTop: 12 },

  // Recording phase
  timerRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  timerBox: {
    backgroundColor: '#FFFFFF', borderRadius: 16,
    paddingHorizontal: 24, paddingVertical: 16, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  timerDigit: { fontSize: 40, fontWeight: '700', color: '#FF8C42' },
  timerUnit: { fontSize: 10, color: '#999999', letterSpacing: 1, marginTop: 2 },
  timerColon: { fontSize: 28, fontWeight: '700', color: '#999999', marginHorizontal: 8 },

  steadyBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#D4F1E8', borderRadius: 9999,
    paddingHorizontal: 16, paddingVertical: 8,
    alignSelf: 'center', marginBottom: 16,
  },
  steadyDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#5DBEA3' },
  steadyText: { fontSize: 13, fontWeight: '600', color: '#5DBEA3' },

  waveformWrap: { alignItems: 'center', marginBottom: 20 },

  recordingPromptCard: {
    backgroundColor: '#FFFFFF', borderRadius: 24,
    padding: 24, alignItems: 'center', marginBottom: 24, flex: 1, justifyContent: 'center',
  },
  recordingPromptHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  recordingPromptLabel: { fontSize: 11, fontWeight: '700', color: '#FFB89D', letterSpacing: 0.5 },
  recordingPromptText: { fontSize: 18, fontWeight: '600', color: '#1A1A1A', textAlign: 'center', lineHeight: 26 },
  promptDots: { flexDirection: 'row', marginTop: 16, gap: 8 },
  promptDot: { height: 6, borderRadius: 3 },
  promptDotActive: { width: 24, backgroundColor: '#FF8C42' },
  promptDotInactive: { width: 6, backgroundColor: '#E0E0E0' },

  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 24 },
  controlBtn: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 3,
  },
  stopBtn: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: '#FF8C42',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#FF8C42', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 8, elevation: 5,
  },

  // Processing phase
  processingSubtitle: { fontSize: 13, color: '#6B6B6B', fontWeight: '600', marginBottom: 6 },
  processingTitle: { fontSize: 28, fontWeight: '700', color: '#1A1A1A', marginBottom: 32 },
  pulseWrap: { width: 128, height: 128, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  pulseRing: {
    position: 'absolute', width: 128, height: 128, borderRadius: 64,
    backgroundColor: '#FF8C42', opacity: 0.1,
  },
  pulseCircle: {
    width: 128, height: 128, borderRadius: 64,
    backgroundColor: '#FFD4B8',
    alignItems: 'center', justifyContent: 'center',
  },
  processingBody: { fontSize: 18, fontWeight: '700', color: '#1A1A1A', marginBottom: 6 },
  processingBodySub: { fontSize: 13, color: '#6B6B6B', textAlign: 'center', maxWidth: 260, lineHeight: 19, marginBottom: 28 },
  progressBarWrap: { width: '100%', maxWidth: 300, marginBottom: 24 },
  progressLabelText: { fontSize: 12, color: '#6B6B6B' },

  tipCard: {
    backgroundColor: '#FFFFFF', borderRadius: 16,
    padding: 16, flexDirection: 'row', gap: 12, alignItems: 'flex-start',
    maxWidth: 300, width: '100%',
  },
  tipIcon: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#FFE8D6', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  tipTitle: { fontSize: 13, fontWeight: '600', color: '#1A1A1A', marginBottom: 2 },
  tipBody: { fontSize: 12, color: '#6B6B6B', lineHeight: 17 },

  // Result phase
  resultHeaderSection: { alignItems: 'center', marginBottom: 28 },
  resultTitle: { fontSize: 28, fontWeight: '700', color: '#1A1A1A', marginBottom: 6 },
  resultSub: { fontSize: 15, color: '#6B6B6B' },
  ringWrap: { alignItems: 'center', marginBottom: 24 },
  riskBadge: { borderRadius: 9999, paddingHorizontal: 20, paddingVertical: 8, marginTop: 12 },
  riskBadgeText: { fontSize: 14, fontWeight: '700' },

  insightCard: {
    backgroundColor: '#FFFFFF', borderRadius: 24,
    padding: 20, alignItems: 'center', marginBottom: 24,
  },
  insightText: { fontSize: 15, color: '#1A1A1A', textAlign: 'center', lineHeight: 22, marginBottom: 8 },
  insightDisclaimer: { fontSize: 11, color: '#999999', textAlign: 'center' },

  profileSection: { marginBottom: 24 },
  profileSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  profileSectionTitle: { fontSize: 20, fontWeight: '700', color: '#1A1A1A' },
  profileRow: {
    backgroundColor: '#FFFFFF', borderRadius: 16,
    padding: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8,
  },
  profileRowLabel: { fontSize: 15, fontWeight: '600', color: '#1A1A1A' },
  profileRowValue: { fontSize: 15, fontWeight: '700', color: '#FF8C42' },

  // Error phase
  errorTitle: { fontSize: 22, fontWeight: '700', color: '#1A1A1A', marginBottom: 10 },
  errorBody: { fontSize: 14, color: '#6B6B6B', textAlign: 'center', maxWidth: 280, lineHeight: 20, marginBottom: 8 },
});
