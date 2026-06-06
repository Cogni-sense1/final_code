// History screen — supports Voice, Face, Drawing, Finger test types

import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator, SafeAreaView, ScrollView,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getTestsByType, formatTimestamp, type TestRecord } from '../../utils/storage';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getRiskBadge(level: string) {
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

type TabType = 'voice' | 'face' | 'drawing' | 'finger';

const TABS: { id: TabType; label: string; icon: string; color: string; bg: string; route: string }[] = [
  { id: 'voice',   label: 'Voice',   icon: 'mic',              color: '#FF8C42', bg: '#FFE8D6', route: '/voice-test'   },
  { id: 'face',    label: 'Face',    icon: 'happy-outline',    color: '#7B68EE', bg: '#E8E4FF', route: '/face-test'    },
  { id: 'drawing', label: 'Drawing', icon: 'pencil',           color: '#5DBEA3', bg: '#C8E6DD', route: '/drawing-test' },
  { id: 'finger',  label: 'Finger',  icon: 'hand-left-outline',color: '#FF9F43', bg: '#FFF4E6', route: '/finger-test'  },
];

const TAB_TO_TYPE: Record<TabType, 'VOICE' | 'FACE' | 'DRAWING' | 'FINGER'> = {
  voice: 'VOICE', face: 'FACE', drawing: 'DRAWING', finger: 'FINGER',
};

// ─── Metadata detail rows ─────────────────────────────────────────────────────

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.metaRow}>
      <Text style={s.metaLabel}>{label}</Text>
      <Text style={s.metaValue}>{value}</Text>
    </View>
  );
}

function RecordMeta({ item }: { item: TestRecord }) {
  const m = item.metadata;
  if (!m) return null;

  if (item.type === 'VOICE') {
    return (
      <View style={s.metaBlock}>
        {m.age60Plus !== undefined    && <MetaRow label="Age 60+"        value={m.age60Plus ? 'Yes' : 'No'} />}
        {m.neuroHistory !== undefined && <MetaRow label="Neuro History"  value={m.neuroHistory ? 'Yes' : 'No'} />}
        {m.hypertension !== undefined && <MetaRow label="Hypertension"   value={m.hypertension ? 'Yes' : 'No'} />}
        {m.updrsScore !== undefined   && <MetaRow label="UPDRS Score"    value={`${m.updrsScore}/108`} />}
      </View>
    );
  }

  if (item.type === 'FACE') {
    return (
      <View style={s.metaBlock}>
        {m.blinkRate !== undefined && <MetaRow label="Blink Rate"    value={`${(m.blinkRate as number).toFixed(0)} bpm`} />}
        {m.motion    !== undefined && <MetaRow label="Facial Motion" value={(m.motion as number) > 1.5 ? 'Normal' : 'Reduced'} />}
        {m.asymmetry !== undefined && <MetaRow label="Asymmetry"     value={`${((m.asymmetry as number) * 100).toFixed(1)}%`} />}
      </View>
    );
  }

  if (item.type === 'DRAWING') {
    return (
      <View style={s.metaBlock}>
        {m.tremorIndex !== undefined && <MetaRow label="Tremor Index"  value={String(m.tremorIndex)} />}
        {m.speedCV     !== undefined && <MetaRow label="Speed CV"      value={`${m.speedCV}%`} />}
        {m.meanSpeed   !== undefined && <MetaRow label="Mean Speed"    value={`${m.meanSpeed} px/s`} />}
        {m.spiralRMSE  !== undefined && <MetaRow label="Spiral RMSE"   value={`${m.spiralRMSE} px`} />}
        {m.strokeCount !== undefined && <MetaRow label="Pen Lifts"     value={String(m.strokeCount)} />}
        {m.totalTime   !== undefined && <MetaRow label="Duration"      value={`${m.totalTime}s`} />}
      </View>
    );
  }

  if (item.type === 'FINGER') {
    return (
      <View style={s.metaBlock}>
        {m.leftFrequency  !== undefined && <MetaRow label="Left Frequency"  value={`${m.leftFrequency} Hz`} />}
        {m.rightFrequency !== undefined && <MetaRow label="Right Frequency" value={`${m.rightFrequency} Hz`} />}
        {m.leftUpdrs      !== undefined && <MetaRow label="Left UPDRS"      value={`${m.leftUpdrs} / 4`} />}
        {m.rightUpdrs     !== undefined && <MetaRow label="Right UPDRS"     value={`${m.rightUpdrs} / 4`} />}
        {m.combinedUpdrs  !== undefined && <MetaRow label="Combined UPDRS"  value={`${m.combinedUpdrs} / 4`} />}
        {/* legacy fields */}
        {m.tapSpeedLeft   !== undefined && !m.leftFrequency && <MetaRow label="Left Speed"  value={`${m.tapSpeedLeft} taps/s`} />}
        {m.tapSpeedRight  !== undefined && !m.rightFrequency && <MetaRow label="Right Speed" value={`${m.tapSpeedRight} taps/s`} />}
        {m.asymmetry      !== undefined && <MetaRow label="Asymmetry"       value={`${m.asymmetry}%`} />}
      </View>
    );
  }

  return null;
}

// ─── Record row ───────────────────────────────────────────────────────────────

