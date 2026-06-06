import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Moon, Heart, Zap, AlertTriangle, Watch, TrendingDown, Plus, X, CheckCircle } from "lucide-react";
import BottomNav from "@/components/BottomNav";

type SleepEntry = {
  id: number;
  date: string;
  bedtime: string;
  wakeTime: string;
  totalHours: number;
  remPct: number;
  deepPct: number;
  awakenings: number;
  restingHR: number;
  score: number;
  rbdFlag: boolean;
  source: "manual" | "wearable";
};

type DystoniaEntry = {
  id: number;
  time: string;
  region: string;
  severity: number;
  duration: number;
};

const scoreColor = (s: number) => s >= 70 ? "#5DBEA3" : s >= 40 ? "#FF9F43" : "#FF6B6B";
const scoreBg = (s: number) => s >= 70 ? "#D4F1E8" : s >= 40 ? "#FFF3E0" : "#FFE0E0";

function calcScore(remPct: number, deepPct: number, awakenings: number, totalHours: number): number {
  const efficiency = Math.min(totalHours / 8, 1) * 40;
  const remScore = (remPct >= 20 && remPct <= 25 ? 1 : remPct / 25) * 30;
  const deepScore = (deepPct >= 15 && deepPct <= 20 ? 1 : deepPct / 20) * 20;
  const awakeScore = Math.max(0, 1 - awakenings / 6) * 10;
  return Math.min(100, Math.round(efficiency + remScore + deepScore + awakeScore));
}

const initialSleepLog: SleepEntry[] = [
  { id: 1, date: "Mon", bedtime: "22:30", wakeTime: "06:45", totalHours: 8.25, remPct: 22, deepPct: 18, awakenings: 1, restingHR: 57, score: 82, rbdFlag: false, source: "wearable" },
  { id: 2, date: "Tue", bedtime: "23:15", wakeTime: "06:30", totalHours: 7.25, remPct: 14, deepPct: 12, awakenings: 3, restingHR: 61, score: 61, rbdFlag: false, source: "wearable" },
  { id: 3, date: "Wed", bedtime: "22:45", wakeTime: "07:00", totalHours: 8.25, remPct: 20, deepPct: 16, awakenings: 2, restingHR: 59, score: 74, rbdFlag: false, source: "wearable" },
  { id: 4, date: "Thu", bedtime: "00:00", wakeTime: "06:00", totalHours: 6, remPct: 10, deepPct: 9, awakenings: 5, restingHR: 68, score: 45, rbdFlag: true, source: "wearable" },
  { id: 5, date: "Fri", bedtime: "22:30", wakeTime: "07:15", totalHours: 8.75, remPct: 21, deepPct: 17, awakenings: 1, restingHR: 56, score: 78, rbdFlag: false, source: "wearable" },
  { id: 6, date: "Sat", bedtime: "22:00", wakeTime: "07:00", totalHours: 9, remPct: 24, deepPct: 19, awakenings: 1, restingHR: 55, score: 88, rbdFlag: false, source: "wearable" },
  { id: 7, date: "Sun", bedtime: "23:45", wakeTime: "06:30", totalHours: 6.75, remPct: 12, deepPct: 11, awakenings: 4, restingHR: 65, score: 55, rbdFlag: true, source: "wearable" },
];

const initialDystonia: DystoniaEntry[] = [
  { id: 1, time: "08:15 AM", region: "Hand", severity: 3, duration: 12 },
  { id: 2, time: "01:40 PM", region: "Leg", severity: 4, duration: 20 },
  { id: 3, time: "06:55 PM", region: "Neck", severity: 2, duration: 8 },
];

const bodyRegions = ["Hand", "Foot", "Leg", "Arm", "Neck", "Trunk", "Face"];

