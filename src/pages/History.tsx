import { useNavigate } from "react-router-dom";
import { Calendar, Mic, Smile, ChevronRight } from "lucide-react";
import BottomNav from "@/components/BottomNav";
import { useState, useEffect } from "react";
import { getTestsByType, formatTimestamp, TestRecord } from "@/utils/testHistory";

const History = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"voice" | "face">("voice");
  const [tests, setTests] = useState<TestRecord[]>([]);

  // Load tests from localStorage
  useEffect(() => {
    const loadTests = () => {
      const type = activeTab === "voice" ? "VOICE" : "FACE";
      const records = getTestsByType(type);
      setTests(records);
    };
    
    loadTests();
    
    // Refresh every 2 seconds to catch new tests
    const interval = setInterval(loadTests, 2000);
    return () => clearInterval(interval);
  }, [activeTab]);

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case "Low":
        return "text-[#5DBEA3] bg-[#D4F1E8]";
      case "Medium":
        return "text-[#FF9F43] bg-[#FFE8D6]";
      case "High":
        return "text-[#FF6B6B] bg-[#FFE0E0]";
      default:
        return "text-[#6B6B6B] bg-[#E0E0E0]";
    }
  };

  return (
    <div className="min-h-screen bg-[#EFEBE6] pb-24">
      <div className="max-w-md mx-auto px-5 pt-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-lg font-bold text-[#1A1A1A]">Test History</h1>
          <button className="p-1">
            <Calendar size={24} className="text-[#1A1A1A]" />
          </button>
        </div>

        {/* Test Type Toggle */}
        <div className="bg-white rounded-full p-1 flex gap-1 mb-6 shadow-sm">
          <button
            onClick={() => setActiveTab("voice")}
            className={`flex-1 py-2.5 rounded-full text-sm font-semibold transition-all ${
              activeTab === "voice"
                ? "bg-[#FF8C42] text-white"
                : "text-[#6B6B6B]"
            }`}
          >
            Voice Analysis
          </button>
          <button
            onClick={() => setActiveTab("face")}
            className={`flex-1 py-2.5 rounded-full text-sm font-semibold transition-all ${
              activeTab === "face"
                ? "bg-[#FF8C42] text-white"
                : "text-[#6B6B6B]"
            }`}
          >
            Face Scan
          </button>
        </div>

        {/* Recent Readings */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-[#1A1A1A]">Recent Readings</h2>
            <button className="text-sm font-bold text-[#FF8C42]">See all</button>
          </div>

          <div className="flex flex-col gap-3">
            {tests.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 text-center shadow-sm">
                <h3 className="text-lg font-bold text-[#1A1A1A] mb-2">No tests yet</h3>
                <p className="text-sm text-[#6B6B6B] mb-4">
                  Complete your first {activeTab === "voice" ? "voice" : "face"} test to see your history here.
                </p>
                <button
                  onClick={() => navigate(activeTab === "voice" ? "/voice-test" : "/face-test")}
                  className="bg-[#FF8C42] hover:bg-[#FF7A2E] text-white font-semibold px-6 py-2 rounded-full"
                >
                  Start Test
                </button>
              </div>
            ) : (
              tests.map((test, index) => {
                const Icon = test.type === "VOICE" ? Mic : Smile;
                const iconBg = test.type === "VOICE" ? "#FFE8D6" : "#E8E4FF";
                const iconColor = test.type === "VOICE" ? "#FF8C42" : "#7B68EE";
                const riskPercent = Math.round(test.riskScore * 100);
                
                return (
                  <button
                    key={test.id}
                    onClick={() => navigate(test.type === "VOICE" ? "/voice-test" : "/face-test")}
                    className="bg-white rounded-2xl p-4 flex items-center gap-4 shadow-sm hover:shadow-md transition-all active:scale-[0.98] animate-fade-in"
                    style={{ animationDelay: `${index * 0.05}s` }}
                  >
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: iconBg }}
                    >
                      <Icon size={24} style={{ color: iconColor }} strokeWidth={2.5} />
                    </div>
                    <div className="flex-1 text-left">
                      <h3 className="text-base font-bold text-[#1A1A1A] mb-0.5">{test.name}</h3>
                      <p className="text-sm text-[#999999]">{formatTimestamp(test.timestamp)}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${getRiskColor(test.riskLevel)}`}>
                        {test.riskLevel} Risk
                      </span>
                      <ChevronRight size={20} className="text-[#999999]" strokeWidth={2.5} />
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      <BottomNav />
    </div>
  );
};

export default History;