function RecordRow({ item }: { item: TestRecord }) {
  const [expanded, setExpanded] = useState(false);
  const tab = TABS.find((t) => t.id === item.type.toLowerCase() as TabType) ?? TABS[0];
  const badge = getRiskBadge(item.riskLevel);
  const hasMetadata = !!item.metadata && Object.keys(item.metadata).length > 0;

  return (
    <TouchableOpacity
      style={s.row}
      onPress={() => hasMetadata ? setExpanded((v) => !v) : router.push(tab.route as any)}
      activeOpacity={0.8}
    >
      <View style={[s.iconCircle, { backgroundColor: tab.bg }]}>
        <Ionicons name={tab.icon as any} size={24} color={tab.color} />
      </View>
      <View style={s.rowInfo}>
        <Text style={s.rowName}>{item.name}</Text>
        <Text style={s.rowTime}>{formatTimestamp(item.timestamp)}</Text>
        {expanded && <RecordMeta item={item} />}
      </View>
      <View style={[s.badge, { backgroundColor: badge.bg }]}>
        <Text style={[s.badgeText, { color: badge.text }]}>{item.riskLevel} Risk</Text>
      </View>
      <Ionicons
        name={hasMetadata ? (expanded ? 'chevron-up' : 'chevron-down') : 'chevron-forward'}
        size={20} color="#999999"
      />
    </TouchableOpacity>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function History() {
  const [activeTab, setActiveTab] = useState<TabType>('voice');
  const [tests, setTests] = useState<TestRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const loadTests = useCallback(async () => {
    setLoading(true);
    const records = await getTestsByType(TAB_TO_TYPE[activeTab]);
    records.sort((a, b) => b.timestamp - a.timestamp);
    setTests(records);
    setLoading(false);
  }, [activeTab]);

  useFocusEffect(useCallback(() => { loadTests(); }, [loadTests]));

  const activeTabInfo = TABS.find((t) => t.id === activeTab)!;

  return (
    <SafeAreaView style={s.safe}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>Test History</Text>
        <TouchableOpacity style={s.headerBtn}>
          <Ionicons name="calendar-outline" size={22} color="#1A1A1A" />
        </TouchableOpacity>
      </View>

      {/* Tab pills — scrollable row of 4 */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.tabRow}
      >
        {TABS.map((t) => (
          <TouchableOpacity
            key={t.id}
            style={[s.pill, activeTab === t.id && { backgroundColor: t.color }]}
            onPress={() => setActiveTab(t.id)}
            activeOpacity={0.8}
          >
            <Ionicons name={t.icon as any} size={14} color={activeTab === t.id ? '#fff' : '#6B6B6B'} />
            <Text style={[s.pillText, activeTab === t.id && s.pillTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Section header */}
      <View style={s.sectionHeader}>
        <Text style={s.sectionTitle}>Recent Readings</Text>
        <TouchableOpacity>
          <Text style={s.seeAll}>See all</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color="#FF8C42" style={{ marginTop: 40 }} />
      ) : tests.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyTitle}>No tests yet</Text>
          <Text style={s.emptyBody}>
            Complete your first {activeTabInfo.label.toLowerCase()} test to see your history here.
          </Text>
          <TouchableOpacity
            style={s.startBtn}
            onPress={() => router.push(activeTabInfo.route as any)}
            activeOpacity={0.8}
          >
            <Text style={s.startBtnText}>Start Test</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={tests}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <RecordRow item={item} />}
          contentContainerStyle={s.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#EFEBE6' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 16, marginBottom: 16,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#1A1A1A' },
  headerBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
  },

  tabRow: { paddingHorizontal: 20, gap: 8, marginBottom: 20 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 9, paddingHorizontal: 16,
    borderRadius: 9999, backgroundColor: '#FFFFFF',
  },
  pillText: { fontSize: 13, fontWeight: '600', color: '#6B6B6B' },
  pillTextActive: { color: '#FFFFFF' },

  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, marginBottom: 12,
  },
  sectionTitle: { fontSize: 20, fontWeight: '700', color: '#1A1A1A' },
  seeAll: { fontSize: 14, fontWeight: '700', color: '#FF8C42' },

  listContent: { paddingHorizontal: 20, paddingBottom: 32, gap: 10 },

  row: {
    backgroundColor: '#FFFFFF', borderRadius: 16,
    padding: 16, flexDirection: 'row', alignItems: 'flex-start', gap: 12,
  },
  iconCircle: {
    width: 48, height: 48, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  rowInfo: { flex: 1 },
  rowName: { fontSize: 15, fontWeight: '700', color: '#1A1A1A', marginBottom: 2 },
  rowTime: { fontSize: 13, color: '#999999' },

  metaBlock: { marginTop: 10, gap: 4 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between' },
  metaLabel: { fontSize: 12, color: '#6B6B6B' },
  metaValue: { fontSize: 12, fontWeight: '600', color: '#1A1A1A' },

  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 9999, flexShrink: 0 },
  badgeText: { fontSize: 12, fontWeight: '700' },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#1A1A1A', marginBottom: 8 },
  emptyBody: { fontSize: 14, color: '#6B6B6B', textAlign: 'center', marginBottom: 20, lineHeight: 20 },
  startBtn: { backgroundColor: '#FF8C42', borderRadius: 9999, paddingHorizontal: 28, paddingVertical: 12 },
  startBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
