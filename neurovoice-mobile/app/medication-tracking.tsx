import React, { useState, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  SafeAreaView, Modal, TextInput,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';

// ── Types ─────────────────────────────────────────────────────────────────────

type Medication = { id: number; name: string; dose: string; times: string[]; color: string; bg: string; avgEfficacy: number; trend: number };
type DoseLog = { id: number; medName: string; dose: string; takenAt: string; motor: number; tremor: number; rigidity: number; efficacy: number };
type AppTab = 'today' | 'schedule' | 'insights' | 'calendar';

// ── Constants ─────────────────────────────────────────────────────────────────

const COLORS = [
  { color: '#FF8C42', bg: '#FFE8D6' },
  { color: '#7B68EE', bg: '#DDD8F5' },
  { color: '#5DBEA3', bg: '#C8E6DD' },
  { color: '#FF6B9D', bg: '#FFE0EF' },
];

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTH_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_SHORT = ['S','M','T','W','T','F','S'];
const GRID_START = 6;
const GRID_END = 22;
const HOUR_H = 52;

const INITIAL_MEDS: Medication[] = [
  { id: 1, name: 'Levodopa / Carbidopa', dose: '100 mg', times: ['07:00','12:00','17:00','21:00'], avgEfficacy: 0.74, trend: 0.06, color: '#FF8C42', bg: '#FFE8D6' },
  { id: 2, name: 'Pramipexole', dose: '0.5 mg', times: ['08:00','20:00'], avgEfficacy: 0.61, trend: -0.08, color: '#7B68EE', bg: '#DDD8F5' },
];

const INITIAL_LOGS: DoseLog[] = [
  { id: 1, medName: 'Levodopa', dose: '100 mg', takenAt: '07:03', motor: 4, tremor: 3, rigidity: 3, efficacy: 0.82 },
  { id: 2, medName: 'Pramipexole', dose: '0.5 mg', takenAt: '08:05', motor: 3, tremor: 2, rigidity: 3, efficacy: 0.65 },
  { id: 3, medName: 'Levodopa', dose: '100 mg', takenAt: '12:02', motor: 3, tremor: 2, rigidity: 2, efficacy: 0.71 },
];

const EFF_HISTORY = [
  { day: 'M', levo: 0.78, pram: 0.62 }, { day: 'T', levo: 0.72, pram: 0.58 },
  { day: 'W', levo: 0.80, pram: 0.65 }, { day: 'T', levo: 0.68, pram: 0.55 },
  { day: 'F', levo: 0.75, pram: 0.60 }, { day: 'S', levo: 0.82, pram: 0.63 },
  { day: 'S', levo: 0.74, pram: 0.61 },
];

// ── Main screen ───────────────────────────────────────────────────────────────

export default function MedicationTracking() {
  const [tab, setTab] = useState<AppTab>('today');
  const [meds, setMeds] = useState<Medication[]>(INITIAL_MEDS);
  const [doseLogs, setDoseLogs] = useState<DoseLog[]>(INITIAL_LOGS);
  const [alertDismissed, setAlertDismissed] = useState(false);

  // Add med modal
  const [showAddMed, setShowAddMed] = useState(false);
  const [medForm, setMedForm] = useState({ name: '', dose: '', unit: 'mg', time: '08:00' });

  // Log dose modal
  const [showLogDose, setShowLogDose] = useState(false);
  const [doseForm, setDoseForm] = useState({ medId: 1, takenAt: '', motor: 3, tremor: 2, rigidity: 2 });

  // Post-dose snapshot modal
  const [showSnapshot, setShowSnapshot] = useState(false);
  const [snap, setSnap] = useState({ motor: 3, tremor: 2, rigidity: 2 });

  const adherence = doseLogs.length > 0 ? Math.round((doseLogs.length / (doseLogs.length + 3)) * 100) : 0;

  function addMed() {
    if (!medForm.name.trim() || !medForm.dose.trim()) return;
    const idx = meds.length % COLORS.length;
    setMeds(p => [...p, { id: Date.now(), name: medForm.name.trim(), dose: `${medForm.dose} ${medForm.unit}`, times: [medForm.time], avgEfficacy: 0, trend: 0, ...COLORS[idx] }]);
    setMedForm({ name: '', dose: '', unit: 'mg', time: '08:00' });
    setShowAddMed(false);
  }

  function logDose() {
    if (!doseForm.takenAt) return;
    const med = meds.find(m => m.id === doseForm.medId);
    if (!med) return;
    const pre = doseForm.motor + doseForm.tremor + doseForm.rigidity;
    setDoseLogs(p => [...p, { id: Date.now(), medName: med.name.split(' ')[0], dose: med.dose, takenAt: doseForm.takenAt, motor: doseForm.motor, tremor: doseForm.tremor, rigidity: doseForm.rigidity, efficacy: Math.round((1 - Math.max(0, Math.min(1, (pre - 3) / 12))) * 100) / 100 }]);
    setDoseForm({ medId: meds[0]?.id ?? 1, takenAt: '', motor: 3, tremor: 2, rigidity: 2 });
    setShowLogDose(false);
  }

  const TABS: { key: AppTab; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: 'schedule', label: 'Schedule' },
    { key: 'insights', label: 'Insights' },
    { key: 'calendar', label: 'Calendar' },
  ];

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Ionicons name="arrow-back" size={20} color="#1A1A1A" />
          </TouchableOpacity>
          <Text style={s.title}>Medication Tracker</Text>
          <TouchableOpacity style={s.backBtn}>
            <Ionicons name="notifications-outline" size={20} color="#1A1A1A" />
          </TouchableOpacity>
        </View>

        {/* Alert */}
        {!alertDismissed && (
          <View style={s.alertBox}>
            <Ionicons name="warning" size={18} color="#FF6B6B" />
            <View style={{ flex: 1 }}>
              <Text style={s.alertTitle}>Off-Period Detected</Text>
              <Text style={s.alertBody}>High symptom score at 4:15 PM. Caregiver notified.</Text>
            </View>
            <TouchableOpacity onPress={() => setAlertDismissed(true)}>
              <Text style={s.alertDismiss}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Summary */}
        <View style={s.summaryRow}>
          {[
            { icon: 'checkmark-circle', color: '#5DBEA3', value: `${adherence}%`, label: 'Today' },
            { icon: 'trending-up', color: '#FF8C42', value: '89%', label: '7d Avg' },
            { icon: 'medical', color: '#7B68EE', value: String(meds.length), label: 'Meds' },
          ].map(item => (
            <View key={item.label} style={s.summaryCard}>
              <Ionicons name={item.icon as any} size={18} color={item.color} />
              <Text style={s.summaryValue}>{item.value}</Text>
              <Text style={s.summaryLabel}>{item.label}</Text>
            </View>
          ))}
        </View>

        {/* Tabs */}
        <View style={s.tabBar}>
          {TABS.map(t => (
            <TouchableOpacity key={t.key} onPress={() => setTab(t.key)}
              style={[s.tabBtn, tab === t.key && s.tabBtnActive]}>
              <Text style={[s.tabText, tab === t.key && s.tabTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── TODAY ── */}
        {tab === 'today' && (
          <View>
            <TouchableOpacity onPress={() => setShowLogDose(true)} style={s.primaryBtn}>
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={s.primaryBtnText}>Log Dose Taken</Text>
            </TouchableOpacity>

            {showSnapshot && (
              <View style={[s.card, { borderWidth: 2, borderColor: '#5DBEA3' }]}>
                <Text style={s.cardTitle}>Post-dose check</Text>
                {(['motor', 'tremor', 'rigidity'] as const).map(f => (
                  <View key={f} style={s.sliderBlock}>
                    <View style={s.sliderLabelRow}>
                      <Text style={s.fieldLabel}>{f} severity</Text>
                      <Text style={[s.sliderValue, { color: '#5DBEA3' }]}>{snap[f]}/5</Text>
                    </View>
                    <Slider minimumValue={1} maximumValue={5} step={1} value={snap[f]}
                      onValueChange={v => setSnap(p => ({ ...p, [f]: v }))}
                      minimumTrackTintColor="#5DBEA3" maximumTrackTintColor="#E0E0E0" thumbTintColor="#5DBEA3" />
                  </View>
                ))}
                <TouchableOpacity onPress={() => setShowSnapshot(false)} style={[s.submitBtn, { backgroundColor: '#5DBEA3' }]}>
                  <Text style={s.submitBtnText}>Submit Snapshot</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={s.card}>
              <Text style={s.cardTitle}>Doses Logged Today</Text>
              {doseLogs.length === 0
                ? <Text style={s.emptyText}>No doses logged yet</Text>
                : doseLogs.map(d => (
                  <View key={d.id} style={s.doseRow}>
                    <View style={s.doseIcon}><Ionicons name="checkmark-circle" size={18} color="#5DBEA3" /></View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.doseName}>{d.medName} {d.dose}</Text>
                      <Text style={s.doseTime}>{d.takenAt} · Efficacy: {Math.round(d.efficacy * 100)}%</Text>
                    </View>
                    <View style={s.effBar}>
                      <View style={[s.effFill, { width: `${d.efficacy * 100}%` as any }]} />
                    </View>
                    <TouchableOpacity onPress={() => setDoseLogs(p => p.filter(x => x.id !== d.id))}>
                      <Ionicons name="close" size={16} color="#B8B8B8" />
                    </TouchableOpacity>
                  </View>
                ))
              }
            </View>

            <View style={s.card}>
              <Text style={s.cardTitle}>Upcoming Doses</Text>
              {meds.flatMap(m => m.times.map(t => ({ med: m, time: t }))).slice(0, 4).map(({ med, time }, i) => (
                <View key={i} style={s.upcomingRow}>
                  <View style={s.upcomingIcon}><Ionicons name="time" size={16} color="#FF9F43" /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.doseName}>{med.name.split(' ')[0]} {med.dose}</Text>
                    <Text style={s.doseTime}>{time}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setShowSnapshot(true)} style={s.takenBtn}>
                    <Text style={s.takenBtnText}>Taken</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── SCHEDULE ── */}
        {tab === 'schedule' && (
          <View>
            <TouchableOpacity onPress={() => setShowAddMed(true)} style={[s.primaryBtn, { backgroundColor: '#7B68EE' }]}>
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={s.primaryBtnText}>Add Medication</Text>
            </TouchableOpacity>

            {meds.map(med => (
              <View key={med.id} style={s.card}>
                <View style={s.medHeader}>
                  <View style={[s.medIcon, { backgroundColor: med.bg }]}>
                    <Ionicons name="medical" size={20} color={med.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.medName}>{med.name}</Text>
                    <Text style={s.medDose}>{med.dose} per dose</Text>
                  </View>
                  {med.avgEfficacy > 0 && (
                    <View style={s.trendRow}>
                      <Ionicons name={med.trend >= 0 ? 'trending-up' : 'trending-down'} size={14} color={med.trend >= 0 ? '#5DBEA3' : '#FF6B6B'} />
                      <Text style={[s.trendText, { color: med.trend >= 0 ? '#5DBEA3' : '#FF6B6B' }]}>
                        {med.trend >= 0 ? '+' : ''}{Math.round(med.trend * 100)}%
                      </Text>
                    </View>
                  )}
                  <TouchableOpacity onPress={() => setMeds(p => p.filter(m => m.id !== med.id))}>
                    <Ionicons name="trash-outline" size={16} color="#B8B8B8" />
                  </TouchableOpacity>
                </View>
                <View style={s.timePills}>
                  {med.times.map(t => (
                    <View key={t} style={[s.timePill, { backgroundColor: med.bg }]}>
                      <Text style={[s.timePillText, { color: med.color }]}>{t}</Text>
                    </View>
                  ))}
                </View>
                {med.avgEfficacy > 0 && (
                  <View style={s.effRow}>
                    <Text style={s.effLabel}>30-day avg efficacy</Text>
                    <View style={s.effBarLarge}>
                      <View style={[s.effFillLarge, { width: `${med.avgEfficacy * 100}%` as any, backgroundColor: med.color }]} />
                    </View>
                    <Text style={s.effPct}>{Math.round(med.avgEfficacy * 100)}%</Text>
                  </View>
                )}
              </View>
            ))}

            {meds.length === 0 && (
              <View style={[s.card, { alignItems: 'center', paddingVertical: 32 }]}>
                <Ionicons name="medical-outline" size={32} color="#B8B8B8" />
                <Text style={[s.medName, { marginTop: 8 }]}>No medications added</Text>
                <Text style={s.emptyText}>Tap "Add Medication" to get started</Text>
              </View>
            )}

            {meds.length > 0 && (
              <View style={[s.card, { borderWidth: 1, borderColor: '#FF8C42', backgroundColor: '#FFF8F4' }]}>
                <View style={s.medHeader}>
                  <View style={[s.medIcon, { backgroundColor: '#FF8C42' }]}>
                    <Ionicons name="trending-up" size={18} color="#fff" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.medName}>Smart Suggestion</Text>
                    <Text style={s.medDose}>Based on 21 days of data</Text>
                  </View>
                </View>
                <Text style={s.suggestionBody}>
                  Shifting your <Text style={{ fontWeight: '700', color: '#FF8C42' }}>Levodopa 17:00 dose</Text> to <Text style={{ fontWeight: '700', color: '#FF8C42' }}>16:30</Text> could reduce your evening Off-Period by ~35 minutes.
                </Text>
                <View style={s.suggestionBtns}>
                  <TouchableOpacity style={[s.suggBtn, { backgroundColor: '#FF8C42' }]}><Text style={s.suggBtnText}>Apply</Text></TouchableOpacity>
                  <TouchableOpacity style={[s.suggBtn, { backgroundColor: '#fff', borderWidth: 1, borderColor: '#E0E0E0' }]}><Text style={[s.suggBtnText, { color: '#6B6B6B' }]}>Dismiss</Text></TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        )}

        {/* ── INSIGHTS ── */}
        {tab === 'insights' && (
          <View>
            <View style={s.card}>
              <Text style={s.cardTitle}>Efficacy Trend — 7 Days</Text>
              <View style={s.effChart}>
                {EFF_HISTORY.map((d, i) => (
                  <View key={i} style={s.effChartCol}>
                    <View style={s.effChartBars}>
                      <View style={[s.effChartBar, { height: d.levo * 72, backgroundColor: '#FF8C42' }]} />
                      <View style={[s.effChartBar, { height: d.pram * 72, backgroundColor: '#7B68EE' }]} />
                    </View>
                    <Text style={s.effChartDay}>{d.day}</Text>
                  </View>
                ))}
              </View>
              <View style={s.legend}>
                <View style={s.legendItem}><View style={[s.legendDot, { backgroundColor: '#FF8C42' }]} /><Text style={s.legendText}>Levodopa</Text></View>
                <View style={s.legendItem}><View style={[s.legendDot, { backgroundColor: '#7B68EE' }]} /><Text style={s.legendText}>Pramipexole</Text></View>
              </View>
            </View>

            <View style={s.card}>
              <Text style={s.cardTitle}>Today's On/Off Timeline</Text>
              <View style={s.timeline}>
                {[
                  { label: 'OFF', flex: 12, color: '#FF6B6B' },
                  { label: 'ON', flex: 20, color: '#5DBEA3' },
                  { label: 'ON', flex: 18, color: '#5DBEA3' },
                  { label: 'OFF', flex: 10, color: '#FF6B6B' },
                  { label: 'ON', flex: 22, color: '#5DBEA3' },
                  { label: 'OFF', flex: 18, color: '#FF9F43' },
                ].map((seg, i) => (
                  <View key={i} style={[s.timelineSeg, { flex: seg.flex, backgroundColor: seg.color }]}>
                    <Text style={s.timelineLabel}>{seg.label}</Text>
                  </View>
                ))}
              </View>
              <View style={s.timelineAxis}>
                <Text style={s.axisLabel}>6 AM</Text>
                <Text style={s.axisLabel}>12 PM</Text>
                <Text style={s.axisLabel}>6 PM</Text>
              </View>
            </View>

            <View style={s.card}>
              <Text style={s.cardTitle}>Peak Off-Period Windows</Text>
              {[
                { window: '06:00–08:00', pct: 0.62 },
                { window: '16:00–18:00', pct: 0.48 },
                { window: '20:00–22:00', pct: 0.41 },
              ].map((w, i) => (
                <View key={i} style={s.offRow}>
                  <Text style={s.offWindow}>{w.window}</Text>
                  <View style={s.offBar}><View style={[s.offFill, { width: `${w.pct * 100}%` as any }]} /></View>
                  <Text style={s.offPct}>{Math.round(w.pct * 100)}%</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── CALENDAR ── */}
        {tab === 'calendar' && <MedCalendar meds={meds} doseLogs={doseLogs} />}

      </ScrollView>

      {/* ── Add Medication Modal ── */}
      <Modal visible={showAddMed} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>New Medication</Text>
              <TouchableOpacity onPress={() => setShowAddMed(false)}><Ionicons name="close" size={22} color="#6B6B6B" /></TouchableOpacity>
            </View>
            <Text style={s.fieldLabel}>Medication Name</Text>
            <TextInput value={medForm.name} onChangeText={v => setMedForm(p => ({ ...p, name: v }))}
              style={s.textInput} placeholder="e.g. Levodopa / Carbidopa" />
            <View style={s.timeRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.fieldLabel}>Dose Amount</Text>
                <TextInput value={medForm.dose} onChangeText={v => setMedForm(p => ({ ...p, dose: v }))}
                  style={s.textInput} placeholder="100" keyboardType="numeric" />
              </View>
              <View style={{ width: 80 }}>
                <Text style={s.fieldLabel}>Unit</Text>
                <View style={s.unitPicker}>
                  {['mg', 'mcg', 'ml'].map(u => (
                    <TouchableOpacity key={u} onPress={() => setMedForm(p => ({ ...p, unit: u }))}
                      style={[s.unitChip, medForm.unit === u && s.unitChipActive]}>
                      <Text style={[s.unitChipText, medForm.unit === u && { color: '#fff' }]}>{u}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>
            <Text style={s.fieldLabel}>First Dose Time</Text>
            <TextInput value={medForm.time} onChangeText={v => setMedForm(p => ({ ...p, time: v }))}
              style={s.textInput} placeholder="08:00" />
            <TouchableOpacity onPress={addMed}
              style={[s.submitBtn, { backgroundColor: '#7B68EE', opacity: medForm.name && medForm.dose ? 1 : 0.4 }]}>
              <Text style={s.submitBtnText}>Add to Schedule</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Log Dose Modal ── */}
      <Modal visible={showLogDose} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Log a Dose</Text>
              <TouchableOpacity onPress={() => setShowLogDose(false)}><Ionicons name="close" size={22} color="#6B6B6B" /></TouchableOpacity>
            </View>
            <Text style={s.fieldLabel}>Medication</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {meds.map(m => (
                  <TouchableOpacity key={m.id} onPress={() => setDoseForm(p => ({ ...p, medId: m.id }))}
                    style={[s.regionChip, doseForm.medId === m.id && { backgroundColor: '#FF8C42' }]}>
                    <Text style={[s.regionChipText, doseForm.medId === m.id && { color: '#fff' }]}>{m.name.split(' ')[0]}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            <Text style={s.fieldLabel}>Time Taken</Text>
            <TextInput value={doseForm.takenAt} onChangeText={v => setDoseForm(p => ({ ...p, takenAt: v }))}
              style={s.textInput} placeholder="14:30" />
            <Text style={[s.fieldLabel, { marginTop: 8 }]}>How did you feel before?</Text>
            {(['motor', 'tremor', 'rigidity'] as const).map(f => (
              <View key={f} style={s.sliderBlock}>
                <View style={s.sliderLabelRow}>
                  <Text style={s.fieldLabel}>{f} severity</Text>
                  <Text style={[s.sliderValue, { color: '#FF8C42' }]}>{doseForm[f]}/5</Text>
                </View>
                <Slider minimumValue={1} maximumValue={5} step={1} value={doseForm[f]}
                  onValueChange={v => setDoseForm(p => ({ ...p, [f]: v }))}
                  minimumTrackTintColor="#FF8C42" maximumTrackTintColor="#E0E0E0" thumbTintColor="#FF8C42" />
              </View>
            ))}
            <TouchableOpacity onPress={logDose}
              style={[s.submitBtn, { backgroundColor: '#FF8C42', opacity: doseForm.takenAt ? 1 : 0.4 }]}>
              <Text style={s.submitBtnText}>Save Dose</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ── MedCalendar ───────────────────────────────────────────────────────────────

function MedCalendar({ meds, doseLogs }: { meds: Medication[]; doseLogs: DoseLog[] }) {
  const today = new Date();
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDow, setSelectedDow] = useState(today.getDay());

  const weekStart = useMemo(() => {
    const d = new Date(today);
    d.setDate(today.getDate() - today.getDay() + weekOffset * 7);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [weekOffset]);

  const weekDays = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => { const d = new Date(weekStart); d.setDate(weekStart.getDate() + i); return d; }),
    [weekStart]);

  const activeDate = weekDays[selectedDow];
  const isThisWeek = weekOffset === 0;

  const dayEvents = useMemo(() => {
    const isToday = activeDate.getDate() === today.getDate() && activeDate.getMonth() === today.getMonth() && activeDate.getFullYear() === today.getFullYear();
    const isFuture = activeDate > today;
    return meds.flatMap(med => med.times.map(t => {
      const [h, m] = t.split(':').map(Number);
      const taken = isToday && doseLogs.some(dl => dl.medName === med.name.split(' ')[0] && dl.takenAt === t);
      return { name: med.name.split(' ')[0], dose: med.dose, time: t, hour: h, minute: m, color: med.color, bg: med.bg, taken, isFuture };
    })).sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute));
  }, [meds, doseLogs, activeDate]);

  function dotColor(d: Date) {
    const isT = d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
    const isFut = d > today;
    if (meds.length === 0 || isFut) return '#E0E0E0';
    const total = meds.reduce((s, m) => s + m.times.length, 0);
    const taken = isT ? doseLogs.length : total;
    return taken >= total ? '#5DBEA3' : taken > 0 ? '#FF9F43' : '#FF6B6B';
  }

  const monthLabel = `${MONTH_FULL[weekDays[0].getMonth()]}${weekDays[0].getMonth() !== weekDays[6].getMonth() ? ` – ${MONTH_FULL[weekDays[6].getMonth()]}` : ''} ${weekDays[0].getFullYear()}`;

  const now = today;
  const nowTop = isThisWeek && selectedDow === today.getDay() && now.getHours() >= GRID_START && now.getHours() < GRID_END
    ? (now.getHours() - GRID_START + now.getMinutes() / 60) * HOUR_H
    : null;

  return (
    <View>
      {/* Week header card */}
      <View style={s.card}>
        <View style={s.calNavRow}>
          <TouchableOpacity onPress={() => setWeekOffset(w => w - 1)} style={s.calNavBtn}>
            <Ionicons name="chevron-back" size={16} color="#6B6B6B" />
          </TouchableOpacity>
          <View style={{ alignItems: 'center' }}>
            <Text style={s.calMonthLabel}>{monthLabel}</Text>
            {!isThisWeek && (
              <TouchableOpacity onPress={() => { setWeekOffset(0); setSelectedDow(today.getDay()); }}>
                <Text style={s.calTodayLink}>Back to today</Text>
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity onPress={() => setWeekOffset(w => w + 1)} style={s.calNavBtn}>
            <Ionicons name="chevron-forward" size={16} color="#6B6B6B" />
          </TouchableOpacity>
        </View>

        {/* Day strip */}
        <View style={s.dayStrip}>
          {weekDays.map((d, i) => {
            const isToday = isThisWeek && d.getDate() === today.getDate();
            const isSel = i === selectedDow;
            return (
              <TouchableOpacity key={i} onPress={() => setSelectedDow(i)} style={[s.dayCell, isSel && s.dayCellActive, isToday && !isSel && s.dayCellToday]}>
                <Text style={[s.dayDow, isSel ? { color: '#fff' } : isToday ? { color: '#FF8C42' } : { color: '#B8B8B8' }]}>{DAY_SHORT[i]}</Text>
                <Text style={[s.dayNum, isSel ? { color: '#fff' } : isToday ? { color: '#FF8C42' } : { color: '#1A1A1A' }]}>{d.getDate()}</Text>
                <View style={[s.dayDot, { backgroundColor: isSel ? 'rgba(255,255,255,0.7)' : dotColor(d) }]} />
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Time grid */}
      <View style={s.card}>
        <View style={s.gridHeader}>
          <Text style={s.cardTitle}>{DAY_SHORT[selectedDow]}, {activeDate.getDate()} {MONTH_NAMES[activeDate.getMonth()]}</Text>
          <View style={s.gridLegend}>
            <View style={s.legendItem}><View style={[s.legendDot, { backgroundColor: '#5DBEA3' }]} /><Text style={s.legendText}>Taken</Text></View>
            <View style={s.legendItem}><View style={[s.legendDot, { backgroundColor: '#FF9F43' }]} /><Text style={s.legendText}>Upcoming</Text></View>
          </View>
        </View>

        <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
          <View style={{ height: (GRID_END - GRID_START) * HOUR_H, position: 'relative' }}>
            {/* Hour rows */}
            {Array.from({ length: GRID_END - GRID_START + 1 }, (_, i) => {
              const hour = GRID_START + i;
              const label = hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`;
              return (
                <View key={hour} style={[s.hourRow, { top: i * HOUR_H }]}>
                  <Text style={s.hourLabel}>{label}</Text>
                  <View style={s.hourLine} />
                </View>
              );
            })}

            {/* Current time line */}
            {nowTop !== null && (
              <View style={[s.nowLine, { top: nowTop }]}>
                <View style={s.nowDot} />
                <View style={s.nowBar} />
              </View>
            )}

            {/* Dose event blocks */}
            {dayEvents.filter(ev => ev.hour >= GRID_START && ev.hour < GRID_END).map((ev, i) => {
              const top = (ev.hour - GRID_START + ev.minute / 60) * HOUR_H + 2;
              const statusBg = ev.taken ? '#D4F1E8' : ev.isFuture ? ev.bg : '#FFE8D6';
              const statusColor = ev.taken ? '#5DBEA3' : ev.isFuture ? ev.color : '#FF9F43';
              const statusLabel = ev.taken ? '✓ Taken' : ev.isFuture ? 'Scheduled' : 'Upcoming';
              return (
                <View key={i} style={[s.eventBlock, { top, backgroundColor: statusBg, borderLeftColor: ev.color }]}>
                  <View style={s.eventRow}>
                    <Text style={[s.eventName, { color: ev.color }]}>{ev.name} {ev.dose}</Text>
                    <Text style={[s.eventStatus, { color: statusColor }]}>{statusLabel}</Text>
                  </View>
                  <Text style={s.eventTime}>{ev.time}</Text>
                </View>
              );
            })}
          </View>
        </ScrollView>
      </View>

      {/* Sync card */}
      <View style={s.card}>
        <Text style={s.cardTitle}>Sync to External Calendar</Text>
        {[
          { name: 'Google Calendar', connected: true, lastSync: '5 min ago' },
          { name: 'Apple Calendar', connected: false, lastSync: '—' },
        ].map(cal => (
          <View key={cal.name} style={s.wearableRow}>
            <View style={[s.wearableIcon, { backgroundColor: cal.connected ? '#D4F1E8' : '#F0F0F0' }]}>
              <Ionicons name="calendar" size={16} color={cal.connected ? '#5DBEA3' : '#B8B8B8'} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.wearableName}>{cal.name}</Text>
              <Text style={s.wearableSync}>Last sync: {cal.lastSync}</Text>
            </View>
            <View style={[s.wearableBadge, { backgroundColor: cal.connected ? '#D4F1E8' : '#F0F0F0' }]}>
              <Text style={[s.wearableBadgeText, { color: cal.connected ? '#5DBEA3' : '#B8B8B8' }]}>
                {cal.connected ? 'Synced' : 'Connect'}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#EFEBE6' },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 },

  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 20, fontWeight: '700', color: '#1A1A1A', textAlign: 'center' },

  alertBox: { flexDirection: 'row', gap: 10, backgroundColor: '#FFE0E0', borderWidth: 1, borderColor: '#FF6B6B', borderRadius: 20, padding: 14, marginBottom: 14, alignItems: 'flex-start' },
  alertTitle: { fontSize: 13, fontWeight: '700', color: '#FF6B6B' },
  alertBody: { fontSize: 12, color: '#6B6B6B', marginTop: 2 },
  alertDismiss: { fontSize: 12, fontWeight: '700', color: '#FF6B6B' },

  summaryRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  summaryCard: { flex: 1, backgroundColor: '#fff', borderRadius: 20, padding: 14, alignItems: 'center', gap: 4 },
  summaryValue: { fontSize: 22, fontWeight: '700', color: '#1A1A1A' },
  summaryLabel: { fontSize: 9, color: '#999', textTransform: 'uppercase', letterSpacing: 0.5 },

  tabBar: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 16, padding: 4, marginBottom: 14, gap: 2 },
  tabBtn: { flex: 1, paddingVertical: 8, borderRadius: 12, alignItems: 'center' },
  tabBtnActive: { backgroundColor: '#FF8C42' },
  tabText: { fontSize: 12, fontWeight: '700', color: '#6B6B6B' },
  tabTextActive: { color: '#fff' },

  card: { backgroundColor: '#fff', borderRadius: 24, padding: 18, marginBottom: 14 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#1A1A1A', marginBottom: 12 },

  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#FF8C42', borderRadius: 16, paddingVertical: 14, marginBottom: 12 },
  primaryBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  emptyText: { fontSize: 13, color: '#999', textAlign: 'center', paddingVertical: 12 },

  doseRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFF8F4', borderRadius: 14, padding: 12, marginBottom: 8 },
  doseIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#D4F1E8', alignItems: 'center', justifyContent: 'center' },
  doseName: { fontSize: 13, fontWeight: '700', color: '#1A1A1A' },
  doseTime: { fontSize: 11, color: '#999', marginTop: 1 },
  effBar: { width: 56, height: 4, backgroundColor: '#F0F0F0', borderRadius: 2, overflow: 'hidden' },
  effFill: { height: '100%', backgroundColor: '#5DBEA3', borderRadius: 2 },

  upcomingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  upcomingIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#FFF3E0', alignItems: 'center', justifyContent: 'center' },
  takenBtn: { backgroundColor: '#FF8C42', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  takenBtnText: { fontSize: 12, fontWeight: '700', color: '#fff' },

  medHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  medIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  medName: { fontSize: 14, fontWeight: '700', color: '#1A1A1A' },
  medDose: { fontSize: 11, color: '#999', marginTop: 1 },
  trendRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  trendText: { fontSize: 11, fontWeight: '700' },
  timePills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  timePill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  timePillText: { fontSize: 11, fontWeight: '700' },
  effRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F0F0F0' },
  effLabel: { fontSize: 11, color: '#6B6B6B', flex: 1 },
  effBarLarge: { width: 80, height: 6, backgroundColor: '#F0F0F0', borderRadius: 3, overflow: 'hidden' },
  effFillLarge: { height: '100%', borderRadius: 3 },
  effPct: { fontSize: 11, fontWeight: '700', color: '#1A1A1A' },

  suggestionBody: { fontSize: 12, color: '#6B6B6B', lineHeight: 18, marginBottom: 12 },
  suggestionBtns: { flexDirection: 'row', gap: 8 },
  suggBtn: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center' },
  suggBtnText: { fontSize: 12, fontWeight: '700', color: '#fff' },

  effChart: { flexDirection: 'row', alignItems: 'flex-end', height: 80, gap: 4, marginBottom: 10 },
  effChartCol: { flex: 1, alignItems: 'center', gap: 4 },
  effChartBars: { flexDirection: 'row', gap: 2, alignItems: 'flex-end', height: 72 },
  effChartBar: { width: 8, borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  effChartDay: { fontSize: 9, color: '#999', textTransform: 'uppercase' },

  timeline: { flexDirection: 'row', height: 32, borderRadius: 10, overflow: 'hidden', gap: 1, marginBottom: 6 },
  timelineSeg: { alignItems: 'center', justifyContent: 'center' },
  timelineLabel: { fontSize: 9, fontWeight: '700', color: '#fff' },
  timelineAxis: { flexDirection: 'row', justifyContent: 'space-between' },
  axisLabel: { fontSize: 9, color: '#999' },

  offRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  offWindow: { fontSize: 11, fontWeight: '700', color: '#1A1A1A', width: 88 },
  offBar: { flex: 1, height: 6, backgroundColor: '#F0F0F0', borderRadius: 3, overflow: 'hidden' },
  offFill: { height: '100%', backgroundColor: '#FF6B6B', borderRadius: 3 },
  offPct: { fontSize: 11, fontWeight: '700', color: '#FF6B6B', width: 28, textAlign: 'right' },

  // Calendar
  calNavRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  calNavBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F0F0F0', alignItems: 'center', justifyContent: 'center' },
  calMonthLabel: { fontSize: 14, fontWeight: '700', color: '#1A1A1A' },
  calTodayLink: { fontSize: 11, fontWeight: '700', color: '#FF8C42', marginTop: 2, textAlign: 'center' },
  dayStrip: { flexDirection: 'row', gap: 2 },
  dayCell: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 14 },
  dayCellActive: { backgroundColor: '#FF8C42' },
  dayCellToday: { backgroundColor: '#FFE8D6' },
  dayDow: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase', marginBottom: 2 },
  dayNum: { fontSize: 16, fontWeight: '700' },
  dayDot: { width: 5, height: 5, borderRadius: 3, marginTop: 3 },

  gridHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  gridLegend: { flexDirection: 'row', gap: 10 },
  hourRow: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'flex-start' },
  hourLabel: { fontSize: 9, color: '#B8B8B8', width: 40, paddingLeft: 2, marginTop: -6 },
  hourLine: { flex: 1, height: 1, backgroundColor: '#F0F0F0', marginTop: 0 },
  nowLine: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'center', zIndex: 10 },
  nowDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#FF8C42', marginLeft: 36 },
  nowBar: { flex: 1, height: 2, backgroundColor: '#FF8C42' },
  eventBlock: { position: 'absolute', left: 44, right: 4, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, borderLeftWidth: 3, zIndex: 5 },
  eventRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eventName: { fontSize: 11, fontWeight: '700' },
  eventStatus: { fontSize: 10, fontWeight: '700' },
  eventTime: { fontSize: 10, color: '#999', marginTop: 1 },

  // Wearable (reused for calendar sync)
  wearableRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  wearableIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  wearableName: { fontSize: 13, fontWeight: '700', color: '#1A1A1A' },
  wearableSync: { fontSize: 11, color: '#999' },
  wearableBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  wearableBadgeText: { fontSize: 11, fontWeight: '700' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#1A1A1A' },
  timeRow: { flexDirection: 'row', gap: 12, marginBottom: 4 },
  fieldLabel: { fontSize: 10, color: '#999', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  textInput: { backgroundColor: '#F8F8F8', borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#1A1A1A', marginBottom: 10 },
  sliderBlock: { marginBottom: 10 },
  sliderLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  sliderValue: { fontSize: 12, fontWeight: '700' },
  submitBtn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 6 },
  submitBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  regionChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F0F0F0' },
  regionChipText: { fontSize: 13, fontWeight: '600', color: '#6B6B6B' },
  unitPicker: { gap: 4 },
  unitChip: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, backgroundColor: '#F0F0F0', alignItems: 'center' },
  unitChipActive: { backgroundColor: '#7B68EE' },
  unitChipText: { fontSize: 11, fontWeight: '600', color: '#6B6B6B' },

  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F0F0F0' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 10, color: '#6B6B6B' },
});
