// FaceTest screen — matches web FaceTest.tsx exactly
// Camera view, live metric overlays, result with 2x2 metrics grid
// Requirements: 6.1–6.10

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, SafeAreaView, Linking, Animated,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { ProgressBar } from '../components/ProgressBar';
import { RiskRing } from '../components/RiskRing';
import { calculateRiskFromSignals } from '../utils/riskCalculation';
import { addTestRecord } from '../utils/storage';
import { getRandomFacePrompt, playFacePrompt, stopFacePrompt, type FacePrompt } from '../utils/facePrompts';

type Phase = 'permission' | 'ready' | 'recording' | 'processing' | 'result' | 'error';

interface ResultData {
  percentage: number;
  level: 'Low' | 'Medium' | 'High';
  color: string;
  blinkRate: number;
  motionScore: number;
  asymmetry: number;
  framesDetected: number;
}

const SESSION_DURATION = 30;

const getRiskColor = (l: string) =>
  l === 'Low' ? '#5DBEA3' : l === 'Medium' ? '#FF9F43' : '#FF6B6B';

const getRiskBadge = (l: string) =>
  l === 'Low' ? { bg: '#D4F1E8', text: '#5DBEA3' }
  : l === 'Medium' ? { bg: '#FFE8D6', text: '#FF9F43' }
  : { bg: '#FFE0E0', text: '#FF6B6B' };

// Mini bar chart for result metrics
function MiniBarChart({ color }: { color: string }) {
  const heights = [40, 60, 80, 70, 90];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 32, gap: 3 }}>
      {heights.map((h, i) => (
        <View key={i} style={{ flex: 1, height: `${h}%`, backgroundColor: color, borderRadius: 2 }} />
      ))}
    </View>
  );
}

