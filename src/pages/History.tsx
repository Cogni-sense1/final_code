import { useNavigate } from "react-router-dom";
import { Calendar, ChevronRight } from "lucide-react";
import BottomNav from "@/components/BottomNav";
import { useState, useEffect } from "react";
import { getTestHistory, getTestsByType, formatTimestamp, TestRecord, TestType } from "@/utils/testHistory";
import { getTestTypeMeta } from "@/utils/testTypeMeta";

type Filter = "ALL" | TestType;

const FILTERS: { id: Filter; label: string }[] = [
  { id: "ALL", label: "All" },
  { id: "VOICE", label: "Voice" },
  { id: "FACE", label: "Face" },
  { id: "FINGER_TAP", label: "Finger Tap" },
  { id: "GAIT", label: "Walking" },
  { id: "DRAWING", label: "Drawing" },
  { id: "LSVT_BIG", label: "LSVT BIG" },
];

const History = () => {
  const navigate = useNavigate();
  const [activeFilter, setActiveFilter] = useState<Filter>("ALL");
  const [tests, setTests] = useState<TestRecord[]>([]);

  useEffect(() => {
    const loadTests = () => {
      setTests(activeFilter === "ALL" ? getTestHistory() : getTestsByType(activeFilter));
    };
    loadTests();
    const interval = setInterval(loadTests, 2000);
    return () => clearInterval(interval);
  }, [activeFilter]);

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case "Low": return "text-[#5DBEA3] bg-[#D4F1E8]";
      case "Medium": return "text-[#FF9F43] bg-[#FFE8D6]";
      case "High": return "text-[#FF6B6B] bg-[#FFE0E0]";
      default: return "text-[#6B6B6B] bg-[#E0E0E0]";
    }
  };

  return (
    <div className="min-h-screen bg-[#EFEBE6] pb-24">
      <div className="max-w-md mx-auto px-5 pt-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-lg font-bold text-[#1A1A1A]">Test History</h1>
          <button className="p-1 active:scale-90 transition-transform">
            <Calendar size={24} className="text-[#1A1A1A]" />
          </button>
        </div>

        {/* Filter chips (horizontally scrollable) */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: "none" }}>
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setActiveFilter(f.id)}
              className={`whitespace-nowrap px-4 py-2 rounded-full text-sm font-semibold transition-all active:scale-95 ${
                activeFilter === f.id ? "bg-[#FF8C42] text-white shadow-sm" : "bg-white text-[#6B6B6B]"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Recent Readings */}
        <div className="mb-6">
          <h2 className="text-xl font-bold text-[#1A1A1A] mb-4">Recent Readings</h2>

          <div className="flex flex-col gap-3">
            {tests.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 text-center shadow-sm animate-fade-in">
                <h3 className="text-lg font-bold text-[#1A1A1A] mb-2">No tests yet</h3>
                <p className="text-sm text-[#6B6B6B] mb-4">
                  Complete a test to see your history here.
                </p>
                <button
                  onClick={() => navigate("/home")}
                  className="bg-[#FF8C42] hover:bg-[#FF7A2E] text-white font-semibold px-6 py-2 rounded-full active:scale-95 transition-all"
                >
                  Browse Exercises
                </button>
              </div>
            ) : (
              tests.map((test, index) => {
                const meta = getTestTypeMeta(test.type);
                const Icon = meta.icon;
                return (
                  <button
                    key={test.id}
                    onClick={() => navigate(meta.route)}
                    className="bg-white rounded-2xl p-4 flex items-center gap-4 shadow-sm hover:shadow-md transition-all active:scale-[0.98] stagger-item"
                    style={{ ["--i" as string]: Math.min(index, 8) }}
                  >
                    <div className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: meta.iconBg }}>
                      <Icon size={24} style={{ color: meta.iconColor }} strokeWidth={2.5} />
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
