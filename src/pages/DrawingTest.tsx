import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Info, Trash2, Check, RefreshCw, TrendingUp, Activity, Pencil } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import BottomNav from "@/components/BottomNav";
import { addTestRecord } from "@/utils/testHistory";
import {
  CANVAS_SIZE, DrawingTask, DrawPoint, DrawingResult,
  analyzeDrawing, spiralGuidePoints, waveGuidePoints,
} from "@/utils/drawingAnalysis";

type Phase = "setup" | "drawing" | "processing" | "result";

const TASKS: { id: DrawingTask; color: string; bg: string; short: string; instruction: string }[] = [
  {
    id: "Archimedes Spiral", color: "#FF8C42", bg: "#FFD4B8",
    short: "Trace the spiral from centre outward",
    instruction: "Starting from the centre dot, trace along the dashed spiral outward as smoothly as you can. Keep your hand relaxed.",
  },
  {
    id: "Meander Wave", color: "#5DBEA3", bg: "#C8E6DD",
    short: "Trace the sinusoidal wave path",
    instruction: "Trace the dashed wave from left to right as smoothly as possible, staying close to the guide line.",
  },
];

const RISK_BG: Record<string, string> = { Low: "#D4F1E8", Medium: "#FFE8D6", High: "#FFE0E0" };
const RISK_TEXT: Record<string, string> = { Low: "#5DBEA3", Medium: "#FF9F43", High: "#FF6B6B" };

