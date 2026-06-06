import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  SafeAreaView, Modal, TextInput,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';

// ── Types ─────────────────────────────────────────────────────────────────────

type SleepEntry = {
  id: number; date: string; bedtime: string; wakeTime: string;
  totalHours: number; remPct: number; deepPct: number;
  awakenings: number; restingHR: number; score: number;
  rbdFlag: boolean; source: 'manual' | 'wearable';
};

type DystoniaEntry = {
  id: number; time: string; region: string; severity: number; duration: number;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const scoreColor = (s: number) => s >= 70 ? '#5DBEA3' : s >= 40 ? '#FF9F43' : '#FF6B6B';
const scoreBg = (s: number) => s >= 70 ? '#D4F1E8' : s >= 40 ? '#FFF3E0' : '#FFE0E0';

function calcScore(rem: number, deep: number, awk: number, hrs: number) {
  return Math.min(100, Math.round(
    Math.min(hrs / 8, 1) * 40 +
    (rem >= 20 && rem <= 25 ? 1 : rem / 25) * 30 +
    (deep >= 15 && deep <= 20 ? 1 : deep / 20) * 20 +
    Math.max(0, 1 - awk / 6) * 10
  ));
}

const BODY_REGIONS = ['Hand', 'Foot', 'Leg', 'Arm', 'Neck', 'Trunk', 'Face'];

// ── Initial data ──────────────────────────────────────────────────────────────

const INITIAL_SLEEP: SleepEntry[] = [
  { id: 1, date: 'Mon', bedtime: '22:30', wakeTime: '06:45', totalHours: 8.25, remPct: 22, deepPct: 18, awakenings: 1, restingHR: 57, score: 82, rbdFlag: false, source: 'wearable' },
  { id: 2, date: 'Tue', bedtime: '23:15', wakeTime: '06:30', totalHours: 7.25, remPct: 14, deepPct: 12, awakenings: 3, restingHR: 61, score: 61, rbdFlag: false, source: 'wearable' },
  { id: 3, date: 'Wed', bedtime: '22:45', wakeTime: '07:00', totalHours: 8.25, remPct: 20, deepPct: 16, awakenings: 2, restingHR: 59, score: 74, rbdFlag: false, source: 'wearable' },
  { id: 4, date: 'Thu', bedtime: '00:00', wakeTime: '06:00', totalHours: 6, remPct: 10, deepPct: 9, awakenings: 5, restingHR: 68, score: 45, rbdFlag: true, source: 'wearable' },
  { id: 5, date: 'Fri', bedtime: '22:30', wakeTime: '07:15', totalHours: 8.75, remPct: 21, deepPct: 17, awakenings: 1, restingHR: 56, score: 78, rbdFlag: false, source: 'wearable' },
  { id: 6, date: 'Sat', bedtime: '22:00', wakeTime: '07:00', totalHours: 9, remPct: 24, deepPct: 19, awakenings: 1, restingHR: 55, score: 88, rbdFlag: false, source: 'wearable' },
  { id: 7, date: 'Sun', bedtime: '23:45', wakeTime: '06:30', totalHours: 6.75, remPct: 12, deepPct: 11, awakenings: 4, restingHR: 65, score: 55, rbdFlag: true, source: 'wearable' },
];

const INITIAL_DYSTONIA: DystoniaEntry[] = [
  { id: 1, time: '08:15 AM', region: 'Hand', severity: 3, duration: 12 },
  { id: 2, time: '01:40 PM', region: 'Leg', severity: 4, duration: 20 },
  { id: 3, time: '06:55 PM', region: 'Neck', severity: 2, duration: 8 },
];

// ── Screen ────────────────────────────────────────────────────────────────────

export default function SleepMonitoring() {
  const [sleepLog, setSleepLog] = useState<SleepEntry[]>(INITIAL_SLEEP);
  const [dystoniaLog, setDystoniaLog] = useState<DystoniaEntry[]>(INITIAL_DYSTONIA);

  const [showSleepModal, setShowSleepModal] = useState(false);
  const [sleepForm, setSleepForm] = useState({ bedtime: '22:30', wakeTime: '07:00', remPct: 20, deepPct: 16, awakenings: 2, restingHR: 60 });

  const [showDystoniaModal, setShowDystoniaModal] = useState(false);
  const [dystoniaForm, setDystoniaForm] = useState({ time: '', region: 'Hand', severity: 3, duration: 10 });
  const [regionIdx, setRegionIdx] = useState(0);

  const rollingAvg = Math.round(sleepLog.reduce((s, d) => s + d.score, 0) / sleepLog.length);
  const rbdCount = sleepLog.filter(d => d.rbdFlag).length;
  const latest = sleepLog[sleepLog.length - 1];

  function addSleep() {
    const [bH, bM] = sleepForm.bedtime.split(':').map(Number);
    const [wH, wM] = sleepForm.wakeTime.split(':').map(Number);
    let hrs = (wH + wM / 60) - (bH + bM / 60);
    if (hrs < 0) hrs += 24;
    hrs = Math.round(hrs * 10) / 10;
    const score = calcScore(sleepForm.remPct, sleepForm.deepPct, sleepForm.awakenings, hrs);
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    setSleepLog(prev => [...prev.slice(-6), {
      id: Date.now(), date: days[new Date().getDay()],
      bedtime: sleepForm.bedtime, wakeTime: sleepForm.wakeTime,
      totalHours: hrs, remPct: sleepForm.remPct, deepPct: sleepForm.deepPct,
      awakenings: sleepForm.awakenings, restingHR: sleepForm.restingHR,
      score, rbdFlag: sleepForm.remPct < 12 || sleepForm.awakenings > 4, source: 'manual',
    }]);
    setShowSleepModal(false);
  }

  function addDystonia() {
    if (!dystoniaForm.time) return;
    setDystoniaLog(prev => [...prev, { id: Date.now(), ...dystoniaForm, region: BODY_REGIONS[regionIdx] }]);
    setDystoniaForm({ time: '', region: 'Hand', severity: 3, duration: 10 });
    setShowDystoniaModal(false);
  }

  const maxScore = 100;

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Ionicons name="arrow-back" size={20} color="#1A1A1A" />
          </TouchableOpacity>
          <Text style={s.title}>Sleep & Physiology</Text>
        </View>

        {/* RBD Alert */}
        {rbdCount > 0 && (
          <View style={s.alertBox}>
            <Ionicons name="warning" size={18} color="#FF6B6B" />
            <View style={{ flex: 1 }}>
              <Text style={s.alertTitle}>RBD Flag Detected</Text>
              <Text style={s.alertBody}>{rbdCount} night{rbdCount > 1 ? 's' : ''} showed REM fragmentation this week.</Text>
            </View>
          </View>
        )}

        {/* Summary row */}
        <View style={s.summaryRow}>
          {[
            { icon: 'moon', color: '#7B68EE', value: String(rollingAvg), label: '7d Avg' },
            { icon: 'heart', color: '#FF6B6B', value: String(latest?.restingHR ?? '—'), label: 'Resting HR' },
            { icon: 'flash', color: '#FF9F43', value: String(dystoniaLog.length), label: 'Dystonia' },
          ].map(item => (
            <View key={item.label} style={s.summaryCard}>
              <Ionicons name={item.icon as any} size={18} color={item.color} />
              <Text style={s.summaryValue}>{item.value}</Text>
              <Text style={s.summaryLabel}>{item.label}</Text>
            </View>
          ))}
        </View>

        {/* Sleep Quality Chart */}
        <View style={s.card}>
          <View style={s.cardHeader}>
            <Text style={s.cardTitle}>Sleep Quality</Text>
            <TouchableOpacity onPress={() => setShowSleepModal(true)} style={s.addBtn}>
              <Ionicons name="add" size={14} color="#fff" />
              <Text style={s.addBtnText}>Log Night</Text>
            </TouchableOpacity>
          </View>
          <View style={s.barChart}>
            {sleepLog.slice(-7).map(d => (
              <View key={d.id} style={s.barCol}>
                <View style={s.barWrapper}>
                  <View style={[s.bar, { height: (d.score / 100) * 80, backgroundColor: scoreColor(d.score) }]}>
                    {d.source === 'manual' && <View style={s.manualDot} />}
                  </View>
                </View>
                {d.rbdFlag && <View style={s.rbdDot} />}
                <Text style={s.barDay}>{d.date}</Text>
                <Text style={[s.barScore, { color: scoreColor(d.score) }]}>{d.score}</Text>
              </View>
            ))}
          </View>
          <View style={s.legend}>
            {[['#5DBEA3', 'Good (70+)'], ['#FF9F43', 'Fair (40–69)'], ['#FF6B6B', 'Poor (<40)'], ['#7B68EE', 'Manual']].map(([c, l]) => (
              <View key={l} style={s.legendItem}>
                <View style={[s.legendDot, { backgroundColor: c }]} />
                <Text style={s.legendText}>{l}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Latest Night */}
        {latest && (
          <View style={s.card}>
            <View style={s.cardHeader}>
              <Text style={s.cardTitle}>{latest.source === 'manual' ? 'Last Logged Night' : 'Last Night'}</Text>
              <View style={[s.scoreBadge, { backgroundColor: scoreBg(latest.score) }]}>
                <Text style={[s.scoreBadgeText, { color: scoreColor(latest.score) }]}>Score: {latest.score}</Text>
              </View>
            </View>
            {[
              ['🌙', 'Bedtime → Wake', `${latest.bedtime} → ${latest.wakeTime}`],
              ['⏱️', 'Total Sleep', `${latest.totalHours}h`],
              ['💜', 'REM Sleep', `${latest.remPct}%`],
              ['🔵', 'Deep Sleep', `${latest.deepPct}%`],
              ['⚡', 'Awakenings', String(latest.awakenings)],
              ['❤️', 'Resting HR', `${latest.restingHR} bpm`],
            ].map(([icon, label, value]) => (
              <View key={label} style={s.detailRow}>
                <Text style={s.detailIcon}>{icon}</Text>
                <Text style={s.detailLabel}>{label}</Text>
                <Text style={s.detailValue}>{value}</Text>
              </View>
            ))}
            {latest.rbdFlag && (
              <View style={s.rbdWarning}>
                <Ionicons name="warning" size={13} color="#FF6B6B" />
                <Text style={s.rbdWarningText}>RBD indicators detected this night</Text>
              </View>
            )}
          </View>
        )}

        {/* Dystonia Events */}
        <View style={s.card}>
          <View style={s.cardHeader}>
            <Text style={s.cardTitle}>Dystonia Events Today</Text>
            <TouchableOpacity onPress={() => setShowDystoniaModal(true)} style={[s.addBtn, { backgroundColor: '#7B68EE' }]}>
              <Ionicons name="add" size={14} color="#fff" />
              <Text style={s.addBtnText}>Log Event</Text>
            </TouchableOpacity>
          </View>
          {dystoniaLog.length === 0 ? (
            <Text style={s.emptyText}>No events logged today</Text>
          ) : (
            dystoniaLog.map(e => (
              <View key={e.id} style={s.dystoniaRow}>
                <View style={s.dystoniaIcon}>
                  <Ionicons name="flash" size={16} color="#7B68EE" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.dystoniaTitle}>{e.region} — {e.time}</Text>
                  <Text style={s.dystoniaSubtitle}>Severity {e.severity}/5 · {e.duration} min</Text>
                </View>
                <View style={s.severityDots}>
                  {Array.from({ length: 5 }).map((_, j) => (
                    <View key={j} style={[s.severityDot, { backgroundColor: j < e.severity ? '#7B68EE' : '#E0E0E0' }]} />
                  ))}
                </View>
                <TouchableOpacity onPress={() => setDystoniaLog(prev => prev.filter(x => x.id !== e.id))}>
                  <Ionicons name="close" size={16} color="#B8B8B8" />
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

        {/* Wearables */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Connected Wearables</Text>
          {[
            { name: 'Apple Watch', connected: true, lastSync: '2 min ago' },
            { name: 'Fitbit Sense', connected: false, lastSync: '3 days ago' },
          ].map(w => (
            <View key={w.name} style={s.wearableRow}>
              <View style={[s.wearableIcon, { backgroundColor: w.connected ? '#D4F1E8' : '#F0F0F0' }]}>
                <Ionicons name="watch" size={16} color={w.connected ? '#5DBEA3' : '#B8B8B8'} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.wearableName}>{w.name}</Text>
                <Text style={s.wearableSync}>Last sync: {w.lastSync}</Text>
              </View>
              <View style={[s.wearableBadge, { backgroundColor: w.connected ? '#D4F1E8' : '#F0F0F0' }]}>
                <Text style={[s.wearableBadgeText, { color: w.connected ? '#5DBEA3' : '#B8B8B8' }]}>
                  {w.connected ? 'Connected' : 'Disconnected'}
                </Text>
              </View>
            </View>
          ))}
          <TouchableOpacity style={s.connectBtn}>
            <Text style={s.connectBtnText}>+ Connect Wearable</Text>
          </TouchableOpacity>
        </View>

        {/* Correlation insight */}
        <View style={s.insightCard}>
          <Ionicons name="trending-down" size={20} color="#7B68EE" />
          <View style={{ flex: 1 }}>
            <Text style={s.insightTitle}>Sleep–Dystonia Correlation</Text>
            <Text style={s.insightBody}>
              Nights with sleep score below 60 correlate with <Text style={{ fontWeight: '700', color: '#7B68EE' }}>2.4× more</Text> dystonia events the following day. Pearson r = −0.71.
            </Text>
          </View>
        </View>

      </ScrollView>

      {/* ── Log Sleep Modal ── */}
      <Modal visible={showSleepModal} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Log Last Night</Text>
              <TouchableOpacity onPress={() => setShowSleepModal(false)}>
                <Ionicons name="close" size={22} color="#6B6B6B" />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={s.timeRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.fieldLabel}>Bedtime</Text>
                  <TextInput value={sleepForm.bedtime} onChangeText={v => setSleepForm(p => ({ ...p, bedtime: v }))}
                    style={s.textInput} placeholder="22:30" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.fieldLabel}>Wake Time</Text>
                  <TextInput value={sleepForm.wakeTime} onChangeText={v => setSleepForm(p => ({ ...p, wakeTime: v }))}
                    style={s.textInput} placeholder="07:00" />
                </View>
              </View>
              {([
                { key: 'remPct', label: 'REM %', min: 0, max: 40, unit: '%' },
                { key: 'deepPct', label: 'Deep Sleep %', min: 0, max: 40, unit: '%' },
                { key: 'awakenings', label: 'Awakenings', min: 0, max: 15, unit: '' },
                { key: 'restingHR', label: 'Resting HR', min: 40, max: 100, unit: ' bpm' },
              ] as const).map(({ key, label, min, max, unit }) => (
                <View key={key} style={s.sliderBlock}>
                  <View style={s.sliderLabelRow}>
                    <Text style={s.fieldLabel}>{label}</Text>
                    <Text style={s.sliderValue}>{sleepForm[key]}{unit}</Text>
                  </View>
                  <Slider minimumValue={min} maximumValue={max} step={1}
                    value={sleepForm[key]}
                    onValueChange={v => setSleepForm(p => ({ ...p, [key]: v }))}
                    minimumTrackTintColor="#7B68EE" maximumTrackTintColor="#E0E0E0"
                    thumbTintColor="#7B68EE" />
                </View>
              ))}
              <TouchableOpacity onPress={addSleep} style={[s.submitBtn, { backgroundColor: '#7B68EE' }]}>
                <Text style={s.submitBtnText}>Save Night</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Log Dystonia Modal ── */}
      <Modal visible={showDystoniaModal} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>New Dystonia Event</Text>
              <TouchableOpacity onPress={() => setShowDystoniaModal(false)}>
                <Ionicons name="close" size={22} color="#6B6B6B" />
              </TouchableOpacity>
            </View>
            <Text style={s.fieldLabel}>Time (e.g. 14:30)</Text>
            <TextInput value={dystoniaForm.time} onChangeText={v => setDystoniaForm(p => ({ ...p, time: v }))}
              style={s.textInput} placeholder="14:30" />
            <Text style={[s.fieldLabel, { marginTop: 12 }]}>Body Region</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {BODY_REGIONS.map((r, i) => (
                  <TouchableOpacity key={r} onPress={() => setRegionIdx(i)}
                    style={[s.regionChip, regionIdx === i && s.regionChipActive]}>
                    <Text style={[s.regionChipText, regionIdx === i && { color: '#fff' }]}>{r}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            {([
              { key: 'severity', label: 'Severity', min: 1, max: 5, unit: '/5' },
              { key: 'duration', label: 'Duration', min: 1, max: 60, unit: ' min' },
            ] as const).map(({ key, label, min, max, unit }) => (
              <View key={key} style={s.sliderBlock}>
                <View style={s.sliderLabelRow}>
                  <Text style={s.fieldLabel}>{label}</Text>
                  <Text style={s.sliderValue}>{dystoniaForm[key]}{unit}</Text>
                </View>
                <Slider minimumValue={min} maximumValue={max} step={1}
                  value={dystoniaForm[key]}
                  onValueChange={v => setDystoniaForm(p => ({ ...p, [key]: v }))}
                  minimumTrackTintColor="#7B68EE" maximumTrackTintColor="#E0E0E0"
                  thumbTintColor="#7B68EE" />
              </View>
            ))}
            <TouchableOpacity onPress={addDystonia}
              style={[s.submitBtn, { backgroundColor: '#7B68EE', opacity: dystoniaForm.time ? 1 : 0.4 }]}>
              <Text style={s.submitBtnText}>Save Event</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#EFEBE6' },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 },

  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '700', color: '#1A1A1A' },

  alertBox: { flexDirection: 'row', gap: 10, backgroundColor: '#FFE0E0', borderWidth: 1, borderColor: '#FF6B6B', borderRadius: 20, padding: 14, marginBottom: 16, alignItems: 'flex-start' },
  alertTitle: { fontSize: 13, fontWeight: '700', color: '#FF6B6B' },
  alertBody: { fontSize: 12, color: '#6B6B6B', marginTop: 2 },

  summaryRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  summaryCard: { flex: 1, backgroundColor: '#fff', borderRadius: 20, padding: 14, alignItems: 'center', gap: 4 },
  summaryValue: { fontSize: 22, fontWeight: '700', color: '#1A1A1A' },
  summaryLabel: { fontSize: 9, color: '#999', textTransform: 'uppercase', letterSpacing: 0.5 },

  card: { backgroundColor: '#fff', borderRadius: 24, padding: 20, marginBottom: 16 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#1A1A1A' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#7B68EE', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  addBtnText: { fontSize: 12, fontWeight: '700', color: '#fff' },

  barChart: { flexDirection: 'row', alignItems: 'flex-end', height: 100, gap: 4, marginBottom: 10 },
  barCol: { flex: 1, alignItems: 'center', gap: 2 },
  barWrapper: { height: 80, justifyContent: 'flex-end', width: '100%' },
  bar: { width: '100%', borderTopLeftRadius: 4, borderTopRightRadius: 4, position: 'relative' },
  manualDot: { position: 'absolute', top: -4, right: -2, width: 8, height: 8, borderRadius: 4, backgroundColor: '#7B68EE', borderWidth: 1, borderColor: '#fff' },
  rbdDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FF6B6B' },
  barDay: { fontSize: 9, color: '#999', textTransform: 'uppercase' },
  barScore: { fontSize: 10, fontWeight: '700' },

  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F0F0F0' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 10, color: '#6B6B6B' },

  scoreBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  scoreBadgeText: { fontSize: 11, fontWeight: '700' },

  detailRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  detailIcon: { fontSize: 16, width: 24 },
  detailLabel: { flex: 1, fontSize: 13, color: '#6B6B6B' },
  detailValue: { fontSize: 13, fontWeight: '700', color: '#1A1A1A' },

  rbdWarning: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#F0F0F0' },
  rbdWarningText: { fontSize: 11, fontWeight: '700', color: '#FF6B6B' },

  emptyText: { fontSize: 13, color: '#999', textAlign: 'center', paddingVertical: 16 },

  dystoniaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#F8F7FF', borderRadius: 14, padding: 12, marginBottom: 8 },
  dystoniaIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#DDD8F5', alignItems: 'center', justifyContent: 'center' },
  dystoniaTitle: { fontSize: 13, fontWeight: '700', color: '#1A1A1A' },
  dystoniaSubtitle: { fontSize: 11, color: '#6B6B6B', marginTop: 1 },
  severityDots: { flexDirection: 'row', gap: 3 },
  severityDot: { width: 6, height: 6, borderRadius: 3 },

  wearableRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  wearableIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  wearableName: { fontSize: 13, fontWeight: '700', color: '#1A1A1A' },
  wearableSync: { fontSize: 11, color: '#999' },
  wearableBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  wearableBadgeText: { fontSize: 11, fontWeight: '700' },
  connectBtn: { borderWidth: 2, borderStyle: 'dashed', borderColor: '#DDD8F5', borderRadius: 14, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  connectBtnText: { fontSize: 13, fontWeight: '700', color: '#7B68EE' },

  insightCard: { flexDirection: 'row', gap: 12, backgroundColor: '#EDE9FF', borderRadius: 24, padding: 18, marginBottom: 8, alignItems: 'flex-start' },
  insightTitle: { fontSize: 13, fontWeight: '700', color: '#1A1A1A', marginBottom: 4 },
  insightBody: { fontSize: 12, color: '#6B6B6B', lineHeight: 18 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#1A1A1A' },
  timeRow: { flexDirection: 'row', gap: 12, marginBottom: 4 },
  fieldLabel: { fontSize: 10, color: '#999', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  textInput: { backgroundColor: '#F8F8F8', borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#1A1A1A', marginBottom: 4 },
  sliderBlock: { marginBottom: 12 },
  sliderLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  sliderValue: { fontSize: 12, fontWeight: '700', color: '#7B68EE' },
  submitBtn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  submitBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  regionChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F0F0F0' },
  regionChipActive: { backgroundColor: '#7B68EE' },
  regionChipText: { fontSize: 13, fontWeight: '600', color: '#6B6B6B' },
});
