import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Pill, Calendar, TrendingUp, TrendingDown, Bell, CheckCircle, Clock, AlertTriangle, ChevronRight, Plus, X, Trash2, ChevronLeft } from "lucide-react";
import BottomNav from "@/components/BottomNav";

// ── Types ──────────────────────────────────────────────────────────────────────

type Medication = {
  id: number;
  name: string;
  dose: string;
  times: string[];
  color: string;
  bg: string;
  avgEfficacy: number;
  trend: number;
};

type DoseLog = {
  id: number;
  medName: string;
  dose: string;
  time: string;
  takenAt: string;
  motor: number;
  tremor: number;
  rigidity: number;
  efficacy: number;
};

type Tab = "today" | "schedule" | "insights" | "calendar";

// ── Initial data ───────────────────────────────────────────────────────────────

const COLORS = [
  { color: "#FF8C42", bg: "#FFE8D6" },
  { color: "#7B68EE", bg: "#DDD8F5" },
  { color: "#5DBEA3", bg: "#C8E6DD" },
  { color: "#FF6B9D", bg: "#FFE0EF" },
];

const initialMeds: Medication[] = [
  { id: 1, name: "Levodopa / Carbidopa", dose: "100 mg", times: ["07:00", "12:00", "17:00", "21:00"], avgEfficacy: 0.74, trend: 0.06, color: "#FF8C42", bg: "#FFE8D6" },
  { id: 2, name: "Pramipexole", dose: "0.5 mg", times: ["08:00", "20:00"], avgEfficacy: 0.61, trend: -0.08, color: "#7B68EE", bg: "#DDD8F5" },
];

const initialDoseLogs: DoseLog[] = [
  { id: 1, medName: "Levodopa", dose: "100 mg", time: "07:00", takenAt: "07:03", motor: 4, tremor: 3, rigidity: 3, efficacy: 0.82 },
  { id: 2, medName: "Pramipexole", dose: "0.5 mg", time: "08:00", takenAt: "08:05", motor: 3, tremor: 2, rigidity: 3, efficacy: 0.65 },
  { id: 3, medName: "Levodopa", dose: "100 mg", time: "12:00", takenAt: "12:02", motor: 3, tremor: 2, rigidity: 2, efficacy: 0.71 },
];

const efficacyHistory = [
  { day: "MON", levodopa: 0.78, pramipexole: 0.62 },
  { day: "TUE", levodopa: 0.72, pramipexole: 0.58 },
  { day: "WED", levodopa: 0.80, pramipexole: 0.65 },
  { day: "THU", levodopa: 0.68, pramipexole: 0.55 },
  { day: "FRI", levodopa: 0.75, pramipexole: 0.60 },
  { day: "SAT", levodopa: 0.82, pramipexole: 0.63 },
  { day: "SUN", levodopa: 0.74, pramipexole: 0.61 },
];

const offWindows = [
  { window: "06:00–08:00", proportion: 0.62 },
  { window: "16:00–18:00", proportion: 0.48 },
  { window: "20:00–22:00", proportion: 0.41 },
];

// ── Component ──────────────────────────────────────────────────────────────────