export default function FaceTest() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();

  const [phase, setPhase] = useState<Phase>('permission');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentPrompt, setCurrentPrompt] = useState<FacePrompt>(getRandomFacePrompt);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<ResultData | null>(null);
  const [progress, setProgress] = useState(0);

  // Live detection state
  const [faceDetected, setFaceDetected] = useState(false);
  const [liveBlinkCount, setLiveBlinkCount] = useState(0);
  const [liveLeftEye, setLiveLeftEye] = useState(1);
  const [liveRightEye, setLiveRightEye] = useState(1);

  // Static display values (matches web)
  const heartRate = 72;
  const breathing = 'Normal';

  const metricsRef = useRef({
    blinkCount: 0, frameCount: 0, totalMotion: 0, asymmetrySum: 0,
    prevCenter: null as { x: number; y: number } | null,
    wasBlinking: false,
  });

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionActiveRef = useRef(false);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Request permission on mount
  useEffect(() => {
    (async () => {
      if (!permission) return;
      if (permission.granted) { setPhase('ready'); return; }
      const res = await requestPermission();
      if (res.granted) setPhase('ready');
      else {
        setErrorMessage('Camera access is required for the face test. Please enable it in Settings.');
        setPhase('error');
      }
    })();
  }, [permission?.granted]);

  useEffect(() => () => {
    stopFacePrompt();
    if (timerRef.current) clearInterval(timerRef.current);
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    sessionActiveRef.current = false;
  }, []);

  const handleStartRecording = async () => {
    metricsRef.current = { blinkCount: 0, frameCount: 0, totalMotion: 0, asymmetrySum: 0, prevCenter: null, wasBlinking: false };
    setElapsed(0);
    setFaceDetected(false);
    setLiveBlinkCount(0);
    const prompt = getRandomFacePrompt();
    setCurrentPrompt(prompt);
    playFacePrompt(prompt.text).catch(() => {});
    sessionActiveRef.current = true;
    setPhase('recording');
    timerRef.current = setInterval(() => {
      setElapsed((prev) => {
        const next = prev + 1;
        if (next >= SESSION_DURATION) endSession();
        return next;
      });
    }, 1000);
  };

  const endSession = useCallback(() => {
    if (!sessionActiveRef.current) return;
    sessionActiveRef.current = false;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    stopFacePrompt();

    const { blinkCount, frameCount, totalMotion, asymmetrySum } = metricsRef.current;

    if (frameCount < 10) {
      setErrorMessage(`Not enough face data collected (${frameCount} frames). Make sure your face is visible and try again.`);
      setPhase('error');
      return;
    }

    const blinkRate = (blinkCount / SESSION_DURATION) * 60;
    const avgMotion = totalMotion / frameCount;
    const avgAsymmetry = asymmetrySum / frameCount;

    const riskResult = calculateRiskFromSignals(blinkRate, avgMotion, avgAsymmetry);

    addTestRecord({
      type: 'FACE',
      name: 'Face Mobility Test',
      riskScore: riskResult.percentage / 100,
      riskLevel: riskResult.level,
      metadata: { blinkRate, motion: avgMotion, asymmetry: avgAsymmetry },
    }).catch(() => {});

    setResult({
      percentage: riskResult.percentage,
      level: riskResult.level,
      color: riskResult.color,
      blinkRate,
      motionScore: avgMotion * 1000,
      asymmetry: avgAsymmetry,
      framesDetected: frameCount,
    });

    // Processing phase with progress
    setProgress(0);
    setPhase('processing');
    progressIntervalRef.current = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
          setTimeout(() => setPhase('result'), 300);
          return 100;
        }
        return p + 3;
      });
    }, 100);
  }, []);

  const handleFacesDetected = useCallback(({ faces }: { faces: any[] }) => {
    if (!sessionActiveRef.current) return;
    if (!faces || faces.length === 0) { setFaceDetected(false); return; }
    setFaceDetected(true);
    const face = faces[0];
    const m = metricsRef.current;
    m.frameCount += 1;

    const leftOpen: number = face.leftEyeOpenProbability ?? 1;
    const rightOpen: number = face.rightEyeOpenProbability ?? 1;
    setLiveLeftEye(leftOpen);
    setLiveRightEye(rightOpen);

    const isBlinking = leftOpen < 0.25 && rightOpen < 0.25;
    if (isBlinking && !m.wasBlinking) {
      m.blinkCount += 1;
      setLiveBlinkCount(m.blinkCount);
    }
    m.wasBlinking = isBlinking;

    if (face.bounds) {
      const cx = (face.bounds.origin.x + face.bounds.size.width / 2) / 100;
      const cy = (face.bounds.origin.y + face.bounds.size.height / 2) / 100;
      if (m.prevCenter) {
        const dx = cx - m.prevCenter.x;
        const dy = cy - m.prevCenter.y;
        m.totalMotion += Math.sqrt(dx * dx + dy * dy);
      }
      m.prevCenter = { x: cx, y: cy };
    }

    m.asymmetrySum += Math.abs(leftOpen - rightOpen);
  }, []);

  const resetToReady = () => {
    stopFacePrompt();
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (progressIntervalRef.current) { clearInterval(progressIntervalRef.current); progressIntervalRef.current = null; }
    sessionActiveRef.current = false;
    setElapsed(0); setResult(null); setErrorMessage(null);
    setFaceDetected(false); setLiveBlinkCount(0);
    setCurrentPrompt(getRandomFacePrompt());
    setPhase('ready');
  };

  // ─── Permission loading ───────────────────────────────────────────────────
  if (phase === 'permission') {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.centered}>
          <Ionicons name="camera-outline" size={48} color="#6B6B6B" />
          <Text style={s.mutedText}>Requesting camera permission...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ─── Error ────────────────────────────────────────────────────────────────
  if (phase === 'error') {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.centered}>
          <TouchableOpacity onPress={() => router.back()} style={[s.backBtn, { alignSelf: 'flex-start' }]}>
            <Ionicons name="arrow-back" size={24} color="#1A1A1A" />
          </TouchableOpacity>
          <Ionicons name="warning-outline" size={56} color="#FF6B6B" style={{ marginBottom: 16 }} />
          <Text style={s.errorTitle}>
            {errorMessage?.includes('Camera') ? 'Camera Access Required' : 'Not Enough Data'}
          </Text>
          <Text style={s.mutedText}>{errorMessage}</Text>
          {errorMessage?.includes('Camera') && (
            <TouchableOpacity style={s.primaryBtn} onPress={() => Linking.openSettings()}>
              <Text style={s.primaryBtnText}>Open Settings</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={s.secondaryBtn} onPress={resetToReady}>
            <Text style={s.secondaryBtnText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ─── Ready ────────────────────────────────────────────────────────────────
  if (phase === 'ready') {
    return (
      <SafeAreaView style={s.safe}>
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          {/* Header: back arrow, "Facial Assessment" centered, info icon */}
          <View style={s.header}>
            <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
              <Ionicons name="arrow-back" size={24} color="#1A1A1A" />
            </TouchableOpacity>
            <Text style={s.headerTitle}>Facial Assessment</Text>
            <TouchableOpacity style={s.infoBtn}>
              <Ionicons name="information-circle-outline" size={24} color="#1A1A1A" />
            </TouchableOpacity>
          </View>

          {/* Camera view: bg #A8C5C0, rounded-[32px], aspect 4:3 */}
          <View style={s.cameraBox}>
            <CameraView style={s.camera} facing="front" />
            <View style={s.cameraOverlay}>
              <View style={s.faceGuide} />
            </View>
            <View style={s.positionOverlay}>
              <Text style={s.positionText}>Position your face in the frame</Text>
            </View>
          </View>

          {/* Prompt card */}
          <View style={s.promptCard}>
            <View style={s.promptCardHeader}>
              <Ionicons name="volume-high" size={14} color="#FF8C42" />
              <Text style={s.promptCardLabel}>Answer This Question</Text>
            </View>
            <Text style={s.promptCardText}>{currentPrompt.displayText}</Text>
            <Text style={s.promptCardNote}>The question will be read aloud when you start recording</Text>
          </View>

          {/* Start Recording button */}
          <TouchableOpacity style={s.primaryBtn} onPress={handleStartRecording}>
            <Ionicons name="play-circle-outline" size={22} color="#FFFFFF" />
            <Text style={s.primaryBtnText}>Start Recording</Text>
          </TouchableOpacity>

          {/* Cancel Assessment */}
          <TouchableOpacity style={s.cancelBtn} onPress={() => router.back()}>
            <Text style={s.cancelBtnText}>Cancel Assessment</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ─── Recording ────────────────────────────────────────────────────────────
  if (phase === 'recording') {
    const remaining = SESSION_DURATION - elapsed;
    const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const ss = String(elapsed % 60).padStart(2, '0');
    const progressVal = (elapsed / SESSION_DURATION) * 100;

    return (
      <SafeAreaView style={s.safe}>
        <View style={s.recordingContainer}>
          {/* Header: back arrow, "Facial Assessment" centered, info icon */}
          <View style={s.header}>
            <TouchableOpacity onPress={resetToReady} style={s.backBtn}>
              <Ionicons name="arrow-back" size={24} color="#1A1A1A" />
            </TouchableOpacity>
            <Text style={s.headerTitle}>Facial Assessment</Text>
            <TouchableOpacity style={s.infoBtn}>
              <Ionicons name="information-circle-outline" size={24} color="#1A1A1A" />
            </TouchableOpacity>
          </View>

          {/* Recording progress bar at top */}
          <View style={s.recProgressSection}>
            <View style={s.recProgressLabelRow}>
              <Text style={s.recProgressLabel}>Recording Progress</Text>
              <Text style={s.recProgressTime}>{mm}:{ss} / 00:30</Text>
            </View>
            <ProgressBar value={progressVal} height={6} color="#FF8C42" />
          </View>

          {/* Camera view: bg #A8C5C0, rounded-[32px], aspect 4:3 */}
          <View style={s.cameraBox}>
            <CameraView
              style={s.camera}
              facing="front"
              onFacesDetected={handleFacesDetected}
              faceDetectorSettings={{
                mode: 'fast',
                detectLandmarks: 'none',
                runClassifications: 'all',
                minDetectionInterval: 150,
                tracking: true,
              }}
            />

            {/* Live metric overlays top-left: blink rate, heart rate, breathing */}
            <View style={s.liveMetrics}>
              <View style={s.metricPill}>
                <Ionicons name="eye-outline" size={16} color="#7B68EE" />
                <Text style={s.metricPillText}>Blink rate: {liveBlinkCount}</Text>
              </View>
              <View style={s.metricPill}>
                <Ionicons name="heart-outline" size={16} color="#FF6B9D" />
                <Text style={s.metricPillText}>Heart rate: {heartRate} bpm</Text>
              </View>
              <View style={s.metricPill}>
                <Ionicons name="leaf-outline" size={16} color="#5DBEA3" />
                <Text style={s.metricPillText}>Breathing: {breathing}</Text>
              </View>
            </View>

            {/* "Recording" badge top-right: orange, animated pulse dot */}
            <View style={s.recBadge}>
              <View style={s.recDot} />
              <Text style={s.recBadgeText}>Recording</Text>
            </View>

            {/* Face guide */}
            <View style={s.cameraOverlay}>
              <View style={[s.faceGuide, { borderColor: faceDetected ? '#5DBEA3' : '#FF6B6B' }]} />
            </View>

            {/* "Position your face in the frame" bottom overlay */}
            <View style={s.positionOverlay}>
              <Text style={s.positionText}>Position your face in the frame</Text>
            </View>
          </View>

          {/* Prompt card */}
          <View style={s.promptCard}>
            <View style={s.promptCardHeader}>
              <Ionicons name="volume-high" size={14} color="#FF8C42" />
              <Text style={s.promptCardLabel}>Answer This Question</Text>
            </View>
            <Text style={s.promptCardText}>{currentPrompt.displayText}</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ─── Processing ───────────────────────────────────────────────────────────
  if (phase === 'processing') {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.centered}>
          <Text style={s.processingSubtitle}>Facial Processing</Text>
          <Text style={s.processingTitle}>Just a moment...</Text>
          <View style={s.pulseWrap}>
            <View style={s.pulseRing} />
            <View style={s.pulseCircle}>
              <Ionicons name="happy-outline" size={40} color="#FF8C42" />
            </View>
          </View>
          <Text style={s.processingBody}>Analyzing facial patterns...</Text>
          <Text style={s.processingBodySub}>Checking blink rate, facial motion, and symmetry patterns.</Text>
          <View style={s.progressBarWrap}>
            <ProgressBar value={progress} height={8} color="#FF8C42" />
            <View style={s.progressLabelRow}>
              <Text style={s.progressLabelText}>Processing</Text>
              <Text style={s.progressLabelText}>{Math.round(progress)}%</Text>
            </View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ─── Result ───────────────────────────────────────────────────────────────
  if (phase === 'result' && result) {
    const badge = getRiskBadge(result.level);
    const normalBlinkRate = result.blinkRate >= 10 && result.blinkRate <= 20;

    return (
      <SafeAreaView style={s.safe}>
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={s.header}>
            <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
              <Ionicons name="arrow-back" size={24} color="#1A1A1A" />
            </TouchableOpacity>
            <Text style={[s.headerTitle, { color: '#FF8C42' }]}>NeuroVoice</Text>
            <TouchableOpacity style={s.infoBtn}>
              <Ionicons name="information-circle-outline" size={24} color="#1A1A1A" />
            </TouchableOpacity>
          </View>

          <View style={s.resultHeaderSection}>
            <Text style={s.resultTitle}>Analysis Complete</Text>
            <Text style={s.resultSub}>We've carefully reviewed your recent session.</Text>
          </View>

          {/* Risk ring: 224x224 like web */}
          <View style={s.ringWrap}>
            <RiskRing score={result.percentage / 100} color={getRiskColor(result.level)} size={224} />
            <View style={[s.riskBadge, { backgroundColor: badge.bg }]}>
              <Text style={[s.riskBadgeText, { color: badge.text }]}>{result.level} Risk</Text>
            </View>
          </View>

          {/* Insight message */}
          <View style={s.insightCard}>
            <Text style={s.insightText}>
              {result.level === 'Low'
                ? 'Your patterns show healthy facial movement and expression. Keep up the good work!'
                : result.level === 'Medium'
                ? "Your patterns suggest some variations. Let's look closer at the details below."
                : "Your patterns suggest moderate fatigue levels. Let's look closer at the details below."}
            </Text>
          </View>

          {/* 2x2 metrics grid */}
          <View style={s.metricsGrid}>
            {/* Blink Rate: purple eye icon */}
            <View style={s.metricCard}>
              <View style={s.metricCardHeader}>
                <Ionicons name="eye-outline" size={20} color="#7B68EE" />
              </View>
              <Text style={s.metricCardLabel}>Blink Rate</Text>
              <Text style={[s.metricCardValue, { color: normalBlinkRate ? '#5DBEA3' : '#FF9F43' }]}>
                {result.blinkRate.toFixed(0)} bpm
              </Text>
              <MiniBarChart color="#B8B5FF" />
            </View>

            {/* Facial Motion: orange activity icon */}
            <View style={s.metricCard}>
              <View style={s.metricCardHeader}>
                <Ionicons name="pulse-outline" size={20} color="#FF8C42" />
              </View>
              <Text style={s.metricCardLabel}>Facial Motion</Text>
              <Text style={s.metricCardValue}>{result.motionScore > 1.5 ? 'Normal' : 'Reduced'}</Text>
              <MiniBarChart color="#FFD4B8" />
            </View>

            {/* Asymmetry: teal trending-up icon */}
            <View style={s.metricCard}>
              <View style={s.metricCardHeader}>
                <Ionicons name="trending-up-outline" size={20} color="#5DBEA3" />
              </View>
              <Text style={s.metricCardLabel}>Asymmetry</Text>
              <Text style={[s.metricCardValue, { color: result.asymmetry > 0.07 ? '#FF6B6B' : '#5DBEA3' }]}>
                {(result.asymmetry * 100).toFixed(1)}%
              </Text>
              <MiniBarChart color="#C8E6DD" />
            </View>

            {/* Breathing: gray wind icon */}
            <View style={s.metricCard}>
              <View style={s.metricCardHeader}>
                <Ionicons name="leaf-outline" size={20} color="#9CA3AF" />
              </View>
              <Text style={s.metricCardLabel}>Breathing</Text>
              <Text style={s.metricCardValue}>14 rpm</Text>
              <MiniBarChart color="#D1D5DB" />
            </View>
          </View>

          {/* "View Insights" + "Share Report" buttons */}
          <TouchableOpacity style={s.primaryBtn} onPress={() => router.push('/(tabs)/insights')}>
            <Ionicons name="trending-up-outline" size={20} color="#FFFFFF" />
            <Text style={s.primaryBtnText}>View Insights</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.shareBtn} onPress={() => {}}>
            <Ionicons name="share-outline" size={20} color="#1A1A1A" />
            <Text style={s.shareBtnText}>Share Report</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return null;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#EFEBE6' },
  scroll: { padding: 20, paddingBottom: 40 },
  centered: { flex: 1, padding: 24, alignItems: 'center', justifyContent: 'center' },
  recordingContainer: { flex: 1, padding: 16 },

  // Header
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  backBtn: { padding: 4, marginRight: 8 },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: '#1A1A1A', textAlign: 'center' },
  infoBtn: { padding: 4 },

  // Camera box: bg #A8C5C0, rounded-[32px], aspect 4:3
  cameraBox: {
    backgroundColor: '#A8C5C0',
    borderRadius: 32,
    overflow: 'hidden',
    aspectRatio: 4 / 3,
    marginBottom: 16,
    position: 'relative',
  },
  camera: { flex: 1 },
  cameraOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  faceGuide: {
    width: '55%', aspectRatio: 3 / 4,
    borderRadius: 9999, borderWidth: 2.5,
    borderColor: '#5DBEA3', borderStyle: 'dashed',
  },

  // Live metric overlays: white/90 backdrop pills
  liveMetrics: {
    position: 'absolute', top: 12, left: 12,
    flexDirection: 'column', gap: 6,
  },
  metricPill: {
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 9999, paddingHorizontal: 12, paddingVertical: 6,
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  metricPillText: { fontSize: 13, fontWeight: '600', color: '#1A1A1A' },

  // Recording badge top-right
  recBadge: {
    position: 'absolute', top: 12, right: 12,
    backgroundColor: '#FF8C42', borderRadius: 9999,
    paddingHorizontal: 12, paddingVertical: 6,
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  recDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFFFFF' },
  recBadgeText: { fontSize: 13, fontWeight: '600', color: '#FFFFFF' },

  // Position overlay bottom
  positionOverlay: {
    position: 'absolute', bottom: 16, left: 0, right: 0,
    alignItems: 'center',
  },
  positionText: {
    backgroundColor: 'rgba(0,0,0,0.7)',
    color: '#FFFFFF', fontSize: 13, fontWeight: '500',
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 9999,
  },

  // Recording progress
  recProgressSection: { marginBottom: 12 },
  recProgressLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  recProgressLabel: { fontSize: 11, fontWeight: '700', color: '#FF8C42', letterSpacing: 0.5 },
  recProgressTime: { fontSize: 13, color: '#6B6B6B' },

  // Prompt card
  promptCard: {
    backgroundColor: '#FFFFFF', borderRadius: 24,
    padding: 20, alignItems: 'center', marginBottom: 16,
  },
  promptCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  promptCardLabel: { fontSize: 11, fontWeight: '700', color: '#B8B8B8', letterSpacing: 0.5 },
  promptCardText: { fontSize: 17, fontWeight: '600', color: '#1A1A1A', textAlign: 'center', lineHeight: 24 },
  promptCardNote: { fontSize: 11, color: '#999999', marginTop: 6, textAlign: 'center' },

  // Buttons
  primaryBtn: {
    backgroundColor: '#FF8C42', borderRadius: 9999,
    paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 8,
    shadowColor: '#FF8C42', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  primaryBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  secondaryBtn: { backgroundColor: '#FFE8D6', borderRadius: 9999, paddingVertical: 16, alignItems: 'center', marginTop: 10 },
  secondaryBtnText: { color: '#FF8C42', fontSize: 16, fontWeight: '700' },
  cancelBtn: { paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  cancelBtnText: { fontSize: 14, color: '#999999', fontWeight: '500' },
  shareBtn: {
    backgroundColor: '#FFFFFF', borderRadius: 9999,
    paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 10, borderWidth: 2, borderColor: '#E0E0E0',
  },
  shareBtnText: { color: '#1A1A1A', fontSize: 16, fontWeight: '700' },

  // Processing
  processingSubtitle: { fontSize: 13, color: '#6B6B6B', fontWeight: '600', marginBottom: 6 },
  processingTitle: { fontSize: 28, fontWeight: '700', color: '#1A1A1A', marginBottom: 32 },
  pulseWrap: { width: 128, height: 128, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  pulseRing: { position: 'absolute', width: 128, height: 128, borderRadius: 64, backgroundColor: '#FF8C42', opacity: 0.1 },
  pulseCircle: { width: 128, height: 128, borderRadius: 64, backgroundColor: '#FFD4B8', alignItems: 'center', justifyContent: 'center' },
  processingBody: { fontSize: 18, fontWeight: '700', color: '#1A1A1A', marginBottom: 6 },
  processingBodySub: { fontSize: 13, color: '#6B6B6B', textAlign: 'center', maxWidth: 260, lineHeight: 19, marginBottom: 28 },
  progressBarWrap: { width: '100%', maxWidth: 300 },
  progressLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  progressLabelText: { fontSize: 12, color: '#6B6B6B' },

  // Result
  resultHeaderSection: { alignItems: 'center', marginBottom: 28 },
  resultTitle: { fontSize: 28, fontWeight: '700', color: '#1A1A1A', marginBottom: 6 },
  resultSub: { fontSize: 15, color: '#6B6B6B' },
  ringWrap: { alignItems: 'center', marginBottom: 24 },
  riskBadge: { borderRadius: 9999, paddingHorizontal: 20, paddingVertical: 8, marginTop: 12 },
  riskBadgeText: { fontSize: 14, fontWeight: '700' },
  insightCard: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 20, alignItems: 'center', marginBottom: 24 },
  insightText: { fontSize: 14, color: '#6B6B6B', textAlign: 'center', lineHeight: 21 },

  // 2x2 metrics grid
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
  metricCard: {
    width: '47%', backgroundColor: '#FFFFFF', borderRadius: 16,
    padding: 16, gap: 4,
  },
  metricCardHeader: { marginBottom: 4 },
  metricCardLabel: { fontSize: 11, fontWeight: '600', color: '#6B6B6B', letterSpacing: 0.5 },
  metricCardValue: { fontSize: 22, fontWeight: '700', color: '#1A1A1A', marginBottom: 8 },

  // Error
  errorTitle: { fontSize: 20, fontWeight: '700', color: '#1A1A1A', marginBottom: 8, textAlign: 'center' },
  mutedText: { fontSize: 13, color: '#6B6B6B', textAlign: 'center', maxWidth: 280, lineHeight: 19, marginBottom: 16, marginTop: 6 },
});
