import { useNavigate } from "react-router-dom";
import { Menu, Bell, FileText, Phone, MessageSquare, Settings, Shield, HelpCircle, LogOut, ChevronRight, Stethoscope, Heart } from "lucide-react";
import BottomNav from "@/components/BottomNav";
import { getUserName, getUserInitials, clearUserName } from "@/utils/userProfile";
import { useEffect, useState } from "react";

const Profile = () => {
  const navigate = useNavigate();
  const [userName, setUserName] = useState("");
  const [userInitials, setUserInitials] = useState("");

  useEffect(() => {
    setUserName(getUserName() || "Guest User");
    setUserInitials(getUserInitials());
  }, []);

  const handleSignOut = () => {
    if (confirm("Are you sure you want to sign out? This will clear your profile data.")) {
      clearUserName();
      navigate("/", { replace: true });
    }
  };

  return (
    <div className="min-h-screen bg-[#EFEBE6] pb-24">
      <div className="max-w-md mx-auto px-5 pt-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <button className="p-1 -ml-1">
            <Menu size={24} className="text-[#1A1A1A]" />
          </button>
          <h1 className="text-lg font-bold text-[#1A1A1A]">NeuroVoice</h1>
          <button className="p-1">
            <Bell size={24} className="text-[#1A1A1A]" />
          </button>
        </div>

        {/* Profile Card */}
        <div className="flex flex-col items-center mb-6 animate-fade-in">
          <div className="w-32 h-32 rounded-full bg-gradient-to-br from-[#FF8C42] to-[#FF6B9D] flex items-center justify-center mb-4 shadow-lg">
            <span className="text-5xl font-bold text-white">{userInitials}</span>
          </div>
          <h2 className="text-2xl font-bold text-[#1A1A1A] mb-1">{userName}</h2>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-[#FF8C42] font-semibold">Age: 68</span>
            <span className="text-[#6B6B6B]">Member since 2023</span>
          </div>
        </div>

        {/* Medical Reports Card */}
        <div className="bg-white rounded-3xl p-5 mb-5 shadow-sm animate-fade-in" style={{ animationDelay: "0.1s" }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-[#1A1A1A]">Medical Reports</h3>
            <FileText size={20} className="text-[#FF8C42]" />
          </div>
          
          <div className="bg-[#FFF4E6] rounded-2xl p-4 mb-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-[#FFE8D6] rounded-xl flex items-center justify-center flex-shrink-0">
                <FileText size={20} className="text-[#FF8C42]" />
              </div>
              <div className="flex-1">
                <h4 className="text-base font-bold text-[#1A1A1A] mb-1">Latest Screening Result</h4>
                <p className="text-sm text-[#6B6B6B]">January 15, 2024 • Stable</p>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <button className="flex-1 bg-[#FF8C42] hover:bg-[#FF7A2E] text-white font-bold text-sm rounded-full py-3 flex items-center justify-center gap-2 active:scale-[0.98] transition-all">
              <FileText size={16} />
              View All
            </button>
            <button className="flex-1 bg-[#FFE8D6] hover:bg-[#FFD4B8] text-[#FF8C42] font-bold text-sm rounded-full py-3 flex items-center justify-center gap-2 active:scale-[0.98] transition-all">
              <FileText size={16} />
              Export PDF
            </button>
          </div>
        </div>

        {/* Assigned Specialist Card */}
        <div className="bg-white rounded-3xl p-5 mb-5 shadow-sm animate-fade-in" style={{ animationDelay: "0.15s" }}>
          <div className="flex items-center gap-4 mb-4">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#7B68EE] to-[#9B88FF] flex items-center justify-center shadow-md">
              <span className="text-xl font-bold text-white">DA</span>
            </div>
            <div className="flex-1">
              <p className="text-xs text-[#999999] uppercase tracking-wider mb-1">Assigned Specialist</p>
              <h4 className="text-base font-bold text-[#1A1A1A]">Dr. Aris</h4>
            </div>
            <div className="bg-[#E8E4FF] text-[#7B68EE] px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide">
              Neurologist
            </div>
          </div>

          <div className="flex gap-3">
            <button className="flex-1 bg-[#7B68EE] hover:bg-[#6B58DE] text-white font-bold text-sm rounded-full py-3 flex items-center justify-center gap-2 active:scale-[0.98] transition-all">
              <Phone size={16} />
              Call
            </button>
            <button className="flex-1 bg-[#E8E4FF] hover:bg-[#D8D4FF] text-[#7B68EE] font-bold text-sm rounded-full py-3 flex items-center justify-center gap-2 active:scale-[0.98] transition-all">
              <MessageSquare size={16} />
              Message
            </button>
          </div>
        </div>

        {/* Settings Menu */}
        <div className="bg-white rounded-3xl overflow-hidden shadow-sm mb-5 animate-fade-in" style={{ animationDelay: "0.2s" }}>
          <button className="w-full flex items-center gap-4 px-5 py-4 border-b border-[#F0F0F0] hover:bg-[#FAFAFA] transition-colors active:scale-[0.99]">
            <div className="w-10 h-10 bg-[#E8F5F1] rounded-xl flex items-center justify-center">
              <Settings size={20} className="text-[#5DBEA3]" />
            </div>
            <span className="text-base font-semibold text-[#1A1A1A] flex-1 text-left">Account Settings</span>
            <ChevronRight size={20} className="text-[#B8B8B8]" />
          </button>

          <button className="w-full flex items-center gap-4 px-5 py-4 border-b border-[#F0F0F0] hover:bg-[#FAFAFA] transition-colors active:scale-[0.99]">
            <div className="w-10 h-10 bg-[#FFE8D6] rounded-xl flex items-center justify-center">
              <Shield size={20} className="text-[#FF8C42]" />
            </div>
            <span className="text-base font-semibold text-[#1A1A1A] flex-1 text-left">Privacy & Security</span>
            <ChevronRight size={20} className="text-[#B8B8B8]" />
          </button>

          <button className="w-full flex items-center gap-4 px-5 py-4 hover:bg-[#FAFAFA] transition-colors active:scale-[0.99]">
            <div className="w-10 h-10 bg-[#E8E4FF] rounded-xl flex items-center justify-center">
              <HelpCircle size={20} className="text-[#7B68EE]" />
            </div>
            <span className="text-base font-semibold text-[#1A1A1A] flex-1 text-left">Help & Support</span>
            <ChevronRight size={20} className="text-[#B8B8B8]" />
          </button>
        </div>

        {/* Testing Dashboards Section */}
        <div className="bg-gradient-to-br from-purple-50 to-blue-50 border-2 border-purple-200 rounded-3xl p-5 mb-5 animate-fade-in" style={{ animationDelay: "0.23s" }}>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 bg-purple-200 rounded-full flex items-center justify-center">
              <span className="text-sm">🧪</span>
            </div>
            <h3 className="text-base font-bold text-purple-900">Testing Dashboards</h3>
          </div>
          <p className="text-xs text-purple-700 mb-4">Quick access to preview other dashboard views</p>
          
          <div className="flex gap-3">
            <button 
              onClick={() => window.open("/doctor", "_blank")}
              className="flex-1 bg-gradient-to-br from-[#4A90E2] to-[#357ABD] hover:from-[#357ABD] hover:to-[#2A6AA0] text-white font-bold text-sm rounded-2xl py-3 flex items-center justify-center gap-2 active:scale-[0.98] transition-all shadow-md"
            >
              <Stethoscope size={18} />
              Doctor View
            </button>
            <button 
              onClick={() => window.open("/caregiver", "_blank")}
              className="flex-1 bg-gradient-to-br from-[#5DBEA3] to-[#4A9B85] hover:from-[#4A9B85] hover:to-[#3A8B75] text-white font-bold text-sm rounded-2xl py-3 flex items-center justify-center gap-2 active:scale-[0.98] transition-all shadow-md"
            >
              <Heart size={18} />
              Caregiver View
            </button>
          </div>
        </div>

        {/* Sign Out Button */}
        <button 
          onClick={handleSignOut}
          className="w-full bg-[#FFE0E0] hover:bg-[#FFD0D0] rounded-3xl py-4 flex items-center justify-center gap-2 text-[#FF6B6B] font-bold text-base active:scale-[0.98] transition-all animate-fade-in" 
          style={{ animationDelay: "0.25s" }}
        >
          <LogOut size={20} />
          Sign Out
        </button>
      </div>

      <BottomNav />
    </div>
  );
};

export default Profile;