const DrawingTest = () => {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("setup");
  const [selectedTask, setSelectedTask] = useState<DrawingTask>("Archimedes Spiral");
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<DrawingResult | null>(null);
  const [hasDrawn, setHasDrawn] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<DrawPoint[][]>([]);
  const currentStroke = useRef<DrawPoint[]>([]);
  const drawingRef = useRef(false);
  const taskDef = TASKS.find((t) => t.id === selectedTask)!;

  // ── Guide + stroke rendering ────────────────────────────────────────────────
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // Guide
    const guide = selectedTask === "Archimedes Spiral" ? spiralGuidePoints() : waveGuidePoints();
    ctx.beginPath();
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = "#D8D0C8";
    ctx.lineWidth = 1.5;
    guide.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();
    ctx.setLineDash([]);

    // Start dot
    ctx.beginPath();
    const start = guide[0];
    ctx.arc(start.x, start.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = taskDef.color;
    ctx.globalAlpha = 0.6;
    ctx.fill();
    ctx.globalAlpha = 1;

    // User strokes
    ctx.strokeStyle = taskDef.color;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const drawStroke = (stroke: DrawPoint[]) => {
      if (stroke.length < 2) return;
      ctx.beginPath();
      stroke.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();
    };
    strokesRef.current.forEach(drawStroke);
    drawStroke(currentStroke.current);
  }, [selectedTask, taskDef.color]);

  useEffect(() => {
    if (phase === "drawing") redraw();
  }, [phase, redraw]);

  const toCanvasPoint = (e: React.PointerEvent): DrawPoint => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = CANVAS_SIZE / rect.width;
    const scaleY = CANVAS_SIZE / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
      t: performance.now(),
      p: e.pressure > 0 ? e.pressure : undefined,
    };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drawingRef.current = true;
    currentStroke.current = [toCanvasPoint(e)];
    setHasDrawn(true);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drawingRef.current) return;
    currentStroke.current.push(toCanvasPoint(e));
    redraw();
  };
  const onPointerUp = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    if (currentStroke.current.length > 1) strokesRef.current.push([...currentStroke.current]);
    currentStroke.current = [];
    redraw();
  };

  const clearCanvas = () => {
    strokesRef.current = [];
    currentStroke.current = [];
    setHasDrawn(false);
    redraw();
  };

  const startDrawing = () => {
    strokesRef.current = [];
    currentStroke.current = [];
    setHasDrawn(false);
    setPhase("drawing");
  };

  const finishDrawing = () => {
    if (drawingRef.current && currentStroke.current.length > 1) {
      strokesRef.current.push([...currentStroke.current]);
    }
    const allStrokes = [...strokesRef.current];
    setProgress(0);
    setPhase("processing");
  };

  // Processing → analyse
  useEffect(() => {
    if (phase !== "processing") return;
    const interval = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          clearInterval(interval);
          const res = analyzeDrawing(strokesRef.current, selectedTask);
          setResult(res);
          try {
            addTestRecord({
              type: "DRAWING",
              name: `${selectedTask} Test`,
              riskScore: res.riskScore,
              riskLevel: res.riskLevel,
              metadata: {
                task: selectedTask,
                tremorIndex: res.metrics.tremorIndex,
                speedCV: res.metrics.speedCV,
                meanSpeed: res.metrics.meanSpeed,
                spiralRMSE: res.metrics.spiralRMSE,
                strokeCount: res.metrics.strokeCount,
                totalTime: res.metrics.totalTimeSec,
              },
            });
          } catch (err) { console.error("addTestRecord error:", err); }
          setTimeout(() => setPhase("result"), 300);
          return 100;
        }
        return p + 4;
      });
    }, 70);
    return () => clearInterval(interval);
  }, [phase, selectedTask]);

  const reset = () => {
    strokesRef.current = [];
    currentStroke.current = [];
    setResult(null);
    setHasDrawn(false);
    setPhase("setup");
  };

  // ── SETUP ─────────────────────────────────────────────────────────────────
  if (phase === "setup") {
    return (
      <div className="min-h-screen bg-[#EFEBE6] pb-24">
        <div className="max-w-md mx-auto px-5 pt-4">
          <div className="flex items-center mb-6">
            <button onClick={() => navigate(-1)} className="p-1 -ml-1 active:scale-90 transition-transform">
              <ArrowLeft size={24} className="text-[#1A1A1A]" />
            </button>
            <h1 className="text-lg font-bold text-[#1A1A1A] absolute left-1/2 -translate-x-1/2">Drawing Test</h1>
          </div>

          <div className="bg-white rounded-3xl overflow-hidden mb-5 shadow-sm animate-fade-in">
            <div className="bg-[#FFD4B8] h-36 flex items-center justify-center">
              <Pencil size={52} className="text-[#FF8C42]" />
            </div>
            <div className="p-6">
              <h2 className="text-xl font-bold text-[#1A1A1A] mb-2">Motor Skills Assessment</h2>
              <p className="text-sm text-[#6B6B6B] leading-relaxed">
                Analyses fine motor control using clinically-grounded drawing tasks. Draw as smoothly
                as possible — tremor, speed variability, and path deviation are measured.
              </p>
              <div className="mt-3 flex items-center gap-2 text-xs text-[#999999]">
                <Info size={14} /> Screening tool only — not a medical diagnosis.
              </div>
            </div>
          </div>

          <h3 className="text-lg font-bold text-[#1A1A1A] mb-3">Select Task</h3>
          <div className="flex flex-col gap-3 mb-6">
            {TASKS.map((t, i) => (
              <button
                key={t.id}
                onClick={() => setSelectedTask(t.id)}
                className="rounded-2xl p-4 flex items-center gap-4 tappable stagger-item text-left"
                style={{ backgroundColor: t.bg, ["--i" as string]: i, outline: selectedTask === t.id ? `2px solid ${t.color}` : "none" }}
              >
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: t.color }}>
                  <Activity size={26} className="text-white" />
                </div>
                <div className="flex-1">
                  <p className="text-base font-bold text-[#1A1A1A]">{t.id}</p>
                  <p className="text-sm text-[#6B6B6B]">{t.short}</p>
                </div>
                {selectedTask === t.id && <Check size={22} style={{ color: t.color }} />}
              </button>
            ))}
          </div>

          <button
            onClick={startDrawing}
            className="w-full bg-[#FF8C42] hover:bg-[#FF7A2E] text-white font-bold text-base rounded-full py-4 flex items-center justify-center gap-2 shadow-lg active:scale-[0.98] transition-all"
          >
            <Pencil size={20} /> Start Drawing
          </button>
        </div>
        <BottomNav />
      </div>
    );
  }

  // ── DRAWING ─────────────────────────────────────────────────────────────────
  if (phase === "drawing") {
    return (
      <div className="min-h-screen bg-[#EFEBE6]">
        <div className="max-w-md mx-auto px-5 pt-4 pb-8">
          <div className="flex items-center mb-4">
            <button onClick={reset} className="p-1 -ml-1 active:scale-90 transition-transform">
              <ArrowLeft size={24} className="text-[#1A1A1A]" />
            </button>
            <h1 className="text-lg font-bold text-[#1A1A1A] absolute left-1/2 -translate-x-1/2">{selectedTask}</h1>
          </div>

          <div className="bg-white rounded-2xl p-4 mb-4 shadow-sm animate-fade-in">
            <p className="text-sm text-[#6B6B6B] text-center leading-relaxed">{taskDef.instruction}</p>
          </div>

          <div className="bg-white rounded-3xl p-4 mb-4 shadow-sm flex items-center justify-center animate-scale-in">
            <canvas
              ref={canvasRef}
              width={CANVAS_SIZE}
              height={CANVAS_SIZE}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              className="touch-none rounded-2xl bg-[#FBFAF8] w-full max-w-[300px] aspect-square"
              style={{ touchAction: "none" }}
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={clearCanvas}
              className="flex items-center justify-center gap-2 bg-white border-2 border-[#E0E0E0] text-[#6B6B6B] font-bold rounded-full py-4 px-6 active:scale-[0.97] transition-all"
            >
              <Trash2 size={20} /> Clear
            </button>
            <button
              onClick={finishDrawing}
              disabled={!hasDrawn}
              className={`flex-1 flex items-center justify-center gap-2 font-bold text-base rounded-full py-4 shadow-lg active:scale-[0.98] transition-all ${
                hasDrawn ? "bg-[#FF8C42] hover:bg-[#FF7A2E] text-white" : "bg-gray-300 text-gray-500 cursor-not-allowed"
              }`}
            >
              <Check size={20} /> Analyse
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── PROCESSING ────────────────────────────────────────────────────────────
  if (phase === "processing") {
    return (
      <div className="min-h-screen bg-[#EFEBE6] flex flex-col items-center justify-center px-6">
        <p className="text-[#6B6B6B] font-semibold text-sm mb-2">Clinical Analysis</p>
        <h2 className="text-3xl font-bold text-[#1A1A1A] mb-12">Computing metrics…</h2>
        <div className="relative mb-12">
          <div className="w-32 h-32 rounded-full bg-[#FF8C42] opacity-10 animate-pulse-ring absolute inset-0" />
          <div className="w-32 h-32 rounded-full bg-[#FFD4B8] flex items-center justify-center relative">
            <Activity size={32} className="text-[#FF8C42]" />
          </div>
        </div>
        <h3 className="text-lg font-bold text-[#1A1A1A] mb-1">Analysing motor biomarkers…</h3>
        <p className="text-[#6B6B6B] text-sm text-center mb-6 max-w-xs">
          Tremor index · speed variability · path deviation · curvature.
        </p>
        <div className="w-full max-w-xs mb-2"><Progress value={progress} className="h-2" /></div>
        <div className="w-full max-w-xs flex justify-between text-xs text-[#6B6B6B]">
          <span>Processing</span><span>{Math.round(progress)}%</span>
        </div>
      </div>
    );
  }

  // ── RESULT ──────────────────────────────────────────────────────────────────
  if (!result) return null;
  const m = result.metrics;
  const cards: { label: string; value: string; flagged: boolean }[] = [
    { label: "Tremor Index", value: `${(m.tremorIndex * 100).toFixed(0)}%`, flagged: m.tremorIndex > 0.35 },
    { label: "Speed CV", value: `${m.speedCV}%`, flagged: m.speedCV > 50 },
    { label: "Mean Speed", value: `${m.meanSpeed} px/s`, flagged: false },
    { label: "Pen Lifts", value: String(m.strokeCount), flagged: m.strokeCount > 3 },
  ];
  if (m.spiralRMSE !== undefined) cards.push({ label: "Spiral RMSE", value: `${m.spiralRMSE.toFixed(1)} px`, flagged: m.spiralRMSE > 12 });
  if (m.waviness !== undefined) cards.push({ label: "Waviness", value: m.waviness.toFixed(3), flagged: m.waviness > 0.2 });

  return (
    <div className="min-h-screen bg-[#EFEBE6] pb-24">
      <div className="max-w-md mx-auto px-5 pt-4">
        <div className="flex items-center justify-between mb-8">
          <button onClick={() => navigate("/home")} className="p-1 -ml-1 active:scale-90 transition-transform">
            <ArrowLeft size={24} className="text-[#1A1A1A]" />
          </button>
          <h1 className="text-lg font-bold text-[#FF8C42] absolute left-1/2 -translate-x-1/2">NeuroVoice</h1>
          <Info size={24} className="text-[#FF8C42]" />
        </div>

        <div className="text-center mb-8 animate-fade-in">
          <h2 className="text-3xl font-bold text-[#1A1A1A] mb-2">Analysis Complete</h2>
          <p className="text-[#6B6B6B] text-base">{result.task} · {m.totalTimeSec}s</p>
        </div>

        <div className="flex flex-col items-center mb-8 animate-scale-in">
          <div className="relative w-48 h-48 mb-4">
            <svg viewBox="0 0 192 192" className="w-full h-full -rotate-90">
              <circle cx="96" cy="96" r="80" fill="none" stroke="#F0F0F0" strokeWidth="16" />
              <circle cx="96" cy="96" r="80" fill="none" stroke={result.color} strokeWidth="16"
                strokeLinecap="round" strokeDasharray={`${result.riskScore * 502.7} 502.7`} />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-5xl font-bold" style={{ color: result.color }}>{Math.round(result.riskScore * 100)}%</span>
            </div>
          </div>
          <div className="px-5 py-2 rounded-full text-sm font-bold" style={{ backgroundColor: RISK_BG[result.riskLevel], color: RISK_TEXT[result.riskLevel] }}>
            {result.riskLevel} Risk
          </div>
        </div>

        <div className="bg-white rounded-3xl p-5 mb-6 shadow-sm animate-fade-in">
          <p className="text-xs font-bold text-[#6B6B6B] uppercase tracking-wider mb-3">Clinical Findings</p>
          {result.findings.map((f, i) => (
            <div key={i} className="flex items-start gap-2 py-1.5">
              <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: result.color }} />
              <p className="text-sm text-[#6B6B6B] leading-relaxed">{f}</p>
            </div>
          ))}
          <p className="text-xs text-[#999999] mt-3">Screening tool only — not a clinical diagnosis.</p>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-8 animate-fade-in">
          {cards.map((c) => (
            <div key={c.label} className="bg-white rounded-2xl p-4 shadow-sm">
              <p className="text-xs font-semibold text-[#6B6B6B] uppercase tracking-wide mb-1">{c.label}</p>
              <p className="text-2xl font-bold" style={{ color: c.flagged ? "#FF8C42" : "#1A1A1A" }}>{c.value}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3 animate-fade-in">
          <button onClick={() => navigate("/insights")}
            className="w-full bg-[#FF8C42] hover:bg-[#FF7A2E] text-white font-bold text-base rounded-full py-4 flex items-center justify-center gap-2 shadow-lg active:scale-[0.98] transition-all">
            <TrendingUp size={20} /> View Insights
          </button>
          <button onClick={reset}
            className="w-full bg-white border-2 border-[#E0E0E0] text-[#1A1A1A] font-bold text-base rounded-full py-4 flex items-center justify-center gap-2 active:scale-[0.98] transition-all">
            <RefreshCw size={20} /> Try Again
          </button>
        </div>
      </div>
      <BottomNav />
    </div>
  );
};

export default DrawingTest;
