// DoctorDashboard — matches web DoctorDashboard.tsx exactly
// SVG line chart using react-native-svg
// Requirements: 8.1, 8.3

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
import Svg, { Path, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

import {
  getUserName,
  getDailyAggregatedData,
  getTestHistory,
  formatTimestamp,
  type TestRecord,
  type DailyData,
} from '../utils/storage';

// ─── SVG Line Chart (matches web DoctorDashboard exactly) ────────────────────

const CHART_W = 280;
const CHART_H = 128;

// Static data points matching web: [65, 58, 70, 55, 62, 68, 52]
const STATIC_POINTS = [65, 58, 70, 55, 62, 68, 52];
const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

function DoctorLineChart() {
  const maxVal = Math.max(...STATIC_POINTS);
  const points = STATIC_POINTS.map((v, i) => ({
    x: (i / (STATIC_POINTS.length - 1)) * CHART_W,
    y: CHART_H - (v / maxVal) * CHART_H,
  }));

  let pathD = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    pathD += ` L ${points[i].x} ${points[i].y}`;
  }
  const fillPath = `${pathD} L ${CHART_W} ${CHART_H} L 0 ${CHART_H} Z`;

  return (
    <View>
      <View style={{ height: CHART_H + 8, position: 'relative' }}>
        {/* Grid lines */}
        {[0, 1, 2, 3].map((i) => (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: 0, right: 0,
              top: (i / 3) * CHART_H,
              height: 1,
              backgroundColor: '#E8E8E8',
            }}
          />
        ))}
        <Svg width="100%" height={CHART_H + 8} viewBox={`0 0 ${CHART_W} ${CHART_H + 8}`}>
          <Defs>
            <LinearGradient id="docGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor="#4A90E2" stopOpacity="0.3" />
              <Stop offset="100%" stopColor="#4A90E2" stopOpacity="0.05" />
            </LinearGradient>
          </Defs>
          <Path d={fillPath} fill="url(#docGrad)" />
          <Path d={pathD} fill="none" stroke="#4A90E2" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          {points.map((pt, i) => (
            <Circle
              key={i}
              cx={pt.x} cy={pt.y} r={i === points.length - 1 ? 5 : 4}
              fill={i === points.length - 1 ? '#FF8C42' : '#4A90E2'}
              stroke="white" strokeWidth={i === points.length - 1 ? 2 : 0}
            />
          ))}
        </Svg>
      </View>
      {/* X-axis labels */}
      <View style={dc.xLabels}>
        {DAYS.map((d, i) => (
          <Text key={i} style={[dc.xLabel, i === DAYS.length - 1 && dc.xLabelHighlight]}>{d}</Text>
        ))}
      </View>
    </View>
  );
}

const dc = StyleSheet.create({
  xLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  xLabel: { fontSize: 10, color: '#999999', fontWeight: '600' },
  xLabelHighlight: { color: '#FF8C42', fontWeight: '700' },
});

// ─── Patient row ──────────────────────────────────────────────────────────────

interface Patient {
  name: string;
  age: number;
  lastTest: string;
  risk: 'HIGH' | 'MEDIUM' | 'LOW';
  score: number;
}

function getRiskStyle(risk: string) {
  switch (risk) {
    case 'HIGH':   return { bg: '#FFF0F0', border: '#FFCCCC', text: '#FF6B6B' };
    case 'MEDIUM': return { bg: '#FFF8E8', border: '#FFE0A0', text: '#FF9F43' };
    default:       return { bg: '#F0FFF8', border: '#B8EDD8', text: '#5DBEA3' };
  }
}

function PatientRow({ patient }: { patient: Patient }) {
  const rs = getRiskStyle(patient.risk);
  const initials = patient.name.split(' ').map((n) => n[0]).join('');
  return (
    <View style={[s.patientRow, { backgroundColor: rs.bg, borderColor: rs.border }]}>
      <View style={s.patientAvatar}>
        <Text style={s.patientInitials}>{initials}</Text>
      </View>
      <View style={s.patientInfo}>
        <Text style={s.patientName}>{patient.name}</Text>
        <Text style={s.patientMeta}>Age: {patient.age} • Last test: {patient.lastTest}</Text>
      </View>
      <View style={s.patientRight}>
        <Text style={[s.patientRisk, { color: rs.text }]}>{patient.risk} RISK</Text>
        <Text style={s.patientScore}>Score: {patient.score}</Text>
      </View>
    </View>
  );
}

