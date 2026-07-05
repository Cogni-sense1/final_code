import { useNavigate } from "react-router-dom";
import { Calendar, Sparkles } from "lucide-react";
import BottomNav from "@/components/BottomNav";
import { useState, useEffect } from "react";
import { getRecentTests, getDailyAggregatedData, getAverageRisk, formatTimestamp } from "@/utils/testHistory";
import { computeCombinedRiskFromHistory, MODALITY_LABELS, CombinedResult } from "@/utils/combinedRisk";
import { getTestTypeMeta } from "@/utils/testTypeMeta";

const Insights = () => {
  const navigate = useNavigate();
  const [recentTests, setRecentTests] = useState(getRecentTests(3));
  const [chartData, setChartData] = useState(getDailyAggregatedData(7));
  const [avgRisk, setAvgRisk] = useState(getAverageRisk(7));
  const [combined, setCombined] = useState<CombinedResult>(() => computeCombinedRiskFromHistory());

  // Refresh data periodically
  useEffect(() => {
    const loadData = () => {
      setRecentTests(getRecentTests(3));
      setChartData(getDailyAggregatedData(7));
      setAvgRisk(getAverageRisk(7));
      setCombined(computeCombinedRiskFromHistory());
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

  // Calculate average risk percentage and level
  const avgRiskPercent = Math.round(avgRisk * 100);
  const avgRiskLevel = avgRiskPercent < 33 ? 'Low' : avgRiskPercent < 66 ? 'Medium' : 'High';
  const avgRiskColor = avgRiskLevel === 'Low' ? '#5DBEA3' : avgRiskLevel === 'Medium' ? '#FF9F43' : '#FF6B6B';
  const avgRiskBg = avgRiskLevel === 'Low' ? '#D4F1E8' : avgRiskLevel === 'Medium' ? '#FFE8D6' : '#FFE0E0';

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

        {/* Combined Screening Score Card */}
        {(() => {
          const cbColor = combined.level === 'Low' ? '#5DBEA3' : combined.level === 'Medium' ? '#FF9F43' : '#FF6B6B';
          const cbBg = combined.level === 'Low' ? '#D4F1E8' : combined.level === 'Medium' ? '#FFE8D6' : '#FFE0E0';
          return (
            <div className="bg-white rounded-3xl p-6 mb-6 shadow-sm animate-fade-in">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-xl font-bold text-[#1A1A1A]">Combined Screening Score</h2>
              </div>
              <p className="text-sm text-[#6B6B6B] mb-5">Weighted fusion of your latest exercises</p>

              {combined.modalitiesUsed === 0 ? (
                <div className="text-center py-8">
                  <p className="text-[#6B6B6B] text-sm">Complete some exercises to get a combined prediction.</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-5 mb-5">
                    <div className="relative w-24 h-24 flex-shrink-0">
                      <svg viewBox="0 0 96 96" className="w-full h-full -rotate-90">
                        <circle cx="48" cy="48" r="40" fill="none" stroke="#F0F0F0" strokeWidth="10" />
                        <circle cx="48" cy="48" r="40" fill="none" stroke={cbColor} strokeWidth="10"
                          strokeLinecap="round" strokeDasharray={`${(combined.score) * 251.2} 251.2`} />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-2xl font-bold" style={{ color: cbColor }}>{combined.percentage}%</span>
                      </div>
                    </div>
                    <div className="flex-1">
                      <span className="text-sm font-bold px-3 py-1 rounded-full" style={{ backgroundColor: cbBg, color: cbColor }}>
                        {combined.level} Risk
                      </span>
                      <p className="text-xs text-[#999999] mt-2">
                        {combined.modalitiesUsed} of {combined.contributions.length} tests · confidence {Math.round(combined.confidence * 100)}%
                      </p>
                      <p className="text-[11px] text-[#B8B8B8] mt-1">Screening aid only — not a diagnosis.</p>
                    </div>
                  </div>

                  {/* Per-modality contribution breakdown */}
                  <div className="flex flex-col gap-2.5">
                    {combined.contributions.map((c) => (
                      <div key={c.modality} className="flex items-center gap-3">
                        <span className="text-xs text-[#6B6B6B] w-24 flex-shrink-0">{MODALITY_LABELS[c.modality]}</span>
                        <div className="flex-1 h-2 bg-[#F0F0F0] rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{
                            width: `${c.present ? Math.round(c.risk * 100) : 0}%`,
                            backgroundColor: c.present ? cbColor : '#E0E0E0',
                          }} />
                        </div>
                        <span className="text-[11px] font-semibold text-[#999999] w-24 text-right">
                          {c.present ? `${Math.round(c.risk * 100)}% · w${Math.round(c.effectiveWeight * 100)}%` : 'not done'}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          );
        })()}

        {/* Risk Score Trend Card */}
        <div className="bg-white rounded-3xl p-6 mb-6 shadow-sm animate-fade-in">
          <h2 className="text-xl font-bold text-[#1A1A1A] mb-1">Risk Score Trend</h2>
          <p className="text-sm text-[#6B6B6B] mb-6">Your neurological markers over time</p>

          {/* Average Risk Display */}
          <div className="flex items-start justify-between mb-6">
            <div>
              <p className="text-xs text-[#B8B8B8] uppercase tracking-wider mb-1">AVERAGE RISK (7D)</p>
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
                const meta = getTestTypeMeta(test.type);
                const Icon = meta.icon;
                const riskPercent = Math.round(test.riskScore * 100);

                return (
                  <button
                    key={test.id}
                    onClick={() => navigate(meta.route)}
                    className="bg-white rounded-2xl p-4 flex items-center gap-4 shadow-sm hover:shadow-md transition-all active:scale-[0.98] text-left w-full stagger-item"
                    style={{ ["--i" as string]: index }}
                  >
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: meta.iconBg }}
                    >
                      <Icon size={24} style={{ color: meta.iconColor }} strokeWidth={2.5} />
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
                  </button>
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
