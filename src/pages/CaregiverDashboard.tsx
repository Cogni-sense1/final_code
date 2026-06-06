import { useNavigate } from "react-router-dom";
import { Bell, Heart, TrendingDown, Calendar, Phone, FileText, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getFirstName } from "@/utils/userProfile";
import { useEffect, useState } from "react";

const CaregiverDashboard = () => {
  const navigate = useNavigate();
  const [caregiverName, setCaregiverName] = useState("");

  useEffect(() => {
    const name = getFirstName();
    setCaregiverName(name || "Caregiver");
  }, []);

  // Mock patient data (family member)
  const patientName = "Arthur Morgan";
  const patientId = "#88992-08";
  const patientAge = 68;

  return (
    <div className="min-h-screen bg-[#EFEBE6] pb-24">
      <div className="max-w-md mx-auto px-5 pt-4">
        {/* Header */}
        <div className="bg-white rounded-[24px] p-5 mb-6 animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#5DBEA3] to-[#4A9B85] flex items-center justify-center">
                <Heart className="text-white" size={24} />
              </div>
              <div>
                <h1 className="text-lg font-bold text-[#1A1A1A]">Caregiver Dashboard</h1>
                <p className="text-sm text-[#6B6B6B]">Welcome, {caregiverName}</p>
              </div>
            </div>
            <button className="w-10 h-10 rounded-full bg-[#C8E6DD] flex items-center justify-center hover:bg-[#B8D6CD] transition-colors">
              <Bell size={20} className="text-[#5DBEA3]" />
            </button>
          </div>
        </div>

        {/* Patient Info Card */}
        <div className="bg-white rounded-[24px] p-5 mb-6 animate-fade-in" style={{ animationDelay: "0.05s" }}>
          <div className="flex items-center gap-4 mb-4">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#4A90E2] to-[#357ABD] flex items-center justify-center">
              <span className="text-white text-2xl font-bold">AM</span>
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-bold text-[#1A1A1A]">{patientName}</h2>
              <p className="text-sm text-[#6B6B6B]">Patient ID: {patientId}</p>
              <p className="text-sm text-[#6B6B6B]">{patientAge} Years</p>
            </div>
            <div className="w-3 h-3 rounded-full bg-green-500"></div>
          </div>
          <div className="bg-[#C8E6DD] rounded-2xl px-4 py-2 inline-block">
            <p className="text-sm font-semibold text-[#5DBEA3]">Active Monitoring</p>
          </div>
        </div>

        {/* Risk Score Card */}
        <div className="bg-gradient-to-br from-green-50 to-green-100 border-2 border-green-200 rounded-[24px] p-5 mb-6 animate-fade-in" style={{ animationDelay: "0.1s" }}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-semibold text-green-800 mb-1">AVERAGE RISK SCORE</p>
              <h3 className="text-3xl font-bold text-green-900">Low Risk</h3>
            </div>
            <div className="w-12 h-12 rounded-full bg-green-200 flex items-center justify-center">
              <TrendingDown size={24} className="text-green-700" />
            </div>
          </div>
          <p className="text-sm text-green-700 flex items-center gap-1">
            <TrendingDown size={16} />
            -5.2% from last week
          </p>
        </div>

        {/* 7-Day Risk Trend */}
        <div className="bg-white rounded-[24px] p-5 mb-6 animate-fade-in" style={{ animationDelay: "0.15s" }}>
          <h3 className="text-lg font-bold text-[#1A1A1A] mb-4">7-Day Risk Trend</h3>
          
          {/* Simple Bar Chart */}
          <div className="flex items-end justify-between h-32 mb-3">
            {[40, 45, 60, 35, 38, 32, 55].map((height, index) => (
              <div
                key={index}
                className={`flex-1 mx-1 rounded-t-lg transition-all ${
                  index === 6 ? 'bg-[#FF8C42]' : 'bg-[#E0E0E0]'
                }`}
                style={{ height: `${height}%` }}
              ></div>
            ))}
          </div>
          
          <div className="flex justify-between text-xs text-[#999999]">
            <span>MON</span>
            <span>TUE</span>
            <span>WED</span>
            <span>THU</span>
            <span>FRI</span>
            <span>SAT</span>
            <span className="font-bold text-[#FF8C42]">TODAY</span>
          </div>
        </div>

        {/* Latest Analysis */}
        <div className="bg-white rounded-[24px] p-5 mb-6 animate-fade-in" style={{ animationDelay: "0.2s" }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-[#1A1A1A]">Latest Analysis</h3>
            <p className="text-xs text-[#999999]">Updated 24m ago</p>
          </div>

          <div className="space-y-3">
            {/* Voice Stability */}
            <div className="flex items-center gap-3 p-3 bg-[#F5F5F5] rounded-2xl">
              <div className="w-10 h-10 rounded-full bg-[#FFD4B8] flex items-center justify-center">
                <Activity size={20} className="text-[#FF8C42]" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-[#1A1A1A]">Voice Stability</p>
                <p className="text-xs text-[#6B6B6B]">Tremor level: Minimal</p>
              </div>
              <p className="text-lg font-bold text-[#5DBEA3]">92%</p>
            </div>

            {/* Facial Symmetry */}
            <div className="flex items-center gap-3 p-3 bg-[#F5F5F5] rounded-2xl">
              <div className="w-10 h-10 rounded-full bg-[#C8E6DD] flex items-center justify-center">
                <span className="text-xl">😊</span>
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-[#1A1A1A]">Facial Symmetry</p>
                <p className="text-xs text-[#6B6B6B]">Micro-expressions: Normal</p>
              </div>
              <p className="text-lg font-bold text-[#5DBEA3]">96%</p>
            </div>
          </div>
        </div>

        {/* Daily Logs */}
        <div className="bg-white rounded-[24px] p-5 mb-6 animate-fade-in" style={{ animationDelay: "0.25s" }}>
          <h3 className="text-lg font-bold text-[#1A1A1A] mb-4">Daily Logs</h3>

          <div className="space-y-3">
            {/* Medication */}
            <div className="flex items-center gap-3 p-3 bg-[#F5F5F5] rounded-2xl">
              <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                <span className="text-xl">💊</span>
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-[#1A1A1A]">Medication</p>
                <p className="text-xs text-[#6B6B6B]">Levodopa - Morning Dose</p>
              </div>
              <span className="text-xs font-bold text-green-600 bg-green-100 px-3 py-1 rounded-full">TAKEN</span>
            </div>

            {/* Sleep Quality */}
            <button className="w-full flex items-center gap-3 p-3 bg-[#F5F5F5] rounded-2xl hover:bg-[#EBEBEB] transition-colors">
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                <span className="text-xl">😴</span>
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-bold text-[#1A1A1A]">Sleep Quality</p>
                <p className="text-xs text-[#6B6B6B]">7h 42m • Deep Sleep: 2h</p>
              </div>
              <span className="text-[#999999]">›</span>
            </button>

            {/* Morning Mood */}
            <button className="w-full flex items-center gap-3 p-3 bg-[#F5F5F5] rounded-2xl hover:bg-[#EBEBEB] transition-colors">
              <div className="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center">
                <span className="text-xl">😊</span>
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-bold text-[#1A1A1A]">Morning Mood</p>
                <p className="text-xs text-[#6B6B6B]">"Feeling energetic and clear"</p>
              </div>
              <span className="text-[#999999]">›</span>
            </button>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-3 mb-6 animate-fade-in" style={{ animationDelay: "0.3s" }}>
          <Button className="bg-[#4A90E2] hover:bg-[#357ABD] text-white rounded-2xl h-14 flex items-center gap-2">
            <Phone size={20} />
            Contact Doctor
          </Button>
          <Button className="bg-white hover:bg-gray-50 text-[#1A1A1A] border-2 border-gray-200 rounded-2xl h-14 flex items-center gap-2">
            <FileText size={20} />
            Export Log
          </Button>
        </div>

        {/* Bottom Navigation */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-5 py-3">
          <div className="max-w-md mx-auto flex items-center justify-around">
            <button className="flex flex-col items-center gap-1 text-[#5DBEA3]">
              <Heart size={24} strokeWidth={2.5} />
              <span className="text-xs font-semibold">HOME</span>
            </button>
            <button className="flex flex-col items-center gap-1 text-[#999999] hover:text-[#5DBEA3] transition-colors">
              <Calendar size={24} strokeWidth={2} />
              <span className="text-xs font-semibold">SCHEDULE</span>
            </button>
            <button className="flex flex-col items-center gap-1 text-[#999999] hover:text-[#5DBEA3] transition-colors">
              <Activity size={24} strokeWidth={2} />
              <span className="text-xs font-semibold">ACTIVITY</span>
            </button>
            <button className="flex flex-col items-center gap-1 text-[#999999] hover:text-[#5DBEA3] transition-colors">
              <FileText size={24} strokeWidth={2} />
              <span className="text-xs font-semibold">REPORTS</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CaregiverDashboard;