// ─── Bottom nav ───────────────────────────────────────────────────────────────

function BottomNav() {
  return (
    <View style={s.bottomNav}>
      <TouchableOpacity style={s.navItem} onPress={() => router.push('/(tabs)/home')}>
        <Ionicons name="home" size={24} color="#FF8C42" />
        <Text style={[s.navLabel, { color: '#FF8C42' }]}>HOME</Text>
      </TouchableOpacity>
      <TouchableOpacity style={s.navItem} onPress={() => router.push('/(tabs)/history')}>
        <Ionicons name="people-outline" size={24} color="#999999" />
        <Text style={s.navLabel}>PATIENTS</Text>
      </TouchableOpacity>
      <TouchableOpacity style={s.navItem} onPress={() => router.push('/(tabs)/insights')}>
        <Ionicons name="bar-chart-outline" size={24} color="#999999" />
        <Text style={s.navLabel}>REPORTS</Text>
      </TouchableOpacity>
      <TouchableOpacity style={s.navItem} onPress={() => router.push('/(tabs)/profile')}>
        <Ionicons name="settings-outline" size={24} color="#999999" />
        <Text style={s.navLabel}>SETTINGS</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Placeholder patients ─────────────────────────────────────────────────────

const PLACEHOLDER_PATIENTS: Patient[] = [
  { name: 'Martha Stewart', age: 72, lastTest: '2h ago', risk: 'HIGH', score: 8.4 },
  { name: 'James Wilson', age: 65, lastTest: 'Yesterday', risk: 'MEDIUM', score: 5.2 },
  { name: 'Elena Rodriguez', age: 48, lastTest: '3d ago', risk: 'LOW', score: 1.8 },
];

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function DoctorDashboard() {
  const [doctorName, setDoctorName] = useState('Doctor');
  const [recentTests, setRecentTests] = useState<TestRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [name, history] = await Promise.all([getUserName(), getTestHistory()]);
    setDoctorName(name ? name.split(' ')[0] : 'Doctor');
    setRecentTests(history.slice(0, 5));
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const highRiskCount = recentTests.filter((t) => t.riskLevel === 'High').length;

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
        <TouchableOpacity style={[s.topBarBtn, { backgroundColor: '#FFE8D6' }]}>
          <Ionicons name="notifications-outline" size={20} color="#FF8C42" />
        </TouchableOpacity>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {/* Welcome card */}
        <View style={s.welcomeCard}>
          <View style={s.welcomeAvatar}>
            <Text style={s.welcomeAvatarText}>{doctorName.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.welcomeTitle}>Doctor Dashboard</Text>
            <Text style={s.welcomeSub}>Welcome back, Dr. {doctorName}</Text>
          </View>
        </View>

        {loading ? (
          <ActivityIndicator color="#FF8C42" style={{ marginTop: 40 }} />
        ) : (
          <>
            {/* Stats grid */}
            <View style={s.statsGrid}>
              <View style={s.statCard}>
                <View style={s.statHeader}>
                  <Text style={s.statLabel}>Total Patients</Text>
                  <Ionicons name="people-outline" size={18} color="#FF8C42" />
                </View>
                <Text style={s.statValue}>20</Text>
                <Text style={s.statChange}>+2 this month</Text>
              </View>
              <View style={s.statCard}>
                <View style={s.statHeader}>
                  <Text style={s.statLabel}>Active Screenings</Text>
                  <Ionicons name="trending-up-outline" size={18} color="#4A90E2" />
                </View>
                <Text style={s.statValue}>8</Text>
                <Text style={s.statChange}>+2 this week</Text>
              </View>
            </View>

            {/* High risk alert */}
            <View style={s.alertCard}>
              <View style={s.alertIcon}>
                <Ionicons name="warning-outline" size={22} color="#FF6B6B" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.alertTitle}>HIGH RISK ALERTS</Text>
                <Text style={s.alertSub}>Requires attention</Text>
              </View>
              <Text style={s.alertCount}>{highRiskCount || 3}</Text>
            </View>

            {/* Patient Risk Trend card with SVG line chart */}
            <View style={s.card}>
              <View style={s.cardHeader}>
                <Text style={s.cardTitle}>Patient Risk Trend</Text>
                <Text style={s.cardMeta}>Last 7 Days</Text>
              </View>
              <DoctorLineChart />
              <View style={s.legendRow}>
                <View style={s.legendDot} />
                <Text style={s.legendText}>Average Risk Score</Text>
              </View>
            </View>

            {/* Recent Patients */}
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>Recent Patients</Text>
              <TouchableOpacity onPress={() => router.push('/(tabs)/history')}>
                <Text style={s.viewAll}>View all</Text>
              </TouchableOpacity>
            </View>

            <View style={s.patientList}>
              {recentTests.length > 0
                ? recentTests.map((t) => (
                    <PatientRow
                      key={t.id}
                      patient={{
                        name: t.name,
                        age: 0,
                        lastTest: formatTimestamp(t.timestamp),
                        risk: t.riskLevel === 'Low' ? 'LOW' : t.riskLevel === 'Medium' ? 'MEDIUM' : 'HIGH',
                        score: Math.round(t.riskScore * 10) / 10,
                      }}
                    />
                  ))
                : PLACEHOLDER_PATIENTS.map((p, i) => <PatientRow key={i} patient={p} />)}
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
    backgroundColor: '#4A90E2', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  welcomeAvatarText: { color: '#FFFFFF', fontSize: 20, fontWeight: '700' },
  welcomeTitle: { fontSize: 17, fontWeight: '700', color: '#1A1A1A' },
  welcomeSub: { fontSize: 13, color: '#6B6B6B', marginTop: 2 },

  // Stats grid
  statsGrid: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  statCard: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 20, padding: 16 },
  statHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  statLabel: { fontSize: 12, color: '#6B6B6B', flex: 1, marginRight: 4 },
  statValue: { fontSize: 28, fontWeight: '700', color: '#1A1A1A' },
  statChange: { fontSize: 11, fontWeight: '600', color: '#27AE60', marginTop: 2 },

  // Alert card
  alertCard: {
    backgroundColor: '#FFF0F0', borderWidth: 2, borderColor: '#FFCCCC',
    borderRadius: 20, padding: 16,
    flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16,
  },
  alertIcon: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#FFE0E0', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  alertTitle: { fontSize: 15, fontWeight: '700', color: '#8B0000' },
  alertSub: { fontSize: 12, color: '#C0392B', marginTop: 2 },
  alertCount: { fontSize: 32, fontWeight: '700', color: '#8B0000' },

  // Card
  card: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 18, marginBottom: 20 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  cardTitle: { fontSize: 17, fontWeight: '700', color: '#1A1A1A' },
  cardMeta: { fontSize: 11, color: '#999999' },
  legendRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F0F0F0',
  },
  legendDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#4A90E2' },
  legendText: { fontSize: 12, color: '#6B6B6B' },

  // Section header
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { fontSize: 20, fontWeight: '700', color: '#1A1A1A' },
  viewAll: { fontSize: 13, fontWeight: '700', color: '#FF8C42' },

  // Patient list
  patientList: { gap: 10, marginBottom: 16 },
  patientRow: { borderWidth: 2, borderRadius: 20, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  patientAvatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  patientInitials: { fontSize: 16, fontWeight: '700', color: '#1A1A1A' },
  patientInfo: { flex: 1 },
  patientName: { fontSize: 15, fontWeight: '700', color: '#1A1A1A' },
  patientMeta: { fontSize: 12, color: '#6B6B6B', marginTop: 2 },
  patientRight: { alignItems: 'flex-end', gap: 4 },
  patientRisk: { fontSize: 11, fontWeight: '700' },
  patientScore: { fontSize: 13, fontWeight: '700', color: '#1A1A1A' },

  // Bottom nav
  bottomNav: {
    flexDirection: 'row', backgroundColor: '#FFFFFF',
    borderTopWidth: 1, borderTopColor: '#E8E8E8',
    paddingHorizontal: 8, paddingVertical: 10, paddingBottom: 16,
  },
  navItem: { flex: 1, alignItems: 'center', gap: 3 },
  navLabel: { fontSize: 10, fontWeight: '600', color: '#999999', letterSpacing: 0.3 },
});
