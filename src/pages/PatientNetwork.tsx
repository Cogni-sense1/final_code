import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Users, MessageCircle, Bell, Shield, ChevronRight, Heart, Star } from "lucide-react";
import BottomNav from "@/components/BottomNav";

const suggestions = [
  { id: 1, name: "WillowTree42", stage: 2, diagYear: 2019, interests: ["Yoga", "Gardening"], score: 0.91, bio: "Living with PD for 5 years. Love sharing tips on staying active." },
  { id: 2, name: "BlueSky_PD", stage: 2, diagYear: 2020, interests: ["Reading", "Cooking"], score: 0.84, bio: "Diagnosed in 2020. Looking for others at a similar stage." },
  { id: 3, name: "MorningWalker", stage: 2.5, diagYear: 2018, interests: ["Walking", "Music"], score: 0.76, bio: "Daily walks keep me going. Happy to connect!" },
];

const connections = [
  { id: 1, name: "SunriseHiker", stage: 2, lastMessage: "How did your physio go?", time: "10m ago", unread: 2 },
  { id: 2, name: "QuietStrength", stage: 1.5, lastMessage: "Thanks for the tip on Levodopa timing!", time: "2h ago", unread: 0 },
];

const groupMessages = [
  { author: "WillowTree42", text: "Morning everyone! Had a great session with my physio today 💪", time: "9:12 AM" },
  { author: "BlueSky_PD", text: "Anyone else finding the cold weather makes tremors worse?", time: "9:45 AM" },
  { author: "You", text: "Yes! I always notice it in winter. Warm gloves help me a lot.", time: "10:02 AM" },
  { author: "MorningWalker", text: "Same here. My neurologist suggested light stretching before going out.", time: "10:18 AM" },
];

type Tab = "suggestions" | "connections" | "groups" | "settings";

