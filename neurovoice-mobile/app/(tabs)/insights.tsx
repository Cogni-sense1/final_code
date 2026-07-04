// Insights screen — matches web Insights.tsx exactly
// SVG smooth bezier line chart using react-native-svg
// Requirements: 9.3, 9.4, 9.5

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
  getDailyAggregatedData,
  getAverageRisk,
  getRecentTests,
  formatTimestamp,
  type TestRecord,
  type DailyData,
} from '../../utils/storage';
import { getRiskLevel as getRiskLevelFromScore } from '../../constants/risk';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getRiskBadge(level: string): { bg: string; text: string } {
  switch (level) {
    case 'Low':      return { bg: '#D4F1E8', text: '#5DBEA3' };
    case 'Normal':   return { bg: '#D4F1E8', text: '#5DBEA3' };
    case 'Medium':   return { bg: '#FFE8D6', text: '#FF9F43' };
    case 'Mild':     return { bg: '#FFFBE6', text: '#B8860B' };
    case 'High':     return { bg: '#FFE0E0', text: '#FF6B6B' };
    case 'Moderate': return { bg: '#FFE8D6', text: '#FF9F43' };
    case 'Severe':   return { bg: '#FFE0E0', text: '#FF6B6B' };
    default:         return { bg: '#E0E0E0', text: '#6B6B6B' };
  }
}

// Unified thresholds — see neurovoice-mobile/constants/risk.ts.
// Accepts a 0–100 percentage and delegates to the shared 0–1 scheme.
function getRiskLevel(pct: number): 'Low' | 'Medium' | 'High' {
  return getRiskLevelFromScore(pct / 100);
}

// ─── SVG Line Chart (smooth bezier, matches web) ──────────────────────────────

const CHART_W = 320;
const CHART_H = 120;

interface LineChartProps {
  data: DailyData[];
}

function LineChart({ data }: LineChartProps) {
  const maxVal = Math.max(...data.map((d) => d.avgRisk * 100), 10);

  const points = data.map((d, i) => ({
    x: (i / (data.length - 1)) * CHART_W,
    y: CHART_H - ((d.avgRisk * 100) / maxVal) * CHART_H,
    hasData: d.count > 0,
  }));

  // Smooth bezier path (quadratic, same as web)
  let pathD = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const xMid = (points[i].x + points[i + 1].x) / 2;
    const cpX1 = (xMid + points[i].x) / 2;
    const cpX2 = (xMid + points[i + 1].x) / 2;
    pathD += ` Q ${cpX1} ${points[i].y}, ${xMid} ${(points[i].y + points[i + 1].y) / 2}`;
    pathD += ` Q ${cpX2} ${points[i + 1].y}, ${points[i + 1].x} ${points[i + 1].y}`;
  }

  const fillPath = `${pathD} L ${CHART_W} ${CHART_H} L 0 ${CHART_H} Z`;

  return (
    <View>
      <Svg width="100%" height={CHART_H + 10} viewBox={`0 0 ${CHART_W} ${CHART_H + 10}`}>
        <Defs>
          <LinearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor="#FF8C42" stopOpacity="0.1" />
            <Stop offset="100%" stopColor="#FF8C42" stopOpacity="0" />
          </LinearGradient>
        </Defs>
        {/* Gradient fill */}
        <Path d={fillPath} fill="url(#chartGrad)" />
        {/* Line */}
        <Path d={pathD} fill="none" stroke="#FF8C42" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {/* Data point dots */}
        {points.map((pt, i) =>
          pt.hasData ? (
            <Circle key={i} cx={pt.x} cy={pt.y} r={5} fill="#FF8C42" stroke="white" strokeWidth={2} />
          ) : null
        )}
      </Svg>
      {/* X-axis labels */}
      <View style={c.xLabels}>
        {data.map((d, i) => (
          <Text key={i} style={[c.xLabel, d.count > 0 && c.xLabelActive]}>{d.day}</Text>
        ))}
      </View>
    </View>
  );
}

const c = StyleSheet.create({
  xLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  xLabel: { fontSize: 10, fontWeight: '600', color: '#B8B8B8', letterSpacing: 0.5 },
  xLabelActive: { color: '#FF8C42' },
});

// ─── Recent test row ──────────────────────────────────────────────────────────

