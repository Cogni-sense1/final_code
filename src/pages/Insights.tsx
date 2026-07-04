import { useNavigate } from "react-router-dom";
import { Calendar, Mic, Smile, Hand, Sparkles } from "lucide-react";
import BottomNav from "@/components/BottomNav";
import { useState, useEffect } from "react";
import { getRecentTests, getDailyAggregatedData, getTestsForDays, formatTimestamp } from "@/utils/testHistory";
import { calculateOverallRisk, type OverallRisk } from "@/utils/overallRisk";
import type { Modality } from "@/constants/risk";

// Presentation metadata for each fusion modality (label, icon, colors).
const MODALITY_META: Record<Modality, { label: string; icon: typeof Mic; color: string; bg: string }> = {
  voice: { label: "Voice", icon: Mic, color: "#FF8C42", bg: "#FFE8D6" },
  face: { label: "Face", icon: Smile, color: "#7B68EE", bg: "#E8E4FF" },
  fingerTap: { label: "Finger-tap", icon: Hand, color: "#5DBEA3", bg: "#D4F1E8" },
};

const Insights = () => {
  const navigate = useNavigate();
  const [recentTests, setRecentTests] = useState(getRecentTests(3));
  const [chartData, setChartData] = useState(getDailyAggregatedData(7));
  const [overallRisk, setOverallRisk] = useState<OverallRisk>(() =>
    calculateOverallRisk(getTestsForDays(7))
  );

  // Refresh data periodically
  useEffect(() => {
    const loadData = () => {
      setRecentTests(getRecentTests(3));
      setChartData(getDailyAggregatedData(7));
      setOverallRisk(calculateOverallRisk(getTestsForDays(7)));
    };

    loadData();
    const interval = setInterval(loadData, 2000);
    return () => clearInterval(interval);
  }, []);

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

  // Calculate SVG path for smooth curve
  const maxValue = Math.max(...chartData.map(d => d.avgRisk * 100), 10); // Minimum 10 for scale
  const chartHeight = 120;
  const chartWidth = 320;
  const pointSpacing = chartWidth / (chartData.length - 1);

  const points = chartData.map((d, i) => ({
    x: i * pointSpacing,
    y: chartHeight - ((d.avgRisk * 100) / maxValue) * chartHeight,
    value: d.avgRisk * 100,
  }));

  // Create smooth curve using quadratic bezier curves
  let pathD = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const xMid = (points[i].x + points[i + 1].x) / 2;
    const yMid = (points[i].y + points[i + 1].y) / 2;
    const cpX1 = (xMid + points[i].x) / 2;
    const cpY1 = points[i].y;
    const cpX2 = (xMid + points[i + 1].x) / 2;
    const cpY2 = points[i + 1].y;
    pathD += ` Q ${cpX1} ${cpY1}, ${xMid} ${yMid}`;
    pathD += ` Q ${cpX2} ${cpY2}, ${points[i + 1].x} ${points[i + 1].y}`;
  }

  // Fused overall risk over the 7-day window (multimodal fusion — see
  // src/utils/overallRisk.ts). Replaces the old flat average, which was biased
  // by whichever modality was tested most often.
  const avgRiskPercent = Math.round(overallRisk.overallScore * 100);
  const avgRiskLevel = overallRisk.riskLevel;
  const avgRiskColor = avgRiskLevel === 'Low' ? '#5DBEA3' : avgRiskLevel === 'Medium' ? '#FF9F43' : '#FF6B6B';
  const avgRiskBg = avgRiskLevel === 'Low' ? '#D4F1E8' : avgRiskLevel === 'Medium' ? '#FFE8D6' : '#FFE0E0';

  // Modalities that actually contributed to the fused score, for the breakdown UI.
  const contributingModalities = (Object.keys(MODALITY_META) as Modality[]).filter(
    (m) => overallRisk.breakdown[m].count > 0
  );

  // Calculate trend (compare last 3 days vs previous 4 days)
  const recentAvg = chartData.slice(-3).reduce((sum, d) => sum + d.avgRisk, 0) / 3;
  const previousAvg = chartData.slice(0, 4).reduce((sum, d) => sum + d.avgRisk, 0) / 4;
  const trendPercent = previousAvg > 0 ? ((recentAvg - previousAvg) / previousAvg) * 100 : 0;
  const trendDirection = trendPercent < 0 ? '↓' : '↑';
  const trendColor = trendPercent < 0 ? '#5DBEA3' : '#FF6B6B';

  return (
    <div className="min-h-screen bg-[#EFEBE6] pb-24">
      <div className="max-w-md mx-auto px-5 pt-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-lg font-bold text-[#1A1A1A]">Insights</h1>
          <button className="p-1">
            <Calendar size={24} className="text-[#1A1A1A]" />
          </button>
        </div>

        {/* Risk Score Trend Card */}
        <div className="bg-white rounded-3xl p-6 mb-6 shadow-sm animate-fade-in">
          <h2 className="text-xl font-bold text-[#1A1A1A] mb-1">Risk Score Trend</h2>
          <p className="text-sm text-[#6B6B6B] mb-6">Your neurological markers over time</p>

          {/* Average Risk Display */}
          <div className="flex items-start justify-between mb-6">
            <div>
              <p className="text-xs text-[#B8B8B8] uppercase tracking-wider mb-1">OVERALL RISK (7D)</p>
              <div className="flex items-baseline gap-2">
                <span className="text-5xl font-bold text-[#1A1A1A]">{avgRiskPercent}%</span>
                <span 
                  className="text-sm font-bold px-2 py-1 rounded"
                  style={{ backgroundColor: avgRiskBg, color: avgRiskColor }}
                >
                  {avgRiskLevel}
                </span>
              </div>
            </div>
            {chartData.some(d => d.count > 0) && (
              <div 
                className="px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1"
                style={{ backgroundColor: trendColor === '#5DBEA3' ? '#D4F1E8' : '#FFE0E0', color: trendColor }}
              >
                <span>{trendDirection}</span>
                <span>{Math.abs(trendPercent).toFixed(1)}%</span>
              </div>
            )}
          </div>

          {/* Chart */}
          {chartData.some(d => d.count > 0) ? (
            <div className="relative">
              <svg width="100%" height="140" viewBox={`0 0 ${chartWidth} 140`} className="overflow-visible">
                {/* Smooth line */}
                <path
                  d={pathD}
                  fill="none"
                  stroke="#FF8C42"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {/* Data points */}
                {points.map((point, i) => (
                  chartData[i].count > 0 && (
                    <circle
                      key={i}
                      cx={point.x}
                      cy={point.y}
                      r="5"
                      fill="#FF8C42"
                      stroke="white"
                      strokeWidth="2"
                    />
                  )
                ))}
                {/* Gradient fill under curve */}
                <defs>
                  <linearGradient id="chartGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#FF8C42" stopOpacity="0.1" />
                    <stop offset="100%" stopColor="#FF8C42" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path
                  d={`${pathD} L ${chartWidth} ${chartHeight} L 0 ${chartHeight} Z`}
                  fill="url(#chartGradient)"
                />
              </svg>

              {/* X-axis labels */}
              <div className="flex justify-between mt-2">
                {chartData.map((d, i) => (
                  <span 
                    key={i} 
                    className={`text-[10px] uppercase tracking-wider font-medium ${
                      d.count > 0 ? 'text-[#FF8C42]' : 'text-[#B8B8B8]'
                    }`}
                  >
                    {d.day}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-[#6B6B6B] text-sm">Complete tests to see your trend chart</p>
            </div>
          )}
        </div>

        {/* Risk Breakdown Card — how each modality fed into the overall score */}
        {contributingModalities.length > 0 && (
          <div className="bg-white rounded-3xl p-6 mb-6 shadow-sm animate-fade-in" style={{ animationDelay: "0.05s" }}>
            <h2 className="text-xl font-bold text-[#1A1A1A] mb-1">Risk Breakdown</h2>
            <p className="text-sm text-[#6B6B6B] mb-5">
              How each test type contributed to your overall score
            </p>

            <div className="flex flex-col gap-4">
              {contributingModalities.map((m) => {
                const meta = MODALITY_META[m];
                const detail = overallRisk.breakdown[m];
                const Icon = meta.icon;
                const avgPercent = Math.round((detail.average ?? 0) * 100);
                return (
                  <div key={m}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: meta.bg }}
                        >
                          <Icon size={15} style={{ color: meta.color }} strokeWidth={2.5} />
                        </div>
                        <span className="text-sm font-bold text-[#1A1A1A]">{meta.label}</span>
                        <span className="text-xs text-[#999999]">
                          {detail.count} {detail.count === 1 ? 'test' : 'tests'} · avg {avgPercent}%
                        </span>
                      </div>
                      <span className="text-sm font-bold" style={{ color: meta.color }}>
                        {detail.contribution}%
                      </span>
                    </div>
                    {/* Contribution bar */}
                    <div className="h-2 w-full rounded-full bg-[#F0EDE8] overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${detail.contribution}%`, backgroundColor: meta.color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <p className="text-xs text-[#999999] mt-5 leading-relaxed">
              Voice is weighted highest (model-backed); face and finger-tap are rule-based and weighted lower.
              Weights renormalize across whichever tests you've taken.
            </p>
          </div>
        )}

        {/* Recent Tests */}
        <div className="mb-6 animate-fade-in" style={{ animationDelay: "0.1s" }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-[#1A1A1A]">Recent Tests</h2>
            <button onClick={() => navigate("/history")} className="text-sm font-bold text-[#FF8C42]">See All</button>
          </div>

          {recentTests.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center shadow-sm">
              <h3 className="text-lg font-bold text-[#1A1A1A] mb-2">No tests yet</h3>
              <p className="text-sm text-[#6B6B6B] mb-4">
                Complete your first test to start tracking your neurological health.
              </p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => navigate("/voice-test")}
                  className="bg-[#FF8C42] hover:bg-[#FF7A2E] text-white font-semibold px-4 py-2 rounded-full text-sm"
                >
                  Voice Test
                </button>
                <button
                  onClick={() => navigate("/face-test")}
                  className="bg-[#7B68EE] hover:bg-[#6B58DE] text-white font-semibold px-4 py-2 rounded-full text-sm"
                >
                  Face Test
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {recentTests.map((test, index) => {
                const Icon = test.type === 'VOICE' ? Mic : Smile;
                const iconBg = test.riskLevel === 'Low' ? '#D4F1E8' : test.riskLevel === 'Medium' ? '#FFE8D6' : '#FFE0E0';
                const iconColor = test.riskLevel === 'Low' ? '#5DBEA3' : test.riskLevel === 'Medium' ? '#FF9F43' : '#FF6B6B';
                const riskPercent = Math.round(test.riskScore * 100);
                
                return (
                  <div
                    key={test.id}
                    className="bg-white rounded-2xl p-4 flex items-center gap-4 shadow-sm"
                    style={{ animationDelay: `${0.15 + index * 0.05}s` }}
                  >
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: iconBg }}
                    >
                      <Icon size={24} style={{ color: iconColor }} strokeWidth={2.5} />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-base font-bold text-[#1A1A1A] mb-0.5">{test.name}</h3>
                      <p className="text-sm text-[#999999]">{formatTimestamp(test.timestamp)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold text-[#1A1A1A] mb-0.5">{riskPercent}%</p>
                      <span className={`text-xs font-bold ${getRiskColor(test.riskLevel)} px-2 py-0.5 rounded`}>
                        {test.riskLevel.toUpperCase()} RISK
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Pro Insight Card */}
        <div className="bg-gradient-to-br from-[#FFE8F5] to-[#FFE8D6] rounded-3xl p-5 flex gap-4 animate-fade-in" style={{ animationDelay: "0.2s" }}>
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#FF8C42] to-[#FF6B9D] flex items-center justify-center flex-shrink-0">
            <Sparkles size={24} className="text-white" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-bold text-[#1A1A1A] mb-1">Pro Insight</h3>
            <p className="text-sm text-[#6B6B6B] leading-relaxed">
              Consistency in morning tests provides the most accurate trend data for voice stability tracking.
            </p>
          </div>
        </div>
      </div>

      <BottomNav />
    </div>
  );
};

export default Insights;
