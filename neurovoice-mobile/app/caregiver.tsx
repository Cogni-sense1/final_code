// CaregiverDashboard — matches web CaregiverDashboard.tsx exactly
// Requirements: 8.1, 8.4

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

import {
  getUserName,
  getDailyAggregatedData,
  getAverageRisk,
  getRecentTests,
  formatTimestamp,
  type TestRecord,
  type DailyData,
} from '../utils/storage';

// ─── Bar chart (matches web exactly) ─────────────────────────────────────────

// Static heights matching web: [40, 45, 60, 35, 38, 32, 55]
const STATIC_HEIGHTS = [40, 45, 60, 35, 38, 32, 55];
const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'TODAY'];

function CaregiverBarChart() {
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 128, gap: 6 }}>
        {STATIC_HEIGHTS.map((h, i) => (
          <View key={i} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
            <View
              style={{
                width: '100%',
                height: `${h}%`,
                backgroundColor: i === STATIC_HEIGHTS.length - 1 ? '#FF8C42' : '#E0E0E0',
                borderRadius: 4,
              }}
            />
          </View>
        ))}
      </View>
      <View style={bc.xLabels}>
        {DAYS.map((d, i) => (
          <Text key={i} style={[bc.xLabel, i === DAYS.length - 1 && bc.xLabelHighlight]}>{d}</Text>
        ))}
      </View>
    </View>
  );
}

const bc = StyleSheet.create({
  xLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  xLabel: { fontSize: 9, color: '#999999', fontWeight: '600' },
  xLabelHighlight: { color: '#FF8C42', fontWeight: '700' },
});

// ─── Bottom nav ───────────────────────────────────────────────────────────────