const SleepMonitoring = () => {
  const navigate = useNavigate();

  // Live state
  const [sleepLog, setSleepLog] = useState<SleepEntry[]>(initialSleepLog);
  const [dystoniaLog, setDystoniaLog] = useState<DystoniaEntry[]>(initialDystonia);

  // Sleep log form
  const [showSleepForm, setShowSleepForm] = useState(false);
  const [sleepForm, setSleepForm] = useState({ bedtime: "22:30", wakeTime: "07:00", remPct: 20, deepPct: 16, awakenings: 2, restingHR: 60 });

  // Dystonia log form
  const [showDystoniaForm, setShowDystoniaForm] = useState(false);
  const [dystoniaForm, setDystoniaForm] = useState({ time: "", region: "Hand", severity: 3, duration: 10 });

  const rollingAvg = Math.round(sleepLog.reduce((s, d) => s + d.score, 0) / sleepLog.length);
  const rbdCount = sleepLog.filter(d => d.rbdFlag).length;
  const rbdScore = (rbdCount / sleepLog.length).toFixed(2);
  const latest = sleepLog[sleepLog.length - 1];

  function addSleepEntry() {
    const [bH, bM] = sleepForm.bedtime.split(":").map(Number);
    const [wH, wM] = sleepForm.wakeTime.split(":").map(Number);
    let totalHours = (wH + wM / 60) - (bH + bM / 60);
    if (totalHours < 0) totalHours += 24;
    totalHours = Math.round(totalHours * 10) / 10;
    const score = calcScore(sleepForm.remPct, sleepForm.deepPct, sleepForm.awakenings, totalHours);
    const rbdFlag = sleepForm.remPct < 12 || sleepForm.awakenings > 4;
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const today = days[new Date().getDay()];
    setSleepLog(prev => [...prev.slice(-6), {
      id: Date.now(), date: today, bedtime: sleepForm.bedtime, wakeTime: sleepForm.wakeTime,
      totalHours, remPct: sleepForm.remPct, deepPct: sleepForm.deepPct,
      awakenings: sleepForm.awakenings, restingHR: sleepForm.restingHR,
      score, rbdFlag, source: "manual",
    }]);
    setShowSleepForm(false);
  }

  function addDystoniaEntry() {
    if (!dystoniaForm.time) return;
    setDystoniaLog(prev => [...prev, {
      id: Date.now(),
      time: dystoniaForm.time,
      region: dystoniaForm.region,
      severity: dystoniaForm.severity,
      duration: dystoniaForm.duration,
    }]);
    setDystoniaForm({ time: "", region: "Hand", severity: 3, duration: 10 });
    setShowDystoniaForm(false);
  }

  return (
    <div className="min-h-screen bg-[#EFEBE6] pb-24">
      <div className="max-w-md mx-auto px-5 pt-4">

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate("/home")} className="w-10 h-10 rounded-full bg-white flex items-center justify-center">
            <ArrowLeft size={20} className="text-[#1A1A1A]" />
          </button>
          <h1 className="text-xl font-bold text-[#1A1A1A]">Sleep & Physiology</h1>
        </div>

        {/* RBD Alert */}
        {rbdCount > 0 && (
          <div className="bg-[#FFE0E0] border border-[#FF6B6B] rounded-[20px] p-4 mb-5 flex gap-3 items-start">
            <AlertTriangle size={20} className="text-[#FF6B6B] flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-[#FF6B6B]">RBD Flag Detected</p>
              <p className="text-xs text-[#6B6B6B] mt-0.5">{rbdCount} night{rbdCount > 1 ? "s" : ""} this week showed REM fragmentation. Weekly RBD risk score: <span className="font-bold">{rbdScore}</span></p>
            </div>
          </div>
        )}

        {/* Summary Row */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="bg-white rounded-[20px] p-4 text-center">
            <Moon size={20} className="text-[#7B68EE] mx-auto mb-1" />
            <p className="text-2xl font-bold text-[#1A1A1A]">{rollingAvg}</p>
            <p className="text-[10px] text-[#999] uppercase tracking-wide">7d Avg</p>
          </div>
          <div className="bg-white rounded-[20px] p-4 text-center">
            <Heart size={20} className="text-[#FF6B6B] mx-auto mb-1" />
            <p className="text-2xl font-bold text-[#1A1A1A]">{latest?.restingHR ?? "—"}</p>
            <p className="text-[10px] text-[#999] uppercase tracking-wide">Resting HR</p>
          </div>
          <div className="bg-white rounded-[20px] p-4 text-center">
            <Zap size={20} className="text-[#FF9F43] mx-auto mb-1" />
            <p className="text-2xl font-bold text-[#1A1A1A]">{dystoniaLog.length}</p>
            <p className="text-[10px] text-[#999] uppercase tracking-wide">Dystonia</p>
          </div>
        </div>

        {/* Sleep Quality Chart */}
        <div className="bg-white rounded-[24px] p-5 mb-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-[#1A1A1A]">Sleep Quality</h2>
            <button
              onClick={() => setShowSleepForm(true)}
              className="flex items-center gap-1 bg-[#7B68EE] text-white text-xs font-bold px-3 py-1.5 rounded-full"
            >
              <Plus size={12} /> Log Night
            </button>
          </div>

          {/* Log form */}
          {showSleepForm && (
            <div className="bg-[#F5F3FF] rounded-[18px] p-4 mb-4 border border-[#DDD8F5]">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-bold text-[#1A1A1A]">Log Last Night</p>
                <button onClick={() => setShowSleepForm(false)}><X size={16} className="text-[#6B6B6B]" /></button>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="text-[10px] text-[#999] uppercase tracking-wide block mb-1">Bedtime</label>
                  <input type="time" value={sleepForm.bedtime}
                    onChange={e => setSleepForm(p => ({ ...p, bedtime: e.target.value }))}
                    className="w-full bg-white border border-[#E0E0E0] rounded-[10px] px-3 py-2 text-sm text-[#1A1A1A] outline-none" />
                </div>
                <div>
                  <label className="text-[10px] text-[#999] uppercase tracking-wide block mb-1">Wake Time</label>
                  <input type="time" value={sleepForm.wakeTime}
                    onChange={e => setSleepForm(p => ({ ...p, wakeTime: e.target.value }))}
                    className="w-full bg-white border border-[#E0E0E0] rounded-[10px] px-3 py-2 text-sm text-[#1A1A1A] outline-none" />
                </div>
              </div>
              <div className="space-y-3 mb-4">
                {([
                  { key: "remPct", label: "REM %", min: 0, max: 40 },
                  { key: "deepPct", label: "Deep Sleep %", min: 0, max: 40 },
                  { key: "awakenings", label: "Awakenings", min: 0, max: 15 },
                  { key: "restingHR", label: "Resting HR (bpm)", min: 40, max: 100 },
                ] as const).map(({ key, label, min, max }) => (
                  <div key={key}>
                    <div className="flex justify-between mb-1">
                      <span className="text-xs text-[#6B6B6B]">{label}</span>
                      <span className="text-xs font-bold text-[#7B68EE]">{sleepForm[key]}{key === "restingHR" ? " bpm" : key === "awakenings" ? "" : "%"}</span>
                    </div>
                    <input type="range" min={min} max={max} value={sleepForm[key]}
                      onChange={e => setSleepForm(p => ({ ...p, [key]: +e.target.value }))}
                      className="w-full accent-[#7B68EE]" />
                  </div>
                ))}
              </div>
              <button onClick={addSleepEntry}
                className="w-full py-2.5 bg-[#7B68EE] text-white rounded-[12px] text-sm font-bold">
                Save Night
              </button>
            </div>
          )}

          {/* Bar chart */}
          <div className="flex items-end gap-2 mb-3" style={{ height: "96px" }}>
            {sleepLog.slice(-7).map((d) => (
              <div key={d.id} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                <div className="w-full rounded-t-lg transition-all relative"
                  style={{ height: `${(d.score / 100) * 88}px`, backgroundColor: scoreColor(d.score), opacity: 0.85 }}>
                  {d.source === "manual" && (
                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-[#7B68EE] rounded-full border border-white" title="Manually logged" />
                  )}
                </div>
                {d.rbdFlag && <div className="w-2 h-2 rounded-full bg-[#FF6B6B]" />}
              </div>
            ))}
          </div>
          <div className="flex gap-2 mb-3">
            {sleepLog.slice(-7).map((d) => (
              <div key={d.id} className="flex-1 text-center">
                <p className="text-[10px] text-[#999] uppercase">{d.date}</p>
                <p className="text-xs font-bold" style={{ color: scoreColor(d.score) }}>{d.score}</p>
              </div>
            ))}
          </div>
          <div className="flex gap-4 pt-3 border-t border-[#F0F0F0] flex-wrap gap-y-1">
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-[#5DBEA3]" /><span className="text-xs text-[#6B6B6B]">Good (70+)</span></div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-[#FF9F43]" /><span className="text-xs text-[#6B6B6B]">Fair (40–69)</span></div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-[#FF6B6B]" /><span className="text-xs text-[#6B6B6B]">Poor (&lt;40)</span></div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-[#7B68EE]" /><span className="text-xs text-[#6B6B6B]">Manual</span></div>
          </div>
        </div>

        {/* Latest Night Detail */}
        {latest && (
          <div className="bg-white rounded-[24px] p-5 mb-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-[#1A1A1A]">
                {latest.source === "manual" ? "Last Logged Night" : "Last Night"}
              </h2>
              <span className="text-xs font-bold px-2.5 py-1 rounded-full"
                style={{ backgroundColor: scoreBg(latest.score), color: scoreColor(latest.score) }}>
                Score: {latest.score}
              </span>
            </div>
            <div className="space-y-3">
              {[
                { label: "Bedtime → Wake", value: `${latest.bedtime} → ${latest.wakeTime}`, icon: "🌙" },
                { label: "Total Sleep", value: `${latest.totalHours}h`, icon: "⏱️" },
                { label: "REM Sleep", value: `${latest.remPct}%`, icon: "💜" },
                { label: "Deep Sleep", value: `${latest.deepPct}%`, icon: "🔵" },
                { label: "Awakenings", value: `${latest.awakenings}`, icon: "⚡" },
                { label: "Resting HR", value: `${latest.restingHR} bpm`, icon: "❤️" },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{item.icon}</span>
                    <span className="text-sm text-[#6B6B6B]">{item.label}</span>
                  </div>
                  <span className="text-sm font-bold text-[#1A1A1A]">{item.value}</span>
                </div>
              ))}
            </div>
            {latest.rbdFlag && (
              <div className="mt-3 pt-3 border-t border-[#F0F0F0] flex items-center gap-2">
                <AlertTriangle size={14} className="text-[#FF6B6B]" />
                <span className="text-xs text-[#FF6B6B] font-bold">RBD indicators detected this night</span>
              </div>
            )}
          </div>
        )}

        {/* Dystonia Events */}
        <div className="bg-white rounded-[24px] p-5 mb-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-[#1A1A1A]">Dystonia Events Today</h2>
            <button
              onClick={() => setShowDystoniaForm(v => !v)}
              className="flex items-center gap-1 bg-[#7B68EE] text-white text-xs font-bold px-3 py-1.5 rounded-full"
            >
              <Plus size={12} /> Log Event
            </button>
          </div>

          {showDystoniaForm && (
            <div className="bg-[#F5F3FF] rounded-[18px] p-4 mb-4 border border-[#DDD8F5]">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-bold text-[#1A1A1A]">New Dystonia Event</p>
                <button onClick={() => setShowDystoniaForm(false)}><X size={16} className="text-[#6B6B6B]" /></button>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="text-[10px] text-[#999] uppercase tracking-wide block mb-1">Time</label>
                  <input type="time" value={dystoniaForm.time}
                    onChange={e => setDystoniaForm(p => ({ ...p, time: e.target.value }))}
                    className="w-full bg-white border border-[#E0E0E0] rounded-[10px] px-3 py-2 text-sm outline-none" />
                </div>
                <div>
                  <label className="text-[10px] text-[#999] uppercase tracking-wide block mb-1">Body Region</label>
                  <select value={dystoniaForm.region}
                    onChange={e => setDystoniaForm(p => ({ ...p, region: e.target.value }))}
                    className="w-full bg-white border border-[#E0E0E0] rounded-[10px] px-3 py-2 text-sm outline-none">
                    {bodyRegions.map(r => <option key={r}>{r}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-3 mb-4">
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-xs text-[#6B6B6B]">Severity</span>
                    <span className="text-xs font-bold text-[#7B68EE]">{dystoniaForm.severity}/5</span>
                  </div>
                  <input type="range" min={1} max={5} value={dystoniaForm.severity}
                    onChange={e => setDystoniaForm(p => ({ ...p, severity: +e.target.value }))}
                    className="w-full accent-[#7B68EE]" />
                </div>
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-xs text-[#6B6B6B]">Duration (min)</span>
                    <span className="text-xs font-bold text-[#7B68EE]">{dystoniaForm.duration} min</span>
                  </div>
                  <input type="range" min={1} max={60} value={dystoniaForm.duration}
                    onChange={e => setDystoniaForm(p => ({ ...p, duration: +e.target.value }))}
                    className="w-full accent-[#7B68EE]" />
                </div>
              </div>
              <button onClick={addDystoniaEntry}
                disabled={!dystoniaForm.time}
                className="w-full py-2.5 bg-[#7B68EE] text-white rounded-[12px] text-sm font-bold disabled:opacity-40">
                Save Event
              </button>
            </div>
          )}

          {dystoniaLog.length === 0 ? (
            <p className="text-sm text-[#999] text-center py-4">No events logged today</p>
          ) : (
            <div className="space-y-3">
              {dystoniaLog.map((e) => (
                <div key={e.id} className="flex items-center gap-3 p-3 bg-[#F8F7FF] rounded-[14px]">
                  <div className="w-10 h-10 rounded-full bg-[#DDD8F5] flex items-center justify-center flex-shrink-0">
                    <Zap size={16} className="text-[#7B68EE]" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-[#1A1A1A]">{e.region} — {e.time}</p>
                    <p className="text-xs text-[#6B6B6B]">Severity {e.severity}/5 · {e.duration} min</p>
                  </div>
                  <div className="flex gap-1">
                    {Array.from({ length: 5 }).map((_, j) => (
                      <div key={j} className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: j < e.severity ? "#7B68EE" : "#E0E0E0" }} />
                    ))}
                  </div>
                  <button onClick={() => setDystoniaLog(prev => prev.filter(x => x.id !== e.id))}>
                    <X size={14} className="text-[#B8B8B8]" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Wearables */}
        <div className="bg-white rounded-[24px] p-5 mb-5">
          <h2 className="text-lg font-bold text-[#1A1A1A] mb-4">Connected Wearables</h2>
          <div className="space-y-3">
            {[
              { name: "Apple Watch", status: "connected", lastSync: "2 min ago" },
              { name: "Fitbit Sense", status: "disconnected", lastSync: "3 days ago" },
            ].map((w) => (
              <div key={w.name} className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${w.status === "connected" ? "bg-[#D4F1E8]" : "bg-[#F0F0F0]"}`}>
                  <Watch size={18} className={w.status === "connected" ? "text-[#5DBEA3]" : "text-[#B8B8B8]"} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-[#1A1A1A]">{w.name}</p>
                  <p className="text-xs text-[#999]">Last sync: {w.lastSync}</p>
                </div>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${w.status === "connected" ? "bg-[#D4F1E8] text-[#5DBEA3]" : "bg-[#F0F0F0] text-[#B8B8B8]"}`}>
                  {w.status === "connected" ? "Connected" : "Disconnected"}
                </span>
              </div>
            ))}
            <button className="w-full mt-2 py-3 rounded-[14px] border-2 border-dashed border-[#DDD8F5] text-sm font-bold text-[#7B68EE] flex items-center justify-center gap-2">
              + Connect Wearable
            </button>
          </div>
        </div>

        {/* Correlation Insight */}
        <div className="bg-gradient-to-br from-[#DDD8F5] to-[#C8E6DD] rounded-[24px] p-5 mb-5">
          <div className="flex items-start gap-3">
            <TrendingDown size={22} className="text-[#7B68EE] flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-[#1A1A1A]">Sleep–Dystonia Correlation</p>
              <p className="text-xs text-[#6B6B6B] mt-1 leading-relaxed">
                Nights with sleep score below 60 correlate with <span className="font-bold text-[#7B68EE]">2.4× more</span> dystonia events the following day. Pearson r = −0.71.
              </p>
            </div>
          </div>
        </div>

      </div>
      <BottomNav />
    </div>
  );
};

export default SleepMonitoring;