const MedicationTracking = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("today");

  // Live medication list
  const [meds, setMeds] = useState<Medication[]>(initialMeds);
  const [showAddMed, setShowAddMed] = useState(false);
  const [medForm, setMedForm] = useState({ name: "", dose: "", unit: "mg", time: "08:00" });

  // Live dose log
  const [doseLogs, setDoseLogs] = useState<DoseLog[]>(initialDoseLogs);
  const [showLogDose, setShowLogDose] = useState(false);
  const [doseForm, setDoseForm] = useState({ medId: 1, takenAt: "", motor: 3, tremor: 2, rigidity: 2 });

  // Off-period alert dismissed
  const [alertDismissed, setAlertDismissed] = useState(false);

  // Snapshot after confirming a pending dose
  const [showSnapshot, setShowSnapshot] = useState(false);
  const [snapshotValues, setSnapshotValues] = useState({ motor: 3, tremor: 2, rigidity: 2 });

  const adherenceToday = doseLogs.length > 0
    ? Math.round((doseLogs.length / (doseLogs.length + 3)) * 100)
    : 0;

  const tabs: { key: Tab; label: string }[] = [
    { key: "today", label: "Today" },
    { key: "schedule", label: "Schedule" },
    { key: "insights", label: "Insights" },
    { key: "calendar", label: "Calendar" },
  ];

  function addMedication() {
    if (!medForm.name.trim() || !medForm.dose.trim()) return;
    const colorIdx = meds.length % COLORS.length;
    setMeds(prev => [...prev, {
      id: Date.now(),
      name: medForm.name.trim(),
      dose: `${medForm.dose} ${medForm.unit}`,
      times: [medForm.time],
      avgEfficacy: 0,
      trend: 0,
      ...COLORS[colorIdx],
    }]);
    setMedForm({ name: "", dose: "", unit: "mg", time: "08:00" });
    setShowAddMed(false);
  }

  function logDose() {
    if (!doseForm.takenAt) return;
    const med = meds.find(m => m.id === doseForm.medId);
    if (!med) return;
    const pre = doseForm.motor + doseForm.tremor + doseForm.rigidity;
    const efficacy = Math.max(0, Math.min(1, (pre - 3) / 12));
    setDoseLogs(prev => [...prev, {
      id: Date.now(),
      medName: med.name.split(" ")[0],
      dose: med.dose,
      time: doseForm.takenAt,
      takenAt: doseForm.takenAt,
      motor: doseForm.motor,
      tremor: doseForm.tremor,
      rigidity: doseForm.rigidity,
      efficacy: Math.round((1 - efficacy) * 100) / 100,
    }]);
    setDoseForm({ medId: meds[0]?.id ?? 1, takenAt: "", motor: 3, tremor: 2, rigidity: 2 });
    setShowLogDose(false);
  }

  return (
    <div className="min-h-screen bg-[#EFEBE6] pb-24">
      <div className="max-w-md mx-auto px-5 pt-4">

        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => navigate("/home")} className="w-10 h-10 rounded-full bg-white flex items-center justify-center">
            <ArrowLeft size={20} className="text-[#1A1A1A]" />
          </button>
          <h1 className="text-xl font-bold text-[#1A1A1A] flex-1">Medication Tracker</h1>
          <button className="w-10 h-10 rounded-full bg-white flex items-center justify-center">
            <Bell size={20} className="text-[#1A1A1A]" />
          </button>
        </div>

        {/* Off-Period Alert */}
        {!alertDismissed && (
          <div className="bg-[#FFE0E0] border border-[#FF6B6B] rounded-[20px] p-4 mb-5 flex gap-3 items-start">
            <AlertTriangle size={20} className="text-[#FF6B6B] flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-bold text-[#FF6B6B]">Off-Period Detected</p>
              <p className="text-xs text-[#6B6B6B] mt-0.5">High symptom score logged at 4:15 PM. Your caregiver has been notified.</p>
            </div>
            <button onClick={() => setAlertDismissed(true)} className="text-xs font-bold text-[#FF6B6B]">Dismiss</button>
          </div>
        )}

        {/* Summary Row */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="bg-white rounded-[20px] p-4 text-center">
            <CheckCircle size={18} className="text-[#5DBEA3] mx-auto mb-1" />
            <p className="text-2xl font-bold text-[#1A1A1A]">{adherenceToday}%</p>
            <p className="text-[10px] text-[#999] uppercase tracking-wide">Today</p>
          </div>
          <div className="bg-white rounded-[20px] p-4 text-center">
            <TrendingUp size={18} className="text-[#FF8C42] mx-auto mb-1" />
            <p className="text-2xl font-bold text-[#1A1A1A]">89%</p>
            <p className="text-[10px] text-[#999] uppercase tracking-wide">7d Avg</p>
          </div>
          <div className="bg-white rounded-[20px] p-4 text-center">
            <Pill size={18} className="text-[#7B68EE] mx-auto mb-1" />
            <p className="text-2xl font-bold text-[#1A1A1A]">{meds.length}</p>
            <p className="text-[10px] text-[#999] uppercase tracking-wide">Meds</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex bg-white rounded-[16px] p-1 mb-5 gap-1">
          {tabs.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex-1 py-2 rounded-[12px] text-xs font-bold transition-all ${tab === t.key ? "bg-[#FF8C42] text-white" : "text-[#6B6B6B]"}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── TODAY TAB ── */}
        {tab === "today" && (
          <div className="space-y-4">

            {/* Log a dose button */}
            <button onClick={() => setShowLogDose(v => !v)}
              className="w-full flex items-center justify-center gap-2 py-3 bg-[#FF8C42] text-white rounded-[16px] text-sm font-bold">
              <Plus size={16} /> Log Dose Taken
            </button>

            {/* Log dose form */}
            {showLogDose && (
              <div className="bg-white rounded-[24px] p-5 border-2 border-[#FF8C42]">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm font-bold text-[#1A1A1A]">Log a Dose</p>
                  <button onClick={() => setShowLogDose(false)}><X size={16} className="text-[#6B6B6B]" /></button>
                </div>

                <div className="space-y-3 mb-4">
                  <div>
                    <label className="text-[10px] text-[#999] uppercase tracking-wide block mb-1">Medication</label>
                    <select value={doseForm.medId}
                      onChange={e => setDoseForm(p => ({ ...p, medId: +e.target.value }))}
                      className="w-full bg-[#F8F8F8] border border-[#E0E0E0] rounded-[10px] px-3 py-2 text-sm outline-none">
                      {meds.map(m => <option key={m.id} value={m.id}>{m.name} — {m.dose}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-[#999] uppercase tracking-wide block mb-1">Time Taken</label>
                    <input type="time" value={doseForm.takenAt}
                      onChange={e => setDoseForm(p => ({ ...p, takenAt: e.target.value }))}
                      className="w-full bg-[#F8F8F8] border border-[#E0E0E0] rounded-[10px] px-3 py-2 text-sm outline-none" />
                  </div>
                </div>

                <p className="text-xs font-bold text-[#1A1A1A] mb-2">How did you feel before taking it?</p>
                {(["motor", "tremor", "rigidity"] as const).map((field) => (
                  <div key={field} className="mb-3">
                    <div className="flex justify-between mb-1">
                      <span className="text-xs text-[#6B6B6B] capitalize">{field} severity</span>
                      <span className="text-xs font-bold text-[#FF8C42]">{doseForm[field]}/5</span>
                    </div>
                    <input type="range" min={1} max={5} value={doseForm[field]}
                      onChange={e => setDoseForm(p => ({ ...p, [field]: +e.target.value }))}
                      className="w-full accent-[#FF8C42]" />
                  </div>
                ))}

                <button onClick={logDose} disabled={!doseForm.takenAt}
                  className="w-full py-2.5 bg-[#FF8C42] text-white rounded-[14px] text-sm font-bold disabled:opacity-40">
                  Save Dose
                </button>
              </div>
            )}

            {/* Snapshot prompt */}
            {showSnapshot && (
              <div className="bg-white rounded-[24px] p-5 border-2 border-[#5DBEA3]">
                <p className="text-sm font-bold text-[#1A1A1A] mb-3">Post-dose check — how do you feel now?</p>
                {(["motor", "tremor", "rigidity"] as const).map((field) => (
                  <div key={field} className="mb-3">
                    <div className="flex justify-between mb-1">
                      <span className="text-xs text-[#6B6B6B] capitalize">{field} severity</span>
                      <span className="text-xs font-bold text-[#5DBEA3]">{snapshotValues[field]}/5</span>
                    </div>
                    <input type="range" min={1} max={5} value={snapshotValues[field]}
                      onChange={e => setSnapshotValues(p => ({ ...p, [field]: +e.target.value }))}
                      className="w-full accent-[#5DBEA3]" />
                  </div>
                ))}
                <button onClick={() => setShowSnapshot(false)}
                  className="w-full py-2.5 bg-[#5DBEA3] text-white rounded-[14px] text-sm font-bold">
                  Submit Post-Dose Snapshot
                </button>
              </div>
            )}

            {/* Dose log list */}
            <div className="bg-white rounded-[24px] p-5">
              <p className="text-base font-bold text-[#1A1A1A] mb-3">Doses Logged Today</p>
              {doseLogs.length === 0 ? (
                <p className="text-sm text-[#999] text-center py-4">No doses logged yet</p>
              ) : (
                <div className="space-y-3">
                  {doseLogs.map((d) => (
                    <div key={d.id} className="flex items-center gap-3 p-3 bg-[#FFF8F4] rounded-[14px]">
                      <div className="w-10 h-10 rounded-full bg-[#D4F1E8] flex items-center justify-center flex-shrink-0">
                        <CheckCircle size={18} className="text-[#5DBEA3]" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-bold text-[#1A1A1A]">{d.medName} {d.dose}</p>
                        <p className="text-xs text-[#999]">{d.takenAt} · Efficacy: {Math.round(d.efficacy * 100)}%</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-[#F0F0F0] rounded-full overflow-hidden">
                          <div className="h-full bg-[#5DBEA3] rounded-full" style={{ width: `${d.efficacy * 100}%` }} />
                        </div>
                        <button onClick={() => setDoseLogs(prev => prev.filter(x => x.id !== d.id))}>
                          <X size={14} className="text-[#B8B8B8]" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Pending doses */}
            <div className="bg-white rounded-[24px] p-5">
              <p className="text-base font-bold text-[#1A1A1A] mb-3">Upcoming Doses</p>
              <div className="space-y-3">
                {meds.flatMap(m =>
                  m.times.filter(t => !doseLogs.some(d => d.medName === m.name.split(" ")[0] && d.takenAt === t))
                    .map(t => ({ med: m, time: t }))
                ).slice(0, 4).map(({ med, time }, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#FFF3E0] flex items-center justify-center flex-shrink-0">
                      <Clock size={18} className="text-[#FF9F43]" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-[#1A1A1A]">{med.name.split(" ")[0]} {med.dose}</p>
                      <p className="text-xs text-[#999]">{time}</p>
                    </div>
                    <button onClick={() => { setShowSnapshot(true); }}
                      className="text-xs font-bold bg-[#FF8C42] text-white px-3 py-1.5 rounded-[10px]">
                      Taken
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── SCHEDULE TAB ── */}
        {tab === "schedule" && (
          <div className="space-y-4">

            {/* Add medication button */}
            <button onClick={() => setShowAddMed(v => !v)}
              className="w-full flex items-center justify-center gap-2 py-3 bg-[#7B68EE] text-white rounded-[16px] text-sm font-bold">
              <Plus size={16} /> Add Medication
            </button>

            {/* Add medication form */}
            {showAddMed && (
              <div className="bg-white rounded-[24px] p-5 border-2 border-[#7B68EE]">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm font-bold text-[#1A1A1A]">New Medication</p>
                  <button onClick={() => setShowAddMed(false)}><X size={16} className="text-[#6B6B6B]" /></button>
                </div>
                <div className="space-y-3 mb-4">
                  <div>
                    <label className="text-[10px] text-[#999] uppercase tracking-wide block mb-1">Medication Name</label>
                    <input value={medForm.name} onChange={e => setMedForm(p => ({ ...p, name: e.target.value }))}
                      placeholder="e.g. Levodopa / Carbidopa"
                      className="w-full bg-[#F8F8F8] border border-[#E0E0E0] rounded-[10px] px-3 py-2 text-sm outline-none" />
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="text-[10px] text-[#999] uppercase tracking-wide block mb-1">Dose Amount</label>
                      <input value={medForm.dose} onChange={e => setMedForm(p => ({ ...p, dose: e.target.value }))}
                        placeholder="100"
                        className="w-full bg-[#F8F8F8] border border-[#E0E0E0] rounded-[10px] px-3 py-2 text-sm outline-none" />
                    </div>
                    <div className="w-20">
                      <label className="text-[10px] text-[#999] uppercase tracking-wide block mb-1">Unit</label>
                      <select value={medForm.unit} onChange={e => setMedForm(p => ({ ...p, unit: e.target.value }))}
                        className="w-full bg-[#F8F8F8] border border-[#E0E0E0] rounded-[10px] px-3 py-2 text-sm outline-none">
                        {["mg", "mcg", "ml", "IU"].map(u => <option key={u}>{u}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-[#999] uppercase tracking-wide block mb-1">First Dose Time</label>
                    <input type="time" value={medForm.time} onChange={e => setMedForm(p => ({ ...p, time: e.target.value }))}
                      className="w-full bg-[#F8F8F8] border border-[#E0E0E0] rounded-[10px] px-3 py-2 text-sm outline-none" />
                  </div>
                </div>
                <button onClick={addMedication} disabled={!medForm.name.trim() || !medForm.dose.trim()}
                  className="w-full py-2.5 bg-[#7B68EE] text-white rounded-[14px] text-sm font-bold disabled:opacity-40">
                  Add to Schedule
                </button>
              </div>
            )}

            {/* Medication cards */}
            {meds.map((med) => (
              <div key={med.id} className="bg-white rounded-[24px] p-5">
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-12 h-12 rounded-[14px] flex items-center justify-center flex-shrink-0" style={{ backgroundColor: med.bg }}>
                    <Pill size={22} style={{ color: med.color }} />
                  </div>
                  <div className="flex-1">
                    <p className="text-base font-bold text-[#1A1A1A]">{med.name}</p>
                    <p className="text-xs text-[#999]">{med.dose} per dose</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {med.avgEfficacy > 0 && (
                      <div className="flex items-center gap-1">
                        {med.trend >= 0
                          ? <TrendingUp size={14} className="text-[#5DBEA3]" />
                          : <TrendingDown size={14} className="text-[#FF6B6B]" />}
                        <span className="text-xs font-bold" style={{ color: med.trend >= 0 ? "#5DBEA3" : "#FF6B6B" }}>
                          {med.trend >= 0 ? "+" : ""}{Math.round(med.trend * 100)}%
                        </span>
                      </div>
                    )}
                    <button onClick={() => setMeds(prev => prev.filter(m => m.id !== med.id))}>
                      <Trash2 size={14} className="text-[#B8B8B8]" />
                    </button>
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap mb-3">
                  {med.times.map((t) => (
                    <span key={t} className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ backgroundColor: med.bg, color: med.color }}>{t}</span>
                  ))}
                </div>
                {med.avgEfficacy > 0 && (
                  <div className="flex items-center justify-between pt-3 border-t border-[#F0F0F0]">
                    <span className="text-xs text-[#6B6B6B]">30-day avg efficacy</span>
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-2 bg-[#F0F0F0] rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${med.avgEfficacy * 100}%`, backgroundColor: med.color }} />
                      </div>
                      <span className="text-xs font-bold text-[#1A1A1A]">{Math.round(med.avgEfficacy * 100)}%</span>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {meds.length === 0 && (
              <div className="bg-white rounded-[24px] p-8 text-center">
                <Pill size={32} className="text-[#B8B8B8] mx-auto mb-3" />
                <p className="text-sm font-bold text-[#1A1A1A] mb-1">No medications added</p>
                <p className="text-xs text-[#999]">Tap "Add Medication" to get started</p>
              </div>
            )}

            {/* Smart Suggestion */}
            {meds.length > 0 && (
              <div className="bg-gradient-to-br from-[#FFE8D6] to-[#FFF3E0] rounded-[24px] p-5 border border-[#FF8C42]">
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-10 h-10 rounded-[12px] bg-[#FF8C42] flex items-center justify-center flex-shrink-0">
                    <TrendingUp size={18} className="text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-[#1A1A1A]">Smart Schedule Suggestion</p>
                    <p className="text-xs text-[#6B6B6B] mt-0.5">Based on 21 days of response data</p>
                  </div>
                </div>
                <p className="text-xs text-[#6B6B6B] mb-3 leading-relaxed">
                  Shifting your <span className="font-bold text-[#FF8C42]">Levodopa 17:00 dose</span> to <span className="font-bold text-[#FF8C42]">16:30</span> could reduce your evening Off-Period by ~35 minutes.
                </p>
                <div className="flex gap-2">
                  <button className="flex-1 py-2 bg-[#FF8C42] text-white rounded-[12px] text-xs font-bold">Apply</button>
                  <button className="flex-1 py-2 bg-white text-[#6B6B6B] rounded-[12px] text-xs font-bold border border-[#E0E0E0]">Dismiss</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── INSIGHTS TAB ── */}
        {tab === "insights" && (
          <div className="space-y-4">
            <div className="bg-white rounded-[24px] p-5">
              <h3 className="text-base font-bold text-[#1A1A1A] mb-4">Efficacy Trend — 7 Days</h3>
              <div className="flex items-end gap-2 mb-3" style={{ height: "80px" }}>
                {efficacyHistory.map((d) => (
                  <div key={d.day} className="flex-1 flex gap-0.5 items-end h-full">
                    <div className="flex-1 rounded-t-sm bg-[#FF8C42]" style={{ height: `${d.levodopa * 80}px`, opacity: 0.85 }} />
                    <div className="flex-1 rounded-t-sm bg-[#7B68EE]" style={{ height: `${d.pramipexole * 80}px`, opacity: 0.85 }} />
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mb-2">
                {efficacyHistory.map((d) => (
                  <div key={d.day} className="flex-1 text-center">
                    <p className="text-[10px] text-[#999] uppercase">{d.day}</p>
                  </div>
                ))}
              </div>
              <div className="flex gap-4 pt-3 border-t border-[#F0F0F0]">
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-[#FF8C42]" /><span className="text-xs text-[#6B6B6B]">Levodopa</span></div>
                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-[#7B68EE]" /><span className="text-xs text-[#6B6B6B]">Pramipexole</span></div>
              </div>
            </div>

            <div className="bg-white rounded-[24px] p-5">
              <h3 className="text-base font-bold text-[#1A1A1A] mb-3">Today's On/Off Timeline</h3>
              <div className="flex h-8 rounded-[10px] overflow-hidden gap-0.5">
                {[
                  { label: "OFF", width: 12, color: "#FF6B6B" },
                  { label: "ON", width: 20, color: "#5DBEA3" },
                  { label: "ON", width: 18, color: "#5DBEA3" },
                  { label: "OFF", width: 10, color: "#FF6B6B" },
                  { label: "ON", width: 22, color: "#5DBEA3" },
                  { label: "OFF", width: 18, color: "#FF9F43" },
                ].map((seg, i) => (
                  <div key={i} className="flex items-center justify-center text-[10px] font-bold text-white rounded-sm"
                    style={{ flex: seg.width, backgroundColor: seg.color }}>
                    {seg.label}
                  </div>
                ))}
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-[10px] text-[#999]">6 AM</span>
                <span className="text-[10px] text-[#999]">12 PM</span>
                <span className="text-[10px] text-[#999]">6 PM</span>
              </div>
            </div>

            <div className="bg-white rounded-[24px] p-5">
              <h3 className="text-base font-bold text-[#1A1A1A] mb-3">Peak Off-Period Windows</h3>
              <p className="text-xs text-[#6B6B6B] mb-3">Times with highest Off-Period frequency (last 14 days)</p>
              <div className="space-y-3">
                {offWindows.map((w, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-xs font-bold text-[#1A1A1A] w-24">{w.window}</span>
                    <div className="flex-1 h-2 bg-[#F0F0F0] rounded-full overflow-hidden">
                      <div className="h-full bg-[#FF6B6B] rounded-full" style={{ width: `${w.proportion * 100}%` }} />
                    </div>
                    <span className="text-xs font-bold text-[#FF6B6B]">{Math.round(w.proportion * 100)}%</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Today's logged doses summary */}
            {doseLogs.length > 0 && (
              <div className="bg-white rounded-[24px] p-5">
                <h3 className="text-base font-bold text-[#1A1A1A] mb-3">Today's Dose Summary</h3>
                <div className="space-y-2">
                  {doseLogs.map(d => (
                    <div key={d.id} className="flex items-center justify-between">
                      <span className="text-sm text-[#6B6B6B]">{d.medName} @ {d.takenAt}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-[#F0F0F0] rounded-full overflow-hidden">
                          <div className="h-full bg-[#5DBEA3] rounded-full" style={{ width: `${d.efficacy * 100}%` }} />
                        </div>
                        <span className="text-xs font-bold text-[#1A1A1A]">{Math.round(d.efficacy * 100)}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── CALENDAR TAB ── */}
        {tab === "calendar" && (
          <MedCalendar meds={meds} doseLogs={doseLogs} />
        )}

      </div>
      <BottomNav />
    </div>
  );
};

// ── MedCalendar sub-component ─────────────────────────────────────────────────

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAY_SHORT = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

// Hours shown in the time grid (6 AM – 10 PM)
const GRID_START = 6;
const GRID_END = 22;
const HOUR_HEIGHT = 56; // px per hour

function MedCalendar({ meds, doseLogs }: { meds: Medication[]; doseLogs: DoseLog[] }) {
  const today = new Date();

  // Week offset from current week (0 = this week)
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState(today.getDay()); // 0=Sun

  // Compute the Sunday of the displayed week
  const weekStart = useMemo(() => {
    const d = new Date(today);
    d.setDate(today.getDate() - today.getDay() + weekOffset * 7);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [weekOffset]);

  // 7 day objects for the header strip
  const weekDays = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      return d;
    }), [weekStart]);

  const activeDate = weekDays[selectedDay];
  const isThisWeek = weekOffset === 0;

  // Build events for the active day
  const dayEvents = useMemo(() => {
    const isToday =
      activeDate.getDate() === today.getDate() &&
      activeDate.getMonth() === today.getMonth() &&
      activeDate.getFullYear() === today.getFullYear();
    const isFuture = activeDate > today;

    return meds.flatMap(med =>
      med.times.map(t => {
        const [h, m] = t.split(":").map(Number);
        const taken = isToday && doseLogs.some(
          dl => dl.medName === med.name.split(" ")[0] && dl.takenAt === t
        );
        return { name: med.name.split(" ")[0], dose: med.dose, time: t, hour: h, minute: m, color: med.color, bg: med.bg, taken, isFuture };
      })
    ).sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute));
  }, [meds, doseLogs, activeDate]);

  // Dot status per day for the header
  function dayStatus(d: Date) {
    const isT = d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
    const isFut = d > today;
    if (meds.length === 0) return "none";
    if (isFut) return "future";
    const total = meds.reduce((s, m) => s + m.times.length, 0);
    const taken = isT ? doseLogs.length : total; // past days assumed taken for demo
    if (taken >= total) return "full";
    if (taken > 0) return "partial";
    return "missed";
  }

  const statusColor: Record<string, string> = {
    full: "#5DBEA3", partial: "#FF9F43", missed: "#FF6B6B", future: "#E0E0E0", none: "transparent",
  };

  const monthLabel = `${MONTH_NAMES[weekDays[0].getMonth()]}${
    weekDays[0].getMonth() !== weekDays[6].getMonth()
      ? ` – ${MONTH_NAMES[weekDays[6].getMonth()]}`
      : ""
  } ${weekDays[0].getFullYear()}`;

  return (
    <div className="space-y-3">
      {/* ── Header: month + week nav ── */}
      <div className="bg-white rounded-[24px] overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-4 pb-3">
          <button onClick={() => setWeekOffset(w => w - 1)}
            className="w-8 h-8 rounded-full bg-[#F0F0F0] flex items-center justify-center">
            <ChevronLeft size={16} className="text-[#6B6B6B]" />
          </button>
          <div className="text-center">
            <p className="text-sm font-bold text-[#1A1A1A]">{monthLabel}</p>
            {!isThisWeek && (
              <button onClick={() => { setWeekOffset(0); setSelectedDay(today.getDay()); }}
                className="text-[10px] font-bold text-[#FF8C42] mt-0.5">
                Back to today
              </button>
            )}
          </div>
          <button onClick={() => setWeekOffset(w => w + 1)}
            className="w-8 h-8 rounded-full bg-[#F0F0F0] flex items-center justify-center">
            <ChevronRight size={16} className="text-[#6B6B6B]" />
          </button>
        </div>

        {/* ── Horizontal day strip ── */}
        <div className="flex px-3 pb-4 gap-1">
          {weekDays.map((d, i) => {
            const isToday = isThisWeek && d.getDate() === today.getDate();
            const isSelected = i === selectedDay;
            const status = dayStatus(d);
            return (
              <button key={i} onClick={() => setSelectedDay(i)}
                className={`flex-1 flex flex-col items-center py-2 rounded-[14px] transition-all ${
                  isSelected ? "bg-[#FF8C42]" : isToday ? "bg-[#FFE8D6]" : "hover:bg-[#F8F8F8]"
                }`}>
                <span className={`text-[10px] font-bold uppercase mb-1 ${
                  isSelected ? "text-white" : isToday ? "text-[#FF8C42]" : "text-[#B8B8B8]"
                }`}>{DAY_SHORT[i]}</span>
                <span className={`text-base font-bold ${
                  isSelected ? "text-white" : isToday ? "text-[#FF8C42]" : "text-[#1A1A1A]"
                }`}>{d.getDate()}</span>
                <div className="w-1.5 h-1.5 rounded-full mt-1"
                  style={{ backgroundColor: isSelected ? "rgba(255,255,255,0.7)" : statusColor[status] }} />
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Time grid ── */}
      <div className="bg-white rounded-[24px] overflow-hidden">
        <div className="px-4 pt-4 pb-2 flex items-center justify-between">
          <p className="text-sm font-bold text-[#1A1A1A]">
            {DAY_SHORT[selectedDay]}, {activeDate.getDate()} {MONTH_NAMES[activeDate.getMonth()]}
          </p>
          <div className="flex gap-3">
            <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-[#5DBEA3]" /><span className="text-[10px] text-[#6B6B6B]">Taken</span></div>
            <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-[#FF9F43]" /><span className="text-[10px] text-[#6B6B6B]">Upcoming</span></div>
          </div>
        </div>

        <div className="relative overflow-y-auto" style={{ maxHeight: "420px" }}>
          {/* Time labels + horizontal lines */}
          <div className="relative" style={{ height: `${(GRID_END - GRID_START) * HOUR_HEIGHT}px` }}>
            {Array.from({ length: GRID_END - GRID_START + 1 }, (_, i) => {
              const hour = GRID_START + i;
              const label = hour === 0 ? "12 AM" : hour < 12 ? `${hour} AM` : hour === 12 ? "12 PM" : `${hour - 12} PM`;
              return (
                <div key={hour} className="absolute left-0 right-0 flex items-start"
                  style={{ top: `${i * HOUR_HEIGHT}px` }}>
                  <span className="text-[10px] text-[#B8B8B8] w-12 pl-4 -mt-2 select-none">{label}</span>
                  <div className="flex-1 border-t border-[#F0F0F0]" />
                </div>
              );
            })}

            {/* Current time indicator (only on today) */}
            {isThisWeek && selectedDay === today.getDay() && (() => {
              const nowH = today.getHours();
              const nowM = today.getMinutes();
              if (nowH < GRID_START || nowH >= GRID_END) return null;
              const top = (nowH - GRID_START + nowM / 60) * HOUR_HEIGHT;
              return (
                <div className="absolute left-12 right-0 flex items-center z-20" style={{ top: `${top}px` }}>
                  <div className="w-2.5 h-2.5 rounded-full bg-[#FF8C42] -ml-1.5 flex-shrink-0" />
                  <div className="flex-1 border-t-2 border-[#FF8C42]" />
                </div>
              );
            })()}

            {/* Dose event blocks */}
            {dayEvents
              .filter(ev => ev.hour >= GRID_START && ev.hour < GRID_END)
              .map((ev, i) => {
                const top = (ev.hour - GRID_START + ev.minute / 60) * HOUR_HEIGHT;
                const statusBg = ev.taken ? "#D4F1E8" : ev.isFuture ? ev.bg : "#FFE8D6";
                const statusText = ev.taken ? "#5DBEA3" : ev.isFuture ? ev.color : "#FF9F43";
                const statusLabel = ev.taken ? "✓ Taken" : ev.isFuture ? "Scheduled" : "Upcoming";
                return (
                  <div key={i} className="absolute left-14 right-4 rounded-[10px] px-3 py-1.5 z-10 shadow-sm"
                    style={{ top: `${top + 2}px`, backgroundColor: statusBg, borderLeft: `3px solid ${ev.color}` }}>
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold" style={{ color: ev.color }}>{ev.name} {ev.dose}</p>
                      <span className="text-[10px] font-bold" style={{ color: statusText }}>{statusLabel}</span>
                    </div>
                    <p className="text-[10px] text-[#999]">{ev.time}</p>
                  </div>
                );
              })}
          </div>
        </div>
      </div>

      {/* ── External sync ── */}
      <div className="bg-white rounded-[24px] p-5">
        <h3 className="text-sm font-bold text-[#1A1A1A] mb-3">Sync to External Calendar</h3>
        <div className="space-y-2">
          {[
            { name: "Google Calendar", connected: true, lastSync: "5 min ago" },
            { name: "Apple Calendar", connected: false, lastSync: "—" },
          ].map((cal) => (
            <div key={cal.name} className="flex items-center gap-3 p-3 bg-[#F8F8F8] rounded-[14px]">
              <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: cal.connected ? "#D4F1E8" : "#F0F0F0" }}>
                <Calendar size={14} style={{ color: cal.connected ? "#5DBEA3" : "#B8B8B8" }} />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-[#1A1A1A]">{cal.name}</p>
                <p className="text-[10px] text-[#999]">Last sync: {cal.lastSync}</p>
              </div>
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${cal.connected ? "bg-[#D4F1E8] text-[#5DBEA3]" : "bg-[#F0F0F0] text-[#B8B8B8]"}`}>
                {cal.connected ? "Synced" : "Connect"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default MedicationTracking;
