// HomeDashboard — matches web HomeDashboard.tsx exactly
// Requirements: 7.4, 8.5

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';

import { getUserName, getRecentTests, formatTimestamp, type TestRecord } from '../../utils/storage';
import { checkBackendHealth } from '../../utils/voiceAnalysisAPI';

// ─── Streak ring ──────────────────────────────────────────────────────────────

const STREAK_DAYS = 5;
const STREAK_TOTAL = 7;
const RING_SIZE = 72;
const RING_RADIUS = 28;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS; // ≈ 175.9

function StreakRing({ days, total }: { days: number; total: number }) {
  const filled = (days / total) * RING_CIRCUMFERENCE;
  const center = RING_SIZE / 2;
  return (
    <View style={s.ringWrap}>
      <Svg width={RING_SIZE} height={RING_SIZE}>
        <Circle cx={center} cy={center} r={RING_RADIUS} stroke="#E8E8E8" strokeWidth={8} fill="none" />
        <Circle
          cx={center} cy={center} r={RING_RADIUS}
          stroke="#FF8C42" strokeWidth={8} fill="none"
          strokeDasharray={[filled, RING_CIRCUMFERENCE]}
          strokeLinecap="round"
          rotation="-90"
          origin={`${center}, ${center}`}
        />
      </Svg>
      <View style={s.ringLabel}>
        <Text style={s.ringNumber}>{days}</Text>
        <Text style={s.ringDays}>DAYS</Text>
      </View>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function HomeDashboard() {
  const [userName, setUserName] = useState('');
  const [isOnline, setIsOnline] = useState(true);
  const [lastActivity, setLastActivity] = useState<TestRecord | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [name, health, recent] = await Promise.all([
      getUserName(),
      checkBackendHealth(),
      getRecentTests(1),
    ]);
    setUserName(name ? name.split(' ')[0] : 'Guest');
    setIsOnline(health);
    setLastActivity(recent[0] ?? null);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        {/* Header: logo circle (#FFD4B8 bg + pulse icon) + NeuroVoice + bell */}
        <View style={s.header}>
          <View style={s.logoRow}>
            <View style={s.logoCircle}>
              <Ionicons name="pulse" size={22} color="#FF8C42" />
            </View>
            <Text style={s.logoText}>NeuroVoice</Text>
          </View>
          <TouchableOpacity style={s.bellBtn}>
            <Ionicons name="notifications-outline" size={20} color="#1A1A1A" />
          </TouchableOpacity>
        </View>

        {/* Greeting */}
        {loading ? (
          <ActivityIndicator color="#FF8C42" style={{ marginBottom: 28 }} />
        ) : (
          <View style={s.greeting}>
            <Text style={s.greetTitle}>Good morning, {userName}</Text>
            <Text style={s.greetSub}>Ready for your daily check-in?</Text>
          </View>
        )}

        {/* Offline banner */}
        {!isOnline && (
          <View style={s.offlineBanner}>
            <Ionicons name="cloud-offline-outline" size={16} color="#fff" />
            <Text style={s.offlineText}>Backend unreachable — checks disabled</Text>
          </View>
        )}

        {/* Daily Wellness card */}
        <View style={s.wellnessCard}>
          <View style={s.wellnessRow}>
            <StreakRing days={STREAK_DAYS} total={STREAK_TOTAL} />
            <View style={s.wellnessInfo}>
              <Text style={s.wellnessTitle}>Daily Wellness</Text>
              <Text style={s.wellnessBody}>
                You're on a {STREAK_DAYS}-day streak! Keep it up to reach your weekly goal.
              </Text>
            </View>
          </View>
          <TouchableOpacity style={s.progressBtn} onPress={() => router.push('/(tabs)/insights')}>
            <Text style={s.progressBtnText}>View Progress</Text>
          </TouchableOpacity>
        </View>

        {/* Exercises section */}
        <Text style={s.sectionTitle}>Exercises</Text>

        {/* Voice Check card: bg #FFD4B8, orange icon box */}
        <TouchableOpacity
          style={[s.exerciseCard, s.voiceCard, !isOnline && s.cardDisabled]}
          onPress={() => isOnline && router.push('/voice-test')}
          disabled={!isOnline}
          activeOpacity={0.8}
        >
          <View style={[s.exerciseIcon, { backgroundColor: '#FF8C42' }]}>
            <Ionicons name="mic" size={28} color="#fff" />
          </View>
          <View style={s.exerciseInfo}>
            <Text style={s.exerciseName}>Voice Check</Text>
            <Text style={s.exerciseDesc}>Quick 2-minute vocal stability exercise</Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color="#FF8C42" />
        </TouchableOpacity>

        {/* Face Check card: bg #C8E6DD, teal icon box */}
        <TouchableOpacity
          style={[s.exerciseCard, s.faceCard, !isOnline && s.cardDisabled]}
          onPress={() => isOnline && router.push('/face-test')}
          disabled={!isOnline}
          activeOpacity={0.8}
        >
          <View style={[s.exerciseIcon, { backgroundColor: '#5DBEA3' }]}>
            <Ionicons name="happy-outline" size={28} color="#fff" />
          </View>
          <View style={s.exerciseInfo}>
            <Text style={s.exerciseName}>Face Check</Text>
            <Text style={s.exerciseDesc}>Daily mobility and expression check</Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color="#5DBEA3" />
        </TouchableOpacity>

        {/* Drawing Test card: bg #E8E4FF, purple icon box */}
        <TouchableOpacity
          style={[s.exerciseCard, s.drawingCard]}
          onPress={() => router.push('/drawing-test')}
          activeOpacity={0.8}
        >
          <View style={[s.exerciseIcon, { backgroundColor: '#7B68EE' }]}>
            <Ionicons name="pencil" size={28} color="#fff" />
          </View>
          <View style={s.exerciseInfo}>
            <Text style={s.exerciseName}>Drawing Test</Text>
            <Text style={s.exerciseDesc}>Spiral, line tracing & clock drawing</Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color="#7B68EE" />
        </TouchableOpacity>

        {/* Finger Tapping card: bg #FFF4E6, amber icon box */}
        <TouchableOpacity
          style={[s.exerciseCard, s.fingerCard]}
          onPress={() => router.push('/finger-test')}
          activeOpacity={0.8}
        >
          <View style={[s.exerciseIcon, { backgroundColor: '#FF9F43' }]}>
            <Ionicons name="hand-left-outline" size={28} color="#fff" />
          </View>
          <View style={s.exerciseInfo}>
            <Text style={s.exerciseName}>Finger Tapping</Text>
            <Text style={s.exerciseDesc}>Motor speed and rhythm assessment</Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color="#FF9F43" />
        </TouchableOpacity>

        {/* Health Monitoring section */}
        <Text style={s.sectionTitle}>Health Monitoring</Text>

        <TouchableOpacity
          style={[s.exerciseCard, { backgroundColor: '#DDD8F5' }]}
          onPress={() => router.push('/sleep-monitoring')}
          activeOpacity={0.8}
        >
          <View style={[s.exerciseIcon, { backgroundColor: '#7B68EE' }]}>
            <Ionicons name="moon" size={28} color="#fff" />
          </View>
          <View style={s.exerciseInfo}>
            <Text style={s.exerciseName}>Sleep & Physiology</Text>
            <Text style={s.exerciseDesc}>Track sleep, RBD risk, and dystonia patterns</Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color="#7B68EE" />
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.exerciseCard, { backgroundColor: '#C8E6DD' }]}
          onPress={() => router.push('/patient-network')}
          activeOpacity={0.8}
        >
          <View style={[s.exerciseIcon, { backgroundColor: '#5DBEA3' }]}>
            <Ionicons name="people" size={28} color="#fff" />
          </View>
          <View style={s.exerciseInfo}>
            <Text style={s.exerciseName}>Support Network</Text>
            <Text style={s.exerciseDesc}>Connect with patients at your HY stage</Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color="#5DBEA3" />
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.exerciseCard, { backgroundColor: '#FFD4B8' }]}
          onPress={() => router.push('/medication-tracking')}
          activeOpacity={0.8}
        >
          <View style={[s.exerciseIcon, { backgroundColor: '#FF8C42' }]}>
            <Ionicons name="medical" size={28} color="#fff" />
          </View>
          <View style={s.exerciseInfo}>
            <Text style={s.exerciseName}>Medication Tracker</Text>
            <Text style={s.exerciseDesc}>Log doses, track efficacy, smart scheduling</Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color="#FF8C42" />
        </TouchableOpacity>

        {/* Last activity card: white rounded-[20px], refresh icon in #FFE8D6 circle */}
        <View style={s.activityCard}>
          <View style={s.activityIcon}>
            <Ionicons name="refresh" size={20} color="#FF8C42" />
          </View>
          <View style={s.activityInfo}>
            <Text style={s.activityLabel}>Last activity</Text>
            <Text style={s.activityTime}>
              {lastActivity ? formatTimestamp(lastActivity.timestamp) : 'Yesterday, 4:30 PM'}
            </Text>
          </View>
          <TouchableOpacity onPress={() => router.push('/(tabs)/history')}>
            <Text style={s.reviewBtn}>REVIEW</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#EFEBE6' },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32 },

  // Header
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logoCircle: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#FFD4B8',
    alignItems: 'center', justifyContent: 'center',
  },
  logoText: { fontSize: 20, fontWeight: '700', color: '#1A1A1A' },
  bellBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
  },

  // Greeting
  greeting: { marginBottom: 20 },
  greetTitle: { fontSize: 32, fontWeight: '700', color: '#1A1A1A', lineHeight: 38, marginBottom: 6 },
  greetSub: { fontSize: 15, color: '#6B6B6B' },

  // Offline
  offlineBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#E74C3C', borderRadius: 12,
    paddingVertical: 10, paddingHorizontal: 14, marginBottom: 16,
  },
  offlineText: { color: '#fff', fontSize: 13, fontWeight: '600' },

  // Wellness card
  wellnessCard: {
    backgroundColor: '#FFFFFF', borderRadius: 24,
    padding: 24, marginBottom: 24,
  },
  wellnessRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 20, marginBottom: 20 },
  wellnessInfo: { flex: 1, paddingTop: 4 },
  wellnessTitle: { fontSize: 20, fontWeight: '700', color: '#1A1A1A', marginBottom: 6 },
  wellnessBody: { fontSize: 13, color: '#6B6B6B', lineHeight: 19 },
  progressBtn: {
    backgroundColor: '#FF8C42', borderRadius: 9999,
    height: 48, alignItems: 'center', justifyContent: 'center',
  },
  progressBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // Streak ring
  ringWrap: { width: RING_SIZE, height: RING_SIZE, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  ringLabel: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  ringNumber: { fontSize: 20, fontWeight: '700', color: '#1A1A1A' },
  ringDays: { fontSize: 9, fontWeight: '600', color: '#999999', letterSpacing: 0.5 },

  // Section title
  sectionTitle: { fontSize: 24, fontWeight: '700', color: '#1A1A1A', marginBottom: 14 },

  // Exercise cards
  exerciseCard: {
    borderRadius: 20, padding: 20,
    flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 12,
  },
  voiceCard: { backgroundColor: '#FFD4B8' },
  faceCard: { backgroundColor: '#C8E6DD' },
  drawingCard: { backgroundColor: '#E8E4FF' },
  fingerCard: { backgroundColor: '#FFF4E6' },
  cardDisabled: { opacity: 0.45 },
  exerciseIcon: {
    width: 60, height: 60, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  exerciseInfo: { flex: 1 },
  exerciseName: { fontSize: 18, fontWeight: '700', color: '#1A1A1A', marginBottom: 3 },
  exerciseDesc: { fontSize: 13, color: '#6B6B6B' },

  // Last activity card
  activityCard: {
    backgroundColor: '#FFFFFF', borderRadius: 20,
    padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 4,
  },
  activityIcon: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#FFE8D6',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  activityInfo: { flex: 1 },
  activityLabel: { fontSize: 13, fontWeight: '700', color: '#1A1A1A' },
  activityTime: { fontSize: 13, color: '#999999', marginTop: 1 },
  reviewBtn: { fontSize: 13, fontWeight: '700', color: '#FF8C42', letterSpacing: 0.5 },
});