const PatientNetwork = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("suggestions");
  const [requestSent, setRequestSent] = useState<number[]>([]);
  const [message, setMessage] = useState("");

  const tabs: { key: Tab; label: string }[] = [
    { key: "suggestions", label: "Suggestions" },
    { key: "connections", label: "Connections" },
    { key: "groups", label: "Groups" },
    { key: "settings", label: "Settings" },
  ];

  return (
    <div className="min-h-screen bg-[#EFEBE6] pb-24">
      <div className="max-w-md mx-auto px-5 pt-4">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => navigate("/home")} className="w-10 h-10 rounded-full bg-white flex items-center justify-center">
            <ArrowLeft size={20} className="text-[#1A1A1A]" />
          </button>
          <h1 className="text-xl font-bold text-[#1A1A1A] flex-1">Support Network</h1>
          <div className="relative">
            <button className="w-10 h-10 rounded-full bg-white flex items-center justify-center">
              <Bell size={20} className="text-[#1A1A1A]" />
            </button>
            <div className="absolute -top-1 -right-1 w-5 h-5 bg-[#FF6B6B] rounded-full flex items-center justify-center">
              <span className="text-[10px] font-bold text-white">2</span>
            </div>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="bg-white rounded-[20px] p-4 text-center">
            <Users size={18} className="text-[#5DBEA3] mx-auto mb-1" />
            <p className="text-2xl font-bold text-[#1A1A1A]">2</p>
            <p className="text-[10px] text-[#999] uppercase tracking-wide">Connections</p>
          </div>
          <div className="bg-white rounded-[20px] p-4 text-center">
            <MessageCircle size={18} className="text-[#7B68EE] mx-auto mb-1" />
            <p className="text-2xl font-bold text-[#1A1A1A]">2</p>
            <p className="text-[10px] text-[#999] uppercase tracking-wide">Unread</p>
          </div>
          <div className="bg-white rounded-[20px] p-4 text-center">
            <Heart size={18} className="text-[#FF6B6B] mx-auto mb-1" />
            <p className="text-2xl font-bold text-[#1A1A1A]">HY 2</p>
            <p className="text-[10px] text-[#999] uppercase tracking-wide">Your Stage</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex bg-white rounded-[16px] p-1 mb-5 gap-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 py-2 rounded-[12px] text-xs font-bold transition-all ${
                tab === t.key ? "bg-[#7B68EE] text-white" : "text-[#6B6B6B]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Suggestions Tab */}
        {tab === "suggestions" && (
          <div className="space-y-4">
            <p className="text-sm text-[#6B6B6B]">Patients at similar Hoehn & Yahr stages matched to you</p>
            {suggestions.map((s) => (
              <div key={s.id} className="bg-white rounded-[24px] p-5">
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-12 h-12 rounded-full bg-[#DDD8F5] flex items-center justify-center flex-shrink-0">
                    <span className="text-lg font-bold text-[#7B68EE]">{s.name[0]}</span>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-base font-bold text-[#1A1A1A]">{s.name}</p>
                      <span className="text-xs bg-[#DDD8F5] text-[#7B68EE] font-bold px-2 py-0.5 rounded-full">HY {s.stage}</span>
                    </div>
                    <p className="text-xs text-[#999]">Diagnosed {s.diagYear} · {s.interests.join(", ")}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Star size={12} className="text-[#FF9F43]" fill="#FF9F43" />
                    <span className="text-xs font-bold text-[#FF9F43]">{Math.round(s.score * 100)}%</span>
                  </div>
                </div>
                <p className="text-sm text-[#6B6B6B] mb-4 leading-relaxed">{s.bio}</p>
                <button
                  onClick={() => setRequestSent(prev => [...prev, s.id])}
                  disabled={requestSent.includes(s.id)}
                  className={`w-full py-2.5 rounded-[14px] text-sm font-bold transition-all ${
                    requestSent.includes(s.id)
                      ? "bg-[#F0F0F0] text-[#B8B8B8]"
                      : "bg-[#7B68EE] text-white hover:bg-[#6A58DD]"
                  }`}
                >
                  {requestSent.includes(s.id) ? "Request Sent ✓" : "Connect"}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Connections Tab */}
        {tab === "connections" && (
          <div className="space-y-3">
            {connections.map((c) => (
              <div key={c.id} className="bg-white rounded-[24px] p-4 flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-[#C8E6DD] flex items-center justify-center flex-shrink-0">
                  <span className="text-lg font-bold text-[#5DBEA3]">{c.name[0]}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-[#1A1A1A]">{c.name}</p>
                    <span className="text-xs bg-[#C8E6DD] text-[#5DBEA3] font-bold px-2 py-0.5 rounded-full">HY {c.stage}</span>
                  </div>
                  <p className="text-xs text-[#999] truncate">{c.lastMessage}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <p className="text-[10px] text-[#B8B8B8]">{c.time}</p>
                  {c.unread > 0 && (
                    <div className="w-5 h-5 bg-[#7B68EE] rounded-full flex items-center justify-center">
                      <span className="text-[10px] font-bold text-white">{c.unread}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Groups Tab */}
        {tab === "groups" && (
          <div>
            <div className="bg-white rounded-[24px] p-4 mb-4 flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-[#DDD8F5] flex items-center justify-center flex-shrink-0">
                <Users size={20} className="text-[#7B68EE]" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-[#1A1A1A]">HY Stage 2 Group</p>
                <p className="text-xs text-[#999]">24 members · 8 active today</p>
              </div>
              <ChevronRight size={18} className="text-[#B8B8B8]" />
            </div>

            <div className="bg-white rounded-[24px] p-4 mb-4">
              <div className="space-y-4 mb-4 max-h-64 overflow-y-auto">
                {groupMessages.map((m, i) => (
                  <div key={i} className={`flex gap-2 ${m.author === "You" ? "flex-row-reverse" : ""}`}>
                    {m.author !== "You" && (
                      <div className="w-8 h-8 rounded-full bg-[#DDD8F5] flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-bold text-[#7B68EE]">{m.author[0]}</span>
                      </div>
                    )}
                    <div className={`max-w-[75%] ${m.author === "You" ? "items-end" : "items-start"} flex flex-col gap-0.5`}>
                      {m.author !== "You" && <p className="text-[10px] text-[#999] px-1">{m.author}</p>}
                      <div className={`px-3 py-2 rounded-[14px] text-sm ${m.author === "You" ? "bg-[#7B68EE] text-white" : "bg-[#F5F3FF] text-[#1A1A1A]"}`}>
                        {m.text}
                      </div>
                      <p className="text-[10px] text-[#B8B8B8] px-1">{m.time}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Message the group…"
                  className="flex-1 bg-[#F5F3FF] rounded-[12px] px-3 py-2 text-sm outline-none text-[#1A1A1A] placeholder:text-[#B8B8B8]"
                />
                <button
                  onClick={() => setMessage("")}
                  className="w-10 h-10 bg-[#7B68EE] rounded-[12px] flex items-center justify-center"
                >
                  <ChevronRight size={18} className="text-white" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Settings Tab */}
        {tab === "settings" && (
          <div className="space-y-4">
            <div className="bg-white rounded-[24px] p-5">
              <h3 className="text-base font-bold text-[#1A1A1A] mb-4">Your Network Profile</h3>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-14 h-14 rounded-full bg-[#DDD8F5] flex items-center justify-center">
                  <span className="text-2xl font-bold text-[#7B68EE]">Y</span>
                </div>
                <div>
                  <p className="text-base font-bold text-[#1A1A1A]">YourAlias_PD</p>
                  <p className="text-xs text-[#999]">HY Stage 2 · Diagnosed 2019</p>
                </div>
              </div>
              <div className="space-y-3">
                {[
                  { label: "Network Visibility", value: "Visible to others", on: true },
                  { label: "Connection Requests", value: "Accepting", on: true },
                  { label: "Group Messages", value: "Notifications on", on: true },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-[#1A1A1A]">{item.label}</p>
                      <p className="text-xs text-[#999]">{item.value}</p>
                    </div>
                    <div className={`w-12 h-6 rounded-full flex items-center px-1 transition-all ${item.on ? "bg-[#7B68EE]" : "bg-[#E0E0E0]"}`}>
                      <div className={`w-4 h-4 rounded-full bg-white transition-all ${item.on ? "translate-x-6" : "translate-x-0"}`} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-[24px] p-5">
              <div className="flex items-start gap-3">
                <Shield size={20} className="text-[#5DBEA3] flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-[#1A1A1A]">Community Guidelines</p>
                  <p className="text-xs text-[#6B6B6B] mt-1 leading-relaxed">
                    Be respectful, protect your privacy, and never share medical advice. This is a peer support space, not a medical consultation.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  );
};

export default PatientNetwork;