function TestRow({ item }: { item: TestRecord }) {
  const iconMap: Record<string, { icon: string; color: string; bg: string }> = {
    VOICE:   { icon: 'mic',               color: '#FF8C42', bg: '#FFE8D6' },
    FACE:    { icon: 'happy-outline',     color: '#7B68EE', bg: '#E8E4FF' },
    DRAWING: { icon: 'pencil',            color: '#5DBEA3', bg: '#C8E6DD' },
    FINGER:  { icon: 'hand-left-outline', color: '#FF9F43', bg: '#FFF4E6' },
  };
  const { icon, color, bg } = iconMap[item.type] ?? iconMap.VOICE;
  const badge = getRiskBadge(item.riskLevel);
  const riskPct = Math.round(item.riskScore * 100);

  // Key metric subtitle per type
  let subtitle = '';
  const m = item.metadata;
  if (m) {
    if (item.type === 'DRAWING' && m.tremorIndex !== undefined)
      subtitle = `Tremor: ${m.tremorIndex}  ·  Speed CV: ${m.speedCV ?? '—'}%`;
    else if (item.type === 'FINGER' && m.combinedUpdrs !== undefined)
      subtitle = `UPDRS: ${m.combinedUpdrs}/4  ·  L: ${m.leftFrequency ?? '—'} Hz  ·  R: ${m.rightFrequency ?? '—'} Hz`;
    else if (item.type === 'FINGER' && m.tapSpeedLeft !== undefined)
      subtitle = `L: ${m.tapSpeedLeft}/s  ·  R: ${m.tapSpeedRight ?? '—'}/s  ·  Asym: ${m.asymmetry ?? '—'}%`;
    else if (item.type === 'FACE' && m.blinkRate !== undefined)
      subtitle = `Blink: ${(m.blinkRate as number).toFixed(0)} bpm  ·  Asym: ${((m.asymmetry as number ?? 0) * 100).toFixed(1)}%`;
    else if (item.type === 'VOICE' && m.updrsScore !== undefined)
      subtitle = `UPDRS: ${m.updrsScore}  ·  Age 60+: ${m.age60Plus ? 'Yes' : 'No'}`;
  }

  return (
    <View style={s.testRow}>
      <View style={[s.testIcon, { backgroundColor: bg }]}>
        <Ionicons name={icon as any} size={20} color={color} />
      </View>
      <View style={s.testInfo}>
        <Text style={s.testName}>{item.name}</Text>
        <Text style={s.testTime}>{formatTimestamp(item.timestamp)}</Text>
        {subtitle ? <Text style={s.testSubtitle}>{subtitle}</Text> : null}
      </View>
      <View style={s.testRight}>
        <Text style={s.testPct}>{riskPct}%</Text>
        <View style={[s.badge, { backgroundColor: badge.bg }]}>
          <Text style={[s.badgeText, { color: badge.text }]}>{item.riskLevel.toUpperCase()} RISK</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function Insights() {
  const [chartData, setChartData] = useState<DailyData[]>([]);
  const [avgRisk, setAvgRisk] = useState(0);
  const [recentTests, setRecentTests] = useState<TestRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [daily, avg, recent] = await Promise.all([
      getDailyAggregatedData(7),
      getAverageRisk(7),
      getRecentTests(3),
    ]);
    setChartData(daily);
    setAvgRisk(avg);
    setRecentTests(recent);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const avgRiskPct = Math.round(avgRisk * 100);
  const avgRiskLevel = getRiskLevel(avgRiskPct);
  const avgBadge = getRiskBadge(avgRiskLevel);
  const hasData = chartData.some((d) => d.count > 0);

  // Trend calculation
  let trendLabel = '';
  let trendBg = '#D4F1E8';
  let trendColor = '#5DBEA3';
  if (hasData && chartData.length >= 4) {
    const recentAvg = chartData.slice(-3).reduce((s, d) => s + d.avgRisk, 0) / 3;
    const prevAvg = chartData.slice(0, 4).reduce((s, d) => s + d.avgRisk, 0) / 4;
    const trendPct = prevAvg > 0 ? ((recentAvg - prevAvg) / prevAvg) * 100 : 0;
    const dir = trendPct < 0 ? '↓' : '↑';
    trendColor = trendPct < 0 ? '#5DBEA3' : '#FF6B6B';
    trendBg = trendPct < 0 ? '#D4F1E8' : '#FFE0E0';
    trendLabel = `${dir} ${Math.abs(trendPct).toFixed(1)}%`;
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={s.header}>
          <Text style={s.headerTitle}>Insights</Text>
          <TouchableOpacity style={s.headerBtn}>
            <Ionicons name="calendar-outline" size={22} color="#1A1A1A" />
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator color="#FF8C42" style={{ marginTop: 40 }} />
        ) : (
          <>
            {/* Risk Score Trend card */}
            <View style={s.card}>
              <Text style={s.cardTitle}>Risk Score Trend</Text>
              <Text style={s.cardSub}>Your neurological markers over time</Text>

              {/* Average risk display */}
              <View style={s.avgRow}>
                <View>
                  <Text style={s.avgLabel}>AVERAGE RISK (7D)</Text>
                  <View style={s.avgValueRow}>
                    <Text style={s.avgValue}>{avgRiskPct}%</Text>
                    <View style={[s.badge, { backgroundColor: avgBadge.bg, marginLeft: 8 }]}>
                      <Text style={[s.badgeText, { color: avgBadge.text }]}>{avgRiskLevel}</Text>
                    </View>
                  </View>
                </View>
                {hasData && trendLabel !== '' && (
                  <View style={[s.trendBadge, { backgroundColor: trendBg }]}>
                    <Text style={[s.trendText, { color: trendColor }]}>{trendLabel}</Text>
                  </View>
                )}
              </View>

              {/* SVG line chart */}
              {hasData ? (
                <LineChart data={chartData} />
              ) : (
                <View style={s.emptyChart}>
                  <Text style={s.emptyChartText}>Complete tests to see your trend chart</Text>
                </View>
              )}
            </View>

            {/* Recent Tests section */}
            <View style={s.sectionHeader}>
              <Text style={s.sectionTitle}>Recent Tests</Text>
              <TouchableOpacity onPress={() => router.push('/(tabs)/history')}>
                <Text style={s.seeAll}>See All</Text>
              </TouchableOpacity>
            </View>

            {recentTests.length === 0 ? (
              <View style={s.emptyState}>
                <Text style={s.emptyTitle}>No tests yet</Text>
                <Text style={s.emptyBody}>
                  Complete your first test to start tracking your neurological health.
                </Text>
                <TouchableOpacity style={s.startBtn} onPress={() => router.push('/voice-test')} activeOpacity={0.8}>
                  <Text style={s.startBtnText}>Start Test</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={s.testList}>
                {recentTests.map((t) => <TestRow key={t.id} item={t} />)}
              </View>
            )}

            {/* Pro Insight card: gradient bg from #FFE8F5 to #FFE8D6, star icon in orange/pink gradient box */}
            <View style={s.proCard}>
              <View style={s.proIcon}>
                <Ionicons name="star" size={24} color="#FFFFFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.proTitle}>Pro Insight</Text>
                <Text style={s.proBody}>
                  Consistency in morning tests provides the most accurate trend data for voice stability tracking.
                </Text>
              </View>
            </View>
          </>
        )}
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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#1A1A1A' },
  headerBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
  },

  // Card
  card: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 24, marginBottom: 24 },
  cardTitle: { fontSize: 20, fontWeight: '700', color: '#1A1A1A', marginBottom: 4 },
  cardSub: { fontSize: 13, color: '#6B6B6B', marginBottom: 24 },

  // Average risk
  avgRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 },
  avgLabel: { fontSize: 10, fontWeight: '600', color: '#B8B8B8', letterSpacing: 0.8, marginBottom: 4 },
  avgValueRow: { flexDirection: 'row', alignItems: 'center' },
  avgValue: { fontSize: 48, fontWeight: '700', color: '#1A1A1A' },
  trendBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 9999, alignSelf: 'flex-start', marginTop: 8 },
  trendText: { fontSize: 12, fontWeight: '700' },

  // Badge
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 9999 },
  badgeText: { fontSize: 12, fontWeight: '700' },

  // Empty chart
  emptyChart: { height: 100, alignItems: 'center', justifyContent: 'center' },
  emptyChartText: { fontSize: 13, color: '#6B6B6B' },

  // Section header
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { fontSize: 20, fontWeight: '700', color: '#1A1A1A' },
  seeAll: { fontSize: 14, fontWeight: '700', color: '#FF8C42' },

  // Test list
  testList: { gap: 10, marginBottom: 24 },
  testRow: {
    backgroundColor: '#FFFFFF', borderRadius: 16,
    padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  testIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  testInfo: { flex: 1 },
  testName: { fontSize: 15, fontWeight: '700', color: '#1A1A1A', marginBottom: 2 },
  testTime: { fontSize: 13, color: '#999999' },
  testSubtitle: { fontSize: 11, color: '#6B6B6B', marginTop: 3 },
  testRight: { alignItems: 'flex-end', gap: 4 },
  testPct: { fontSize: 20, fontWeight: '700', color: '#1A1A1A' },

  // Empty state
  emptyState: {
    backgroundColor: '#FFFFFF', borderRadius: 20,
    padding: 32, alignItems: 'center', marginBottom: 24,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#1A1A1A', marginBottom: 8 },
  emptyBody: { fontSize: 14, color: '#6B6B6B', textAlign: 'center', marginBottom: 20, lineHeight: 20 },
  startBtn: { backgroundColor: '#FF8C42', borderRadius: 9999, paddingHorizontal: 24, paddingVertical: 10 },
  startBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },

  // Pro insight card
  proCard: {
    backgroundColor: '#FFE8D6', // approximates gradient from #FFE8F5 to #FFE8D6
    borderRadius: 24, padding: 20,
    flexDirection: 'row', gap: 14, alignItems: 'flex-start',
  },
  proIcon: {
    width: 48, height: 48, borderRadius: 16,
    backgroundColor: '#FF8C42', // approximates gradient from #FF8C42 to #FF6B9D
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  proTitle: { fontSize: 15, fontWeight: '700', color: '#1A1A1A', marginBottom: 4 },
  proBody: { fontSize: 13, color: '#6B6B6B', lineHeight: 19 },
});
