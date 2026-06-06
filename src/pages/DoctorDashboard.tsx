import { useNavigate } from "react-router-dom";
import { Bell, Users, AlertTriangle, TrendingUp, ChevronRight, BarChart3, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getFirstName } from "@/utils/userProfile";
import { useEffect, useState } from "react";

const DoctorDashboard = () => {
  const navigate = useNavigate();
  const [doctorName, setDoctorName] = useState("");

  useEffect(() => {
    const name = getFirstName();
    setDoctorName(name || "Doctor");
  }, []);

  // Mock data
  const patients = [
    { name: "Martha Stewart", age: 72, lastTest: "2h ago", risk: "HIGH", score: 8.4, color: "bg-red-100 border-red-300" },
    { name: "James Wilson", age: 65, lastTest: "Yesterday", risk: "MEDIUM", score: 5.2, color: "bg-yellow-100 border-yellow-300" },
    { name: "Elena Rodriguez", age: 48, lastTest: "3d ago", risk: "LOW", score: 1.8, color: "bg-green-100 border-green-300" }
  ];

  return (
    <div className="min-h-screen bg-[#EFEBE6] pb-24">
      <div className="max-w-md mx-auto px-5 pt-4">
        {/* Header */}
        <div className="bg-white rounded-[24px] p-5 mb-6 animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#4A90E2] to-[#357ABD] flex items-center justify-center">
                <span className="text-white text-lg font-bold">{doctorName.charAt(0)}</span>
              </div>
              <div>
                <h1 className="text-lg font-bold text-[#1A1A1A]">Doctor Dashboard</h1>
                <p className="text-sm text-[#6B6B6B]">Welcome back, Dr. {doctorName}</p>
              </div>
            </div>
            <button className="w-10 h-10 rounded-full bg-[#FFE8D6] flex items-center justify-center hover:bg-[#FFD4B8] transition-colors">
              <Bell size={20} className="text-[#FF8C42]" />
            </button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3 mb-6 animate-fade-in" style={{ animationDelay: "0.05s" }}>
          {/* Total Patients */}
          <div className="bg-white rounded-[20px] p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-[#6B6B6B]">Total Patients</p>
              <Users size={18} className="text-[#FF8C42]" />
            </div>
            <p className="text-2xl font-bold text-[#1A1A1A]">20</p>
            <p className="text-xs text-green-600 font-semibold">+2 this month</p>
          </div>

          {/* Active Screenings */}
          <div className="bg-white rounded-[20px] p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-[#6B6B6B]">Active Screenings</p>
              <TrendingUp size={18} className="text-[#4A90E2]" />
            </div>
            <p className="text-2xl font-bold text-[#1A1A1A]">8</p>
            <p className="text-xs text-green-600 font-semibold">+2 this week</p>
          </div>
        </div>

        {/* High Risk Alerts */}
        <div className="bg-red-50 border-2 border-red-200 rounded-[20px] p-4 mb-6 animate-fade-in" style={{ animationDelay: "0.1s" }}>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
              <AlertTriangle size={20} className="text-red-600" />
            </div>
            <div>
              <p className="text-lg font-bold text-red-900">HIGH RISK ALERTS</p>
              <p className="text-sm text-red-700">Requires attention</p>
            </div>
          </div>
          <p className="text-3xl font-bold text-red-900">3</p>
        </div>

        {/* Patient Risk Trend */}
        <div className="bg-white rounded-[24px] p-5 mb-6 animate-fade-in" style={{ animationDelay: "0.15s" }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-[#1A1A1A]">Patient Risk Trend</h2>
            <p className="text-xs text-[#999999]">Last 7 Days</p>
          </div>
          
          {/* Line Graph */}
          <div className="relative h-32 mb-3">
            {/* Grid lines */}
            <div className="absolute inset-0 flex flex-col justify-between">
              <div className="border-t border-gray-200"></div>
              <div className="border-t border-gray-200"></div>
              <div className="border-t border-gray-200"></div>
              <div className="border-t border-gray-200"></div>
            </div>
            
            {/* Line chart using SVG */}
            <svg className="absolute inset-0 w-full h-full" viewBox="0 0 280 128" preserveAspectRatio="none">
              {/* Area fill */}
              <defs>
                <linearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#4A90E2" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#4A90E2" stopOpacity="0.05" />
                </linearGradient>
              </defs>
              
              {/* Data points: [65, 58, 70, 55, 62, 68, 52] */}
              <path
                d="M 0 65 L 46.67 58 L 93.33 70 L 140 55 L 186.67 62 L 233.33 68 L 280 52"
                fill="none"
                stroke="#4A90E2"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              
              {/* Area under line */}
              <path
                d="M 0 65 L 46.67 58 L 93.33 70 L 140 55 L 186.67 62 L 233.33 68 L 280 52 L 280 128 L 0 128 Z"
                fill="url(#areaGradient)"
              />
              
              {/* Data point circles */}
              <circle cx="0" cy="65" r="4" fill="#4A90E2" />
              <circle cx="46.67" cy="58" r="4" fill="#4A90E2" />
              <circle cx="93.33" cy="70" r="4" fill="#4A90E2" />
              <circle cx="140" cy="55" r="4" fill="#4A90E2" />
              <circle cx="186.67" cy="62" r="4" fill="#4A90E2" />
              <circle cx="233.33" cy="68" r="4" fill="#4A90E2" />
              <circle cx="280" cy="52" r="5" fill="#FF8C42" stroke="#fff" strokeWidth="2" />
            </svg>
          </div>
          
          {/* X-axis labels */}
          <div className="flex justify-between text-xs text-[#999999] px-1">
            <span>MON</span>
            <span>TUE</span>
            <span>WED</span>
            <span>THU</span>
            <span>FRI</span>
            <span>SAT</span>
            <span className="font-bold text-[#FF8C42]">SUN</span>
          </div>
          
          {/* Legend */}
          <div className="flex items-center justify-center gap-4 mt-4 pt-4 border-t border-gray-100">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#4A90E2]"></div>
              <span className="text-xs text-[#6B6B6B]">Average Risk Score</span>
            </div>
          </div>
        </div>

        {/* Recent Patients */}
        <div className="mb-6 animate-fade-in" style={{ animationDelay: "0.2s" }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-[#1A1A1A]">Recent Patients</h2>
            <button className="text-sm font-bold text-[#FF8C42] hover:text-[#FF7A2E] transition-colors">
              View all
            </button>
          </div>

          <div className="flex flex-col gap-3">
            {patients.map((patient, index) => (
              <div
                key={index}
                className={`${patient.color} border-2 rounded-[20px] p-4 flex items-center gap-3`}
              >
                <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center flex-shrink-0">
                  <span className="text-lg font-bold text-[#1A1A1A]">
                    {patient.name.split(' ').map(n => n[0]).join('')}
                  </span>
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-[#1A1A1A]">{patient.name}</h3>
                  <p className="text-xs text-[#6B6B6B]">Age: {patient.age} • Last test: {patient.lastTest}</p>
                </div>
                <div className="text-right">
                  <p className={`text-xs font-bold mb-1 ${
                    patient.risk === 'HIGH' ? 'text-red-600' : 
                    patient.risk === 'MEDIUM' ? 'text-yellow-600' : 
                    'text-green-600'
                  }`}>
                    {patient.risk} RISK
                  </p>
                  <p className="text-sm font-bold text-[#1A1A1A]">Score: {patient.score}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Navigation */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-5 py-3">
          <div className="max-w-md mx-auto flex items-center justify-around">
            <button className="flex flex-col items-center gap-1 text-[#FF8C42]">
              <Users size={24} strokeWidth={2.5} />
              <span className="text-xs font-semibold">HOME</span>
            </button>
            <button className="flex flex-col items-center gap-1 text-[#999999] hover:text-[#FF8C42] transition-colors">
              <Users size={24} strokeWidth={2} />
              <span className="text-xs font-semibold">PATIENTS</span>
            </button>
            <button className="flex flex-col items-center gap-1 text-[#999999] hover:text-[#FF8C42] transition-colors">
              <BarChart3 size={24} strokeWidth={2} />
              <span className="text-xs font-semibold">REPORTS</span>
            </button>
            <button className="flex flex-col items-center gap-1 text-[#999999] hover:text-[#FF8C42] transition-colors">
              <Settings size={24} strokeWidth={2} />
              <span className="text-xs font-semibold">SETTINGS</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DoctorDashboard;
