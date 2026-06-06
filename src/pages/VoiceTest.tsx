import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Mic, Pause, MicOff, Square, Info, Share2, Volume2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import { analyzeVoice, VoiceAnalysisMetadata, VoiceAnalysisResult } from "@/utils/voiceAnalysisAPI";
import { addTestRecord } from "@/utils/testHistory";
import { VOICE_PROMPTS, playVoicePrompt, stopVoicePrompt, preloadVoices } from "@/utils/voicePrompts";
import BottomNav from "@/components/BottomNav";

type Phase = "setup" | "recording" | "processing" | "result";

const WaveformBar = ({ delay, isRecording }: { delay: number; isRecording?: boolean }) => (
  <div
    className={`w-1.5 rounded-full ${isRecording ? 'bg-[#FF8C42]' : 'bg-[#FFB89D]'} animate-waveform`}
    style={{
      height: "40px",
      animationDelay: `${delay}ms`,
      animationDuration: `${600 + Math.random() * 400}ms`,
    }}
  />
);

const VoiceTest = () => {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("setup");
  const [timer, setTimer] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<VoiceAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Voice prompts state
  const [currentPromptIndex, setCurrentPromptIndex] = useState(0);
  const [isPlayingPrompt, setIsPlayingPrompt] = useState(false);
  
  // Health profile toggles
  const [age60Plus, setAge60Plus] = useState(false);
  const [neuroHistory, setNeuroHistory] = useState(false);
  const [hypertension, setHypertension] = useState(false);
  const [updrsScore, setUpdrsScore] = useState(0);
  
  // Audio recording refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  // Recording timer
  useEffect(() => {
    if (phase !== "recording" || isPaused) return;
    const interval = setInterval(() => setTimer((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [phase, isPaused]);

  // Voice prompts during recording
  useEffect(() => {
    if (phase !== "recording" || isPaused) return;

    const playPrompts = async () => {
      for (const prompt of VOICE_PROMPTS) {
        if (timer === prompt.timing && currentPromptIndex < prompt.id) {
          console.log(`Playing prompt ${prompt.id} at ${timer}s:`, prompt.text);
          setIsPlayingPrompt(true);
          setCurrentPromptIndex(prompt.id);
          try {
            await playVoicePrompt(prompt.text);
            console.log(`Prompt ${prompt.id} finished`);
          } catch (error) {
            console.error('Error playing prompt:', error);
          }
          setIsPlayingPrompt(false);
        }
      }
    };

    playPrompts();
  }, [timer, phase, isPaused, currentPromptIndex]);

  // Auto-stop at 15s (changed from 10s)
  useEffect(() => {
    if (phase === "recording" && timer >= 15) {
      handleStopRecording();
    }
  }, [timer, phase]);

  // Start recording function
  const handleStartRecording = async () => {
    try {
      // Preload voices
      await preloadVoices();
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      // Try to use WAV format if supported, otherwise use webm
      let mimeType = 'audio/wav';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/webm';
        console.log('WAV not supported, using webm');
      }
      
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        console.log('Recording stopped. Blob size:', audioBlob.size, 'Type:', audioBlob.type);
        await processAudio(audioBlob);
      };

      mediaRecorder.start();
      setPhase("recording");
      setTimer(0);
      setCurrentPromptIndex(0);
      console.log('Recording started with format:', mimeType);
    } catch (err) {
      console.error('Microphone access error:', err);
      setError('Microphone access denied. Please allow microphone permissions.');
    }
  };

  // Stop recording function
  const handleStopRecording = () => {
    stopVoicePrompt(); // Stop any ongoing voice prompts
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
  };

  // Process audio with backend
  const processAudio = async (audioBlob: Blob) => {
    setPhase("processing");
    setProgress(0);
    setError(null);

    try {
      console.log('Starting audio processing...');
      console.log('Audio blob size:', audioBlob.size, 'bytes');
      console.log('Audio blob type:', audioBlob.type);
      
      const metadata: VoiceAnalysisMetadata = {
        ac: age60Plus ? 1 : 0,
        nth: neuroHistory ? 1 : 0,
        htn: hypertension ? 1 : 0,
        updrs: updrsScore,
      };

      console.log('Metadata:', metadata);

      // Simulate progress
      const progressInterval = setInterval(() => {
        setProgress((p) => Math.min(p + 5, 90));
      }, 200);

      console.log('Calling backend API...');
      const result = await analyzeVoice(audioBlob, metadata);
      console.log('Backend response:', result);
      
      clearInterval(progressInterval);
      setProgress(100);
      setAnalysisResult(result);
      
      // Save to localStorage
      addTestRecord({
        type: 'VOICE',
        name: 'Voice Stability Test',
        riskScore: result.risk_score,
        riskLevel: result.risk_level,
        metadata: {
          age60Plus,
          neuroHistory,
          hypertension,
          updrsScore,
        },
      });
      
      setTimeout(() => setPhase("result"), 500);
    } catch (err) {
      console.error('Analysis error:', err);
      setError(err instanceof Error ? err.message : 'Analysis failed. Please check if backend is running on port 5050.');
      setPhase("setup");
    }
  };

  // Processing progress (removed - now handled in processAudio)
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopVoicePrompt();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return { minutes: m.toString().padStart(2, "0"), seconds: sec.toString().padStart(2, "0") };
  };

  // SETUP SCREEN (Step 1 of 3)
  if (phase === "setup") {
    return (
      <div className="min-h-screen bg-[#EFEBE6]">
        <div className="max-w-md mx-auto px-5 pt-4 pb-8">
          {/* Header */}
          <div className="flex items-center mb-6">
            <button onClick={() => navigate(-1)} className="p-1 -ml-1">
              <ArrowLeft size={24} className="text-[#1A1A1A]" />
            </button>
            <h1 className="text-lg font-bold text-[#1A1A1A] absolute left-1/2 -translate-x-1/2">Voice Check Setup</h1>
          </div>

          {/* Progress Indicator */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-[#1A1A1A]">Setup Progress</span>
              <span className="text-sm text-[#6B6B6B]">Step 1 of 3</span>
            </div>
            <div className="h-2 bg-[#E0E0E0] rounded-full overflow-hidden">
              <div className="h-full bg-[#5DBEA3] rounded-full" style={{ width: '33%' }} />
            </div>
          </div>

          {/* Instruction Card */}
          <div className="bg-white rounded-3xl overflow-hidden mb-5 shadow-sm animate-fade-in">
            <div className="bg-[#FFD4B8] h-40 flex items-center justify-center">
              <div className="text-6xl">🗣️</div>
            </div>
            <div className="p-6">
              <h2 className="text-xl font-bold text-[#1A1A1A] mb-2">Prepare your voice</h2>
              <p className="text-sm text-[#6B6B6B] leading-relaxed">
                Find a quiet space and prepare to record your voice. We use advanced neuro-analysis to monitor vocal markers.
              </p>
            </div>
          </div>

          {/* Sample Prompt Card */}
          <div className="bg-[#B8B5FF] rounded-3xl p-5 mb-6 text-center animate-fade-in" style={{ animationDelay: "0.1s" }}>
            <div className="flex items-center justify-center gap-2 mb-2">
              <Volume2 size={16} className="text-[#5B4FD8]" />
              <p className="text-xs font-bold text-[#5B4FD8] uppercase tracking-wider">Interactive Voice Prompts</p>
            </div>
            <p className="text-sm text-[#1A1A1A] leading-relaxed mb-3">
              Our AI assistant will guide you through the recording with voice prompts. Simply follow the instructions and speak naturally.
            </p>
            <button
              onClick={async () => {
                try {
                  await preloadVoices();
                  await playVoicePrompt("Testing voice. Can you hear me?");
                } catch (err) {
                  console.error('Voice test error:', err);
                }
              }}
              className="bg-[#5B4FD8] hover:bg-[#4B3FC8] text-white font-semibold text-xs px-4 py-2 rounded-full active:scale-95 transition-all"
            >
              Test Voice
            </button>
          </div>

          {/* Health Profiles */}
          <div className="animate-fade-in" style={{ animationDelay: "0.15s" }}>
            <h3 className="text-lg font-bold text-[#1A1A1A] mb-4">Health Profiles</h3>
            
            <div className="flex flex-col gap-3 mb-6">
              {/* Age 60+ */}
              <div className="bg-[#FFE8D6] rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-base font-bold text-[#1A1A1A]">Age 60+</p>
                  <p className="text-sm text-[#6B6B6B]">Tailored benchmarks</p>
                </div>
                <Switch checked={age60Plus} onCheckedChange={setAge60Plus} />
              </div>

              {/* Neurological History */}
              <div className="bg-[#D4F1E8] rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-base font-bold text-[#1A1A1A]">Neurological History</p>
                  <p className="text-sm text-[#6B6B6B]">Include medical context</p>
                </div>
                <Switch checked={neuroHistory} onCheckedChange={setNeuroHistory} />
              </div>

              {/* Hypertension */}
              <div className="bg-[#E8E4FF] rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-base font-bold text-[#1A1A1A]">Hypertension</p>
                  <p className="text-sm text-[#6B6B6B]">High blood pressure check</p>
                </div>
                <Switch checked={hypertension} onCheckedChange={setHypertension} />
              </div>

              {/* UPDRS Score Slider */}
              <div className="bg-[#FFF4E6] rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-base font-bold text-[#1A1A1A]">UPDRS Score</p>
                    <p className="text-sm text-[#6B6B6B]">Unified Parkinson's Disease Rating Scale</p>
                  </div>
                  <span className="text-2xl font-bold text-[#FF8C42]">{updrsScore}</span>
                </div>
                <Slider
                  value={[updrsScore]}
                  onValueChange={(value) => setUpdrsScore(value[0])}
                  min={0}
                  max={108}
                  step={1}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-[#999999] mt-2">
                  <span>0 (None)</span>
                  <span>54 (Moderate)</span>
                  <span>108 (Severe)</span>
                </div>
              </div>
            </div>
          </div>

          {/* CTA Button */}
          <button
            onClick={handleStartRecording}
            className="w-full bg-[#FF8C42] hover:bg-[#FF7A2E] text-white font-bold text-base rounded-full py-4 flex items-center justify-center gap-2 shadow-lg active:scale-[0.98] transition-all"
          >
            <Mic size={20} />
            Continue to Recording
          </button>

          {/* Error Message */}
          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-2xl">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* Footer Disclaimer */}
          <p className="text-xs text-[#999999] text-center mt-4">
            By continuing, you agree to the NeuroVoice data processing terms.
          </p>
        </div>
      </div>
    );
  }

  // RECORDING SCREEN (Step 2 of 3)
  if (phase === "recording") {
    const time = formatTime(timer);
    
    return (
      <div className="min-h-screen bg-[#F5F5F5] flex flex-col">
        <div className="max-w-md mx-auto px-5 pt-4 pb-8 flex-1 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <button onClick={() => navigate(-1)} className="p-1 -ml-1">
              <ArrowLeft size={24} className="text-[#1A1A1A]" />
            </button>
            <h1 className="text-lg font-bold text-[#1A1A1A] absolute left-1/2 -translate-x-1/2">NeuroVoice AI</h1>
            <button className="p-1">
              <div className="w-1 h-1 bg-[#1A1A1A] rounded-full" />
              <div className="w-1 h-1 bg-[#1A1A1A] rounded-full mt-1" />
              <div className="w-1 h-1 bg-[#1A1A1A] rounded-full mt-1" />
            </button>
          </div>

          {/* Timer Display */}
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="bg-white rounded-2xl px-6 py-4 shadow-sm">
              <div className="text-4xl font-bold text-[#FF8C42] text-center">{time.minutes}</div>
              <div className="text-xs text-[#999999] uppercase tracking-wider text-center mt-1">MINUTES</div>
            </div>
            <div className="text-2xl font-bold text-[#999999]">:</div>
            <div className="bg-white rounded-2xl px-6 py-4 shadow-sm">
              <div className="text-4xl font-bold text-[#FF8C42] text-center">{time.seconds}</div>
              <div className="text-xs text-[#999999] uppercase tracking-wider text-center mt-1">SECONDS</div>
            </div>
          </div>

          {/* Live Feedback */}
          {timer >= 3 && (
            <div className="flex justify-center mb-6 animate-fade-in">
              <div className="bg-[#D4F1E8] text-[#5DBEA3] px-4 py-2 rounded-full text-sm font-semibold flex items-center gap-2">
                <div className="w-2 h-2 bg-[#5DBEA3] rounded-full" />
                Nice and steady!
              </div>
            </div>
          )}

          {/* Voice Visualizer */}
          <div className="flex items-end justify-center gap-1.5 h-24 mb-8">
            {Array.from({ length: 15 }).map((_, i) => (
              <WaveformBar key={i} delay={i * 60} isRecording={true} />
            ))}
          </div>

          {/* Reading Prompt Card */}
          <div className="bg-white rounded-3xl p-6 text-center mb-auto shadow-sm">
            <div className="flex items-center justify-center gap-2 mb-3">
              <Volume2 size={16} className={`${isPlayingPrompt ? 'text-[#FF8C42] animate-pulse' : 'text-[#FFB89D]'}`} />
              <p className="text-xs font-bold text-[#FFB89D] uppercase tracking-wider">
                {isPlayingPrompt ? 'Listening...' : 'Voice Prompt'}
              </p>
            </div>
            <p className="text-xl font-semibold text-[#1A1A1A] leading-relaxed">
              {currentPromptIndex > 0 && currentPromptIndex <= VOICE_PROMPTS.length
                ? VOICE_PROMPTS[currentPromptIndex - 1].displayText
                : "Get ready to speak..."}
            </p>
            
            {/* Progress indicator for prompts */}
            <div className="flex justify-center gap-2 mt-4">
              {VOICE_PROMPTS.map((prompt) => (
                <div
                  key={prompt.id}
                  className={`h-1.5 rounded-full transition-all ${
                    currentPromptIndex >= prompt.id
                      ? 'w-8 bg-[#FF8C42]'
                      : 'w-1.5 bg-[#E0E0E0]'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Recording Controls */}
          <div className="flex items-center justify-center gap-6 mt-8">
            {/* Pause Button */}
            <button
              onClick={() => setIsPaused(!isPaused)}
              className="w-14 h-14 rounded-full bg-white shadow-md flex items-center justify-center hover:shadow-lg transition-all active:scale-95"
            >
              <Pause size={24} className="text-[#1A1A1A]" fill={isPaused ? "#1A1A1A" : "none"} />
            </button>

            {/* Stop/Record Button */}
            <button
              onClick={handleStopRecording}
              className="w-20 h-20 rounded-full bg-[#FF8C42] shadow-lg flex items-center justify-center hover:bg-[#FF7A2E] transition-all active:scale-95"
            >
              <Square size={32} className="text-white" fill="white" />
            </button>

            {/* Mute Button */}
            <button
              onClick={() => setIsMuted(!isMuted)}
              className="w-14 h-14 rounded-full bg-white shadow-md flex items-center justify-center hover:shadow-lg transition-all active:scale-95"
            >
              <MicOff size={24} className={isMuted ? "text-[#FF8C42]" : "text-[#1A1A1A]"} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // PROCESSING SCREEN
  if (phase === "processing") {
    return (
      <div className="min-h-screen bg-[#EFEBE6] flex flex-col items-center justify-center px-6">
        <p className="text-[#6B6B6B] font-semibold text-sm mb-2">Voice Processing</p>
        <h2 className="text-3xl font-bold text-[#1A1A1A] mb-12">Just a moment…</h2>

        <div className="relative mb-12">
          <div className="w-32 h-32 rounded-full bg-[#FF8C42] opacity-10 animate-pulse-ring absolute inset-0" />
          <div className="w-32 h-32 rounded-full bg-[#FF8C42] opacity-5 animate-pulse-ring absolute inset-0" style={{ animationDelay: "0.5s" }} />
          <div className="w-32 h-32 rounded-full bg-[#FFD4B8] flex items-center justify-center relative">
            <div className="flex items-end gap-0.5 h-8">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="w-1 rounded-full bg-[#FF8C42] animate-waveform" style={{ height: "20px", animationDelay: `${i * 120}ms` }} />
              ))}
            </div>
          </div>
        </div>

        <h3 className="text-lg font-bold text-[#1A1A1A] mb-1">Analyzing voice stability…</h3>
        <p className="text-[#6B6B6B] text-sm text-center mb-6 max-w-xs">
          Checking pitch consistency and tone patterns against healthy baselines.
        </p>

        <div className="w-full max-w-xs mb-2">
          <Progress value={progress} className="h-2" />
        </div>
        <div className="w-full max-w-xs flex justify-between text-xs text-[#6B6B6B]">
          <span>Voice Processing</span>
          <span>{progress}%</span>
        </div>

        <div className="bg-white rounded-2xl p-4 mt-8 flex gap-3 items-start shadow-sm max-w-xs">
          <div className="w-8 h-8 rounded-full bg-[#FFE8D6] flex items-center justify-center flex-shrink-0">
            <span className="text-lg">💡</span>
          </div>
          <div>
            <p className="font-semibold text-[#1A1A1A] text-sm">Did you know?</p>
            <p className="text-[#6B6B6B] text-xs mt-0.5">
              Regular voice exercises can help maintain vocal strength over time.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // RESULT SCREEN (Step 3 of 3)
  return (
    <div className="min-h-screen bg-[#EFEBE6] pb-24">
      <div className="max-w-md mx-auto px-5 pt-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <button onClick={() => navigate("/home")} className="p-1 -ml-1">
            <ArrowLeft size={24} className="text-[#1A1A1A]" />
          </button>
          <h1 className="text-lg font-bold text-[#1A1A1A] absolute left-1/2 -translate-x-1/2">NeuroVoice</h1>
          <button className="p-1">
            <Info size={24} className="text-[#FF8C42]" />
          </button>
        </div>

        {/* Status Header */}
        <div className="text-center mb-8 animate-fade-in">
          <h2 className="text-3xl font-bold text-[#1A1A1A] mb-2">Analysis Complete</h2>
          <p className="text-[#6B6B6B] text-base">Your voice scan is ready for review</p>
        </div>

        {/* Risk Ring */}
        <div className="flex flex-col items-center mb-10 animate-fade-in" style={{ animationDelay: "0.1s" }}>
          <div className="relative w-48 h-48 mb-4">
            <svg viewBox="0 0 192 192" className="w-full h-full -rotate-90">
              <circle cx="96" cy="96" r="80" fill="none" stroke="#E8E8E8" strokeWidth="16" />
              <circle
                cx="96" cy="96" r="80"
                fill="none"
                stroke={analysisResult?.risk_level === 'Low' ? '#5DBEA3' : analysisResult?.risk_level === 'Medium' ? '#FF9F43' : '#FF8C42'}
                strokeWidth="16"
                strokeLinecap="round"
                strokeDasharray={`${(analysisResult?.risk_score || 0) * 100 * 5.027} 502.7`}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-5xl font-bold text-[#1A1A1A]">{Math.round((analysisResult?.risk_score || 0) * 100)}%</span>
            </div>
          </div>
          <div className={`px-5 py-2 rounded-full text-sm font-bold ${
            analysisResult?.risk_level === 'Low' ? 'bg-[#D4F1E8] text-[#5DBEA3]' :
            analysisResult?.risk_level === 'Medium' ? 'bg-[#FFE8D6] text-[#FF9F43]' :
            'bg-[#FFE8D6] text-[#FF8C42]'
          }`}>
            {analysisResult?.risk_level || 'Low'} Risk
          </div>
        </div>

        {/* Insight Message */}
        <div className="bg-white rounded-3xl p-5 mb-8 text-center shadow-sm animate-fade-in" style={{ animationDelay: "0.12s" }}>
          <p className="text-base text-[#1A1A1A] leading-relaxed">
            {analysisResult?.risk_level === 'Low' && 
              "Your voice analysis shows healthy vocal patterns. Continue regular monitoring for early detection."}
            {analysisResult?.risk_level === 'Medium' && 
              "Your voice shows some markers that warrant attention. Consider consulting with a healthcare professional."}
            {analysisResult?.risk_level === 'High' && 
              "Your voice analysis indicates significant markers. We recommend consulting with a neurologist for comprehensive evaluation."}
          </p>
          <p className="text-xs text-[#999999] mt-3">
            This is a screening tool, not a medical diagnosis.
          </p>
        </div>

        {/* Detailed Metrics */}
        <div className="mb-8 animate-fade-in" style={{ animationDelay: "0.15s" }}>
          <div className="flex items-center gap-2 mb-4">
            <h3 className="text-xl font-bold text-[#1A1A1A]">Health Profile Used</h3>
            <Info size={18} className="text-[#999999]" />
          </div>

          <div className="flex flex-col gap-3">
            {/* Age 60+ */}
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-base font-semibold text-[#1A1A1A]">Age 60+</span>
                </div>
                <span className="text-base font-bold text-[#FF8C42]">{age60Plus ? 'Yes' : 'No'}</span>
              </div>
            </div>

            {/* Neurological History */}
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-base font-semibold text-[#1A1A1A]">Neurological History</span>
                </div>
                <span className="text-base font-bold text-[#FF8C42]">{neuroHistory ? 'Yes' : 'No'}</span>
              </div>
            </div>

            {/* Hypertension */}
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-base font-semibold text-[#1A1A1A]">Hypertension</span>
                </div>
                <span className="text-base font-bold text-[#FF8C42]">{hypertension ? 'Yes' : 'No'}</span>
              </div>
            </div>

            {/* UPDRS Score */}
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-base font-semibold text-[#1A1A1A]">UPDRS Score</span>
                  <Info size={16} className="text-[#999999]" />
                </div>
                <span className="text-base font-bold text-[#FF8C42]">{updrsScore}/108</span>
              </div>
              <div className="h-2 bg-[#FFE8D6] rounded-full overflow-hidden">
                <div className="h-full bg-[#FF8C42] rounded-full" style={{ width: `${(updrsScore / 108) * 100}%` }} />
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-3 animate-fade-in" style={{ animationDelay: "0.2s" }}>
          <button
            onClick={() => navigate("/history")}
            className="w-full bg-[#FF8C42] hover:bg-[#FF7A2E] text-white font-bold text-base rounded-full py-4 shadow-lg active:scale-[0.98] transition-all"
          >
            View Full Insights
          </button>
          <button
            onClick={() => {}}
            className="w-full bg-[#FFE8D6] hover:bg-[#FFD4B8] text-[#FF8C42] font-bold text-base rounded-full py-4 active:scale-[0.98] transition-all"
          >
            <div className="flex items-center justify-center gap-2">
              <Share2 size={20} />
              Share Report
            </div>
          </button>
        </div>
      </div>

      <BottomNav />
    </div>
  );
};

export default VoiceTest;
