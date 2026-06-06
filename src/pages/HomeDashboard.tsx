import { useNavigate } from "react-router-dom";
import { Mic, Smile, Bell, ChevronRight, RotateCcw, Hand, Moon, Users, Pill, PersonStanding, Zap } from "lucide-react";
import BottomNav from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { getFirstName } from "@/utils/userProfile";
import { useEffect, useState } from "react";

const HomeDashboard = () => {
  const navigate = useNavigate();
  const [userName, setUserName] = useState("");

  useEffect(() => {
    const name = getFirstName();
    setUserName(name || "Guest");
  }, []);

  const streakDays = 5;
  const streakPercent = (streakDays / 7) * 100;

  return (
    <div className="min-h-screen bg-[#EFEBE6] pb-24">
      <div className="max-w-md mx-auto px-5 pt-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-8 animate-fade-in">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-full bg-[#FFD4B8] flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="10" stroke="#FF8C42" strokeWidth="2"/>
                <path d="M12 8v4m0 4h.01" stroke="#FF8C42" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
            <span className="text-xl font-bold text-[#1A1A1A]">NeuroVoice</span>
          </div>
          <button className="w-10 h-10 rounded-full bg-white flex items-center justify-center hover:bg-gray-50 transition-colors">
            <Bell size={20} className="text-[#1A1A1A]" />
          </button>
        </div>

        {/* Greeting Section */}
        <div className="mb-7 animate-fade-in" style={{ animationDelay: "0.05s" }}>
          <h1 className="text-[32px] font-bold text-[#1A1A1A] leading-tight mb-2">
            Good morning, {userName}
          </h1>
          <p className="text-[#6B6B6B] text-base">Ready for your daily check-in?</p>
        </div>

        {/* Daily Wellness Card */}
        <div className="bg-white rounded-[24px] p-6 mb-7 animate-fade-in" style={{ animationDelay: "0.1s" }}>
          <div className="flex items-start gap-5 mb-5">
            <div className="relative w-[72px] h-[72px] flex-shrink-0">
              <svg viewBox="0 0 72 72" className="w-full h-full -rotate-90">
                <circle cx="36" cy="36" r="32" fill="none" stroke="#E8E8E8" strokeWidth="8" />
                <circle
                  cx="36" cy="36" r="32"
                  fill="none"
                  stroke="#FF8C42"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={`${streakPercent * 2.01} 201`}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-[#1A1A1A]">{streakDays}</span>
                <span className="text-[10px] font-medium text-[#999999] uppercase tracking-wide">DAYS</span>
              </div>
            </div>
            <div className="flex-1 pt-1">
              <h3 className="text-xl font-bold text-[#1A1A1A] mb-1.5">Daily Wellness</h3>
              <p className="text-sm text-[#6B6B6B] leading-relaxed">You're on a {streakDays}-day streak! Keep it up to reach your weekly goal.</p>
            </div>
          </div>
          <Button 
            onClick={() => navigate("/insights")}
            className="w-full rounded-full bg-[#FF8C42] hover:bg-[#FF7A2E] text-white font-semibold h-12 text-base transition-all hover:shadow-lg active:scale-[0.98]"
          >
            View Progress
          </Button>
        </div>

        {/* Exercises Section */}
        <div className="mb-6 animate-fade-in" style={{ animationDelay: "0.15s" }}>
          <h2 className="text-2xl font-bold text-[#1A1A1A] mb-4">Exercises</h2>
          
          <div className="flex flex-col gap-3">
            {/* Voice Check Card */}
            <button
              onClick={() => navigate("/voice-test")}
              className="bg-[#FFD4B8] rounded-[20px] p-5 flex items-center gap-4 hover:shadow-md transition-all active:scale-[0.98] group"
            >
              <div className="w-[60px] h-[60px] rounded-[18px] bg-[#FF8C42] flex items-center justify-center flex-shrink-0">
                <Mic size={28} className="text-white" strokeWidth={2.5} />
              </div>
              <div className="flex-1 text-left">
                <h3 className="text-lg font-bold text-[#1A1A1A] mb-1">Voice Check</h3>
                <p className="text-sm text-[#6B6B6B]">Quick 2-minute vocal stability exercise</p>
              </div>
              <ChevronRight size={22} className="text-[#FF8C42] group-hover:translate-x-0.5 transition-transform" strokeWidth={2.5} />
            </button>

            {/* Face Check Card */}
            <button
              onClick={() => navigate("/face-test")}
              className="bg-[#C8E6DD] rounded-[20px] p-5 flex items-center gap-4 hover:shadow-md transition-all active:scale-[0.98] group"
            >
              <div className="w-[60px] h-[60px] rounded-[18px] bg-[#5DBEA3] flex items-center justify-center flex-shrink-0">
                <Smile size={28} className="text-white" strokeWidth={2.5} />
              </div>
              <div className="flex-1 text-left">
                <h3 className="text-lg font-bold text-[#1A1A1A] mb-1">Face Check</h3>
                <p className="text-sm text-[#6B6B6B]">Daily mobility and expression check</p>
              </div>
              <ChevronRight size={22} className="text-[#5DBEA3] group-hover:translate-x-0.5 transition-transform" strokeWidth={2.5} />
            </button>

            {/* Finger Tap Card */}
            <button
              onClick={() => navigate("/finger-tap")}
              className="bg-[#DDD8F5] rounded-[20px] p-5 flex items-center gap-4 hover:shadow-md transition-all active:scale-[0.98] group"
            >
              <div className="w-[60px] h-[60px] rounded-[18px] bg-[#7B68EE] flex items-center justify-center flex-shrink-0">
                <Hand size={28} className="text-white" strokeWidth={2.5} />
              </div>
              <div className="flex-1 text-left">
                <h3 className="text-lg font-bold text-[#1A1A1A] mb-1">Finger Tap</h3>
                <p className="text-sm text-[#6B6B6B]">Motor coordination and rhythm test</p>
              </div>
              <ChevronRight size={22} className="text-[#7B68EE] group-hover:translate-x-0.5 transition-transform" strokeWidth={2.5} />
            </button>

            {/* Walking Test Card */}
            <button
              onClick={() => navigate("/walking-test")}
              className="bg-[#D4EAF5] rounded-[20px] p-5 flex items-center gap-4 hover:shadow-md transition-all active:scale-[0.98] group"
            >
              <div className="w-[60px] h-[60px] rounded-[18px] bg-[#3A9BD5] flex items-center justify-center flex-shrink-0">
                <PersonStanding size={28} className="text-white" strokeWidth={2.5} />
              </div>
              <div className="flex-1 text-left">
                <h3 className="text-lg font-bold text-[#1A1A1A] mb-1">Walking Test</h3>
                <p className="text-sm text-[#6B6B6B]">Gait & arm swing diagnostic (30s)</p>
              </div>
              <ChevronRight size={22} className="text-[#3A9BD5] group-hover:translate-x-0.5 transition-transform" strokeWidth={2.5} />
            </button>

            {/* LSVT BIG Card */}
            <button
              onClick={() => navigate("/lsvt-big")}
              className="bg-[#F5F0D4] rounded-[20px] p-5 flex items-center gap-4 hover:shadow-md transition-all active:scale-[0.98] group"
            >
              <div className="w-[60px] h-[60px] rounded-[18px] bg-[#C9A227] flex items-center justify-center flex-shrink-0">
                <Zap size={28} className="text-white" strokeWidth={2.5} />
              </div>
              <div className="flex-1 text-left">
                <h3 className="text-lg font-bold text-[#1A1A1A] mb-1">LSVT BIG</h3>
                <p className="text-sm text-[#6B6B6B]">Amplitude training — reach & extend (30s)</p>
              </div>
              <ChevronRight size={22} className="text-[#C9A227] group-hover:translate-x-0.5 transition-transform" strokeWidth={2.5} />
            </button>
          </div>
        </div>

        {/* New Features Section */}
        <div className="mb-6 animate-fade-in" style={{ animationDelay: "0.18s" }}>
          <h2 className="text-2xl font-bold text-[#1A1A1A] mb-4">Health Monitoring</h2>
          <div className="flex flex-col gap-3">
            <button
              onClick={() => navigate("/sleep-monitoring")}
              className="bg-[#DDD8F5] rounded-[20px] p-5 flex items-center gap-4 hover:shadow-md transition-all active:scale-[0.98] group"
            >
              <div className="w-[60px] h-[60px] rounded-[18px] bg-[#7B68EE] flex items-center justify-center flex-shrink-0">
                <Moon size={28} className="text-white" strokeWidth={2.5} />
              </div>
              <div className="flex-1 text-left">
                <h3 className="text-lg font-bold text-[#1A1A1A] mb-1">Sleep & Physiology</h3>
                <p className="text-sm text-[#6B6B6B]">Track sleep, RBD risk, and dystonia patterns</p>
              </div>
              <ChevronRight size={22} className="text-[#7B68EE] group-hover:translate-x-0.5 transition-transform" strokeWidth={2.5} />
            </button>

            <button
              onClick={() => navigate("/patient-network")}
              className="bg-[#C8E6DD] rounded-[20px] p-5 flex items-center gap-4 hover:shadow-md transition-all active:scale-[0.98] group"
            >
              <div className="w-[60px] h-[60px] rounded-[18px] bg-[#5DBEA3] flex items-center justify-center flex-shrink-0">
                <Users size={28} className="text-white" strokeWidth={2.5} />
              </div>
              <div className="flex-1 text-left">
                <h3 className="text-lg font-bold text-[#1A1A1A] mb-1">Support Network</h3>
                <p className="text-sm text-[#6B6B6B]">Connect with patients at your HY stage</p>
              </div>
              <ChevronRight size={22} className="text-[#5DBEA3] group-hover:translate-x-0.5 transition-transform" strokeWidth={2.5} />
            </button>

            <button
              onClick={() => navigate("/medication-tracking")}
              className="bg-[#FFD4B8] rounded-[20px] p-5 flex items-center gap-4 hover:shadow-md transition-all active:scale-[0.98] group"
            >
              <div className="w-[60px] h-[60px] rounded-[18px] bg-[#FF8C42] flex items-center justify-center flex-shrink-0">
                <Pill size={28} className="text-white" strokeWidth={2.5} />
              </div>
              <div className="flex-1 text-left">
                <h3 className="text-lg font-bold text-[#1A1A1A] mb-1">Medication Tracker</h3>
                <p className="text-sm text-[#6B6B6B]">Log doses, track efficacy, smart scheduling</p>
              </div>
              <ChevronRight size={22} className="text-[#FF8C42] group-hover:translate-x-0.5 transition-transform" strokeWidth={2.5} />
            </button>
          </div>
        </div>

        {/* Last Activity Card */}        <div className="bg-white rounded-[20px] p-4 flex items-center gap-3.5 animate-fade-in" style={{ animationDelay: "0.2s" }}>
          <div className="w-11 h-11 rounded-full bg-[#FFE8D6] flex items-center justify-center flex-shrink-0">
            <RotateCcw size={20} className="text-[#FF8C42]" strokeWidth={2.5} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-[#1A1A1A]">Last activity</p>
            <p className="text-sm text-[#999999]">Yesterday, 4:30 PM</p>
          </div>
          <button 
            onClick={() => navigate("/history")}
            className="text-sm font-bold text-[#FF8C42] hover:text-[#FF7A2E] transition-colors tracking-wide"
          >
            REVIEW
          </button>
        </div>
      </div>

      <BottomNav />
    </div>
  );
};

export default HomeDashboard;