function BottomNav() {
  return (
    <View style={s.bottomNav}>
      <TouchableOpacity style={s.navItem} onPress={() => router.push('/(tabs)/home')}>
        <Ionicons name="heart" size={24} color="#5DBEA3" />
        <Text style={[s.navLabel, { color: '#5DBEA3' }]}>HOME</Text>
      </TouchableOpacity>
      <TouchableOpacity style={s.navItem} onPress={() => router.push('/(tabs)/history')}>
        <Ionicons name="calendar-outline" size={24} color="#999999" />
        <Text style={s.navLabel}>SCHEDULE</Text>
      </TouchableOpacity>
      <TouchableOpacity style={s.navItem} onPress={() => router.push('/(tabs)/insights')}>
        <Ionicons name="pulse-outline" size={24} color="#999999" />
        <Text style={s.navLabel}>ACTIVITY</Text>
      </TouchableOpacity>
      <TouchableOpacity style={s.navItem} onPress={() => router.push('/(tabs)/profile')}>
        <Ionicons name="document-text-outline" size={24} color="#999999" />
        <Text style={s.navLabel}>REPORTS</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function CaregiverDashboard() {
  const [caregiverName, setCaregiverName] = useState('Caregiver');
  const [avgRisk, setAvgRisk] = useState(0);
  const [recentTests, setRecentTests] = useState<TestRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [name, avg, recent] = await Promise.all([
      getUserName(),
      getAverageRisk(7),
      getRecentTests(3),
    ]);
    setCaregiverName(name ? name.split(' ')[0] : 'Caregiver');
    setAvgRisk(avg);
    setRecentTests(recent);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const avgRiskPct = Math.round(avgRisk * 100);
  const riskLabel = avgRiskPct < 33 ? 'Low Risk' : avgRiskPct < 66 ? 'Medium Risk' : 'High Risk';
  const riskColor = avgRiskPct < 33 ? '#5DBEA3' : avgRiskPct < 66 ? '#FF9F43' : '#FF6B6B';
  const riskBg = avgRiskPct < 33 ? '#D4F1E8' : avgRiskPct < 66 ? '#FFE8D6' : '#FFE0E0';
  const riskBorder = avgRiskPct < 33 ? '#B8EDD8' : avgRiskPct < 66 ? '#FFD4A0' : '#FFCCCC';

  const latestVoice = recentTests.find((t) => t.type === 'VOICE');
  const latestFace = recentTests.find((t) => t.type === 'FACE');
  const voiceStability = latestVoice ? Math.round((1 - latestVoice.riskScore) * 100) : 92;
  const faceSymmetry = latestFace ? Math.round((1 - latestFace.riskScore) * 100) : 96;

  return (
    <SafeAreaView style={s.safe}>
      {/* Top bar */}
      <View style={s.topBar}>
        <TouchableOpacity style={s.topBarBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color="#1A1A1A" />
        </TouchableOpacity>
        <View style={s.logoRow}>
          <View style={s.logoCircle}>
            <Ionicons name="pulse" size={18} color="#FF8C42" />
          </View>
          <Text style={s.logoText}>NeuroVoice</Text>
        </View>
        <TouchableOpacity style={[s.topBarBtn, { backgroundColor: '#C8E6DD' }]}>
          <Ionicons name="notifications-outline" size={20} color="#5DBEA3" />
        </TouchableOpacity>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {/* Welcome card */}
        <View style={s.welcomeCard}>
          <View style={s.welcomeAvatar}>
            <Ionicons name="heart" size={24} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.welcomeTitle}>Caregiver Dashboard</Text>
            <Text style={s.welcomeSub}>Welcome, {caregiverName}</Text>
          </View>
        </View>

        {loading ? (
          <ActivityIndicator color="#5DBEA3" style={{ marginTop: 40 }} />
        ) : (
          <>
            {/* Patient info card */}
            <View style={s.card}>
              <View style={s.patientHeader}>
                <View style={s.patientAvatar}>
                  <Text style={s.patientInitials}>AM</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.patientName}>Arthur Morgan</Text>
                  <Text style={s.patientMeta}>Patient ID: #88992-08</Text>
                  <Text style={s.patientMeta}>68 Years</Text>
                </View>
                <View style={s.activeIndicator} />
              </View>
              <View style={s.activeBadge}>
                <Text style={s.activeBadgeText}>Active Monitoring</Text>
              </View>
            </View>

            {/* Risk score card: matches web green-50/green-100 gradient */}
            <View style={[s.riskCard, { backgroundColor: riskBg, borderColor: riskBorder }]}>
              <View style={s.riskRow}>
                <View>
                  <Text style={[s.riskLabel, { color: riskColor }]}>AVERAGE RISK SCORE</Text>
                  <Text style={[s.riskValue, { color: riskColor }]}>{riskLabel}</Text>
                </View>
                <View style={[s.riskIcon, { backgroundColor: riskBg }]}>
                  <Ionicons name="trending-down-outline" size={24} color={riskColor} />
                </View>
              </View>
              <Text style={[s.riskTrend, { color: riskColor }]}>
                <Ionicons name="trending-down-outline" size={14} color={riskColor} /> -5.2% from last week
              </Text>
            </View>

            {/* 7-Day Risk Trend */}
            <View style={s.card}>
              <Text style={s.cardTitle}>7-Day Risk Trend</Text>
              <CaregiverBarChart />
            </View>

            {/* Latest Analysis */}
            <View style={s.card}>
              <View style={s.cardHeaderRow}>
                <Text style={s.cardTitle}>Latest Analysis</Text>
                <Text style={s.cardMeta}>
                  {recentTests[0] ? formatTimestamp(recentTests[0].timestamp) : 'Updated 24m ago'}
                </Text>
              </View>

              {/* Voice Stability */}
              <View style={s.analysisRow}>
                <View style={[s.analysisIcon, { backgroundColor: '#FFD4B8' }]}>
                  <Ionicons name="mic-outline" size={20} color="#FF8C42" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.analysisName}>Voice Stability</Text>
                  <Text style={s.analysisSub}>Tremor level: Minimal</Text>
                </View>
                <Text style={[s.analysisScore, { color: '#5DBEA3' }]}>{voiceStability}%</Text>
              </View>

              {/* Facial Symmetry */}
              <View style={s.analysisRow}>
                <View style={[s.analysisIcon, { backgroundColor: '#C8E6DD' }]}>
                  <Ionicons name="happy-outline" size={20} color="#5DBEA3" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.analysisName}>Facial Symmetry</Text>
                  <Text style={s.analysisSub}>Micro-expressions: Normal</Text>
                </View>
                <Text style={[s.analysisScore, { color: '#5DBEA3' }]}>{faceSymmetry}%</Text>
              </View>
            </View>

            {/* Daily Logs */}
            <View style={s.card}>
              <Text style={s.cardTitle}>Daily Logs</Text>

              {/* Medication */}
              <View style={s.logRow}>
                <View style={[s.logIcon, { backgroundColor: '#D4F1E8' }]}>
                  <Ionicons name="medical-outline" size={20} color="#27AE60" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.logName}>Medication</Text>
                  <Text style={s.logSub}>Levodopa - Morning Dose</Text>
                </View>
                <View style={s.takenBadge}>
                  <Text style={s.takenText}>TAKEN</Text>
                </View>
              </View>

              {/* Sleep Quality */}
              <TouchableOpacity style={s.logRow} activeOpacity={0.7}>
                <View style={[s.logIcon, { backgroundColor: '#E8F0FF' }]}>
                  <Ionicons name="moon-outline" size={20} color="#4A90E2" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.logName}>Sleep Quality</Text>
                  <Text style={s.logSub}>7h 42m • Deep Sleep: 2h</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#999999" />
              </TouchableOpacity>

              {/* Morning Mood */}
              <TouchableOpacity style={s.logRow} activeOpacity={0.7}>
                <View style={[s.logIcon, { backgroundColor: '#FFF8D6' }]}>
                  <Ionicons name="happy-outline" size={20} color="#F0A500" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.logName}>Morning Mood</Text>
                  <Text style={s.logSub}>"Feeling energetic and clear"</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#999999" />
              </TouchableOpacity>
            </View>

            {/* Action buttons */}
            <View style={s.actionRow}>
              <TouchableOpacity style={s.actionPrimary} activeOpacity={0.8}>
                <Ionicons name="call-outline" size={20} color="#FFFFFF" />
                <Text style={s.actionPrimaryText}>Contact Doctor</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.actionSecondary} activeOpacity={0.8}>
                <Ionicons name="document-text-outline" size={20} color="#1A1A1A" />
                <Text style={s.actionSecondaryText}>Export Log</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>

      <BottomNav />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#EFEBE6' },

  // Top bar
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10,
  },
  topBarBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
  },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  logoCircle: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#FFD4B8', alignItems: 'center', justifyContent: 'center',
  },
  logoText: { fontSize: 17, fontWeight: '700', color: '#1A1A1A' },

  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 },

  // Welcome card
  welcomeCard: {
    backgroundColor: '#FFFFFF', borderRadius: 24,
    padding: 20, flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16,
  },
  welcomeAvatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: '#5DBEA3', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  welcomeTitle: { fontSize: 17, fontWeight: '700', color: '#1A1A1A' },
  welcomeSub: { fontSize: 13, color: '#6B6B6B', marginTop: 2 },

  // Card
  card: {
    backgroundColor: '#FFFFFF', borderRadius: 24,
    padding: 18, marginBottom: 16, gap: 12,
  },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontSize: 17, fontWeight: '700', color: '#1A1A1A' },
  cardMeta: { fontSize: 11, color: '#999999' },

  // Patient info
  patientHeader: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  patientAvatar: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: '#4A90E2', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  patientInitials: { color: '#FFFFFF', fontSize: 22, fontWeight: '700' },
  patientName: { fontSize: 18, fontWeight: '700', color: '#1A1A1A' },
  patientMeta: { fontSize: 13, color: '#6B6B6B', marginTop: 1 },
  activeIndicator: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#27AE60', alignSelf: 'flex-start', marginTop: 4 },
  activeBadge: { backgroundColor: '#C8E6DD', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 6, alignSelf: 'flex-start' },
  activeBadgeText: { fontSize: 13, fontWeight: '600', color: '#5DBEA3' },

  // Risk card
  riskCard: { borderWidth: 2, borderRadius: 24, padding: 18, marginBottom: 16 },
  riskRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  riskLabel: { fontSize: 12, fontWeight: '600', letterSpacing: 0.5, marginBottom: 4 },
  riskValue: { fontSize: 26, fontWeight: '700' },
  riskIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  riskTrend: { fontSize: 13, fontWeight: '600' },

  // Analysis rows
  analysisRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#F5F5F5', borderRadius: 16, padding: 12,
  },
  analysisIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  analysisName: { fontSize: 14, fontWeight: '700', color: '#1A1A1A' },
  analysisSub: { fontSize: 12, color: '#6B6B6B', marginTop: 2 },
  analysisScore: { fontSize: 18, fontWeight: '700' },

  // Log rows
  logRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#F5F5F5', borderRadius: 16, padding: 12,
  },
  logIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  logName: { fontSize: 14, fontWeight: '700', color: '#1A1A1A' },
  logSub: { fontSize: 12, color: '#6B6B6B', marginTop: 2 },
  takenBadge: { backgroundColor: '#D4F1E8', borderRadius: 9999, paddingHorizontal: 10, paddingVertical: 4 },
  takenText: { fontSize: 11, fontWeight: '700', color: '#27AE60' },

  // Action buttons
  actionRow: { flexDirection: 'row', gap: 12, marginBottom: 8 },
  actionPrimary: {
    flex: 1, backgroundColor: '#4A90E2', borderRadius: 20,
    height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  actionPrimaryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  actionSecondary: {
    flex: 1, backgroundColor: '#FFFFFF', borderRadius: 20,
    height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 2, borderColor: '#E0E0E0',
  },
  actionSecondaryText: { color: '#1A1A1A', fontSize: 14, fontWeight: '700' },

  // Bottom nav
  bottomNav: {
    flexDirection: 'row', backgroundColor: '#FFFFFF',
    borderTopWidth: 1, borderTopColor: '#E8E8E8',
    paddingHorizontal: 8, paddingVertical: 10, paddingBottom: 16,
  },
  navItem: { flex: 1, alignItems: 'center', gap: 3 },
  navLabel: { fontSize: 10, fontWeight: '600', color: '#999999', letterSpacing: 0.3 },
});
