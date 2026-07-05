import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Info, Eye, Activity, Share2, TrendingUp, Volume2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { FacialData, FaceMeshResults, RiskResult } from "@/types/mediapipe";
import { calculateRiskFromSignals } from "@/utils/riskCalculation";
import { addTestRecord } from "@/utils/testHistory";
import { getRandomFacePrompt, playFacePrompt, preloadFaceVoices, stopFacePrompt } from "@/utils/facePrompts";
import BottomNav from "@/components/BottomNav";

type Phase = "recording" | "processing" | "result";

const FaceTest = () => {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("recording");
  const [recording, setRecording] = useState(false);
  const [timer, setTimer] = useState(0);
  const [progress, setProgress] = useState(0);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [result, setResult] = useState<RiskResult | null>(null);
  
  // Random medical question
  const [currentPrompt, setCurrentPrompt] = useState(getRandomFacePrompt());
  const [hasPlayedPrompt, setHasPlayedPrompt] = useState(false);
  
  // Real-time metrics display (only signals we actually measure from FaceMesh)
  const [blinkRate, setBlinkRate] = useState("--");
  const [motionStatus, setMotionStatus] = useState("Measuring…");

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number | null>(null);
  const faceMeshRef = useRef<any>(null);
  const recordingRef = useRef(false);
  
  const facialDataRef = useRef<FacialData>({
    blinkCount: 0,
    leftEyeWasOpen: true,
    rightEyeWasOpen: true,
    motionValues: [],
    asymmetryValues: [],
    previousLandmarks: null,
  });

  // Initialize camera
  useEffect(() => {
    let isMounted = true;

    const initCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            facingMode: 'user',
          },
          audio: false,
        });

        if (!isMounted) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            if (isMounted) {
              setCameraReady(true);
              initFaceMesh();
            }
          };
        }
      } catch (err) {
        console.error('Camera access error:', err);
        if (isMounted) {
          setCameraError('Camera access denied. Please allow camera permissions.');
        }
      }
    };

    initCamera();

    return () => {
      isMounted = false;
      stopFacePrompt(); // Stop any ongoing voice
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  const initFaceMesh = async () => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js';
    script.async = true;

    script.onload = () => {
      const script2 = document.createElement('script');
      script2.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js';
      script2.async = true;

      script2.onload = () => {
        if (window.FaceMesh) {
          const faceMesh = new window.FaceMesh({
            locateFile: (file: string) => {
              return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
            },
          });

          faceMesh.setOptions({
            maxNumFaces: 1,
            refineLandmarks: true,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5,
          });

          faceMesh.onResults(onFaceMeshResults);
          faceMeshRef.current = faceMesh;

          processFrame();
        }
      };

      document.body.appendChild(script2);
    };

    document.body.appendChild(script);
  };

  const onFaceMeshResults = (results: FaceMeshResults) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;

    if (!canvas || !video) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
      const landmarks = results.multiFaceLandmarks[0];

      // Draw face mesh
      ctx.strokeStyle = '#FFB89D';
      ctx.lineWidth = 1;

      const connections = window.FACEMESH_TESSELATION;
      if (connections) {
        for (const connection of connections) {
          const start = landmarks[connection[0]];
          const end = landmarks[connection[1]];

          ctx.beginPath();
          ctx.moveTo(start.x * canvas.width, start.y * canvas.height);
          ctx.lineTo(end.x * canvas.width, end.y * canvas.height);
          ctx.stroke();
        }
      }

      // Draw landmark points
      ctx.fillStyle = '#FF8C42';
      for (const landmark of landmarks) {
        ctx.beginPath();
        ctx.arc(
          landmark.x * canvas.width,
          landmark.y * canvas.height,
          2,
          0,
          2 * Math.PI
        );
        ctx.fill();
      }

      // Extract facial signals during recording
      if (recordingRef.current && facialDataRef.current) {
        const data = facialDataRef.current;

        // 1️⃣ BLINK DETECTION
        const leftEyeDistance = Math.abs(landmarks[159].y - landmarks[145].y);
        const rightEyeDistance = Math.abs(landmarks[386].y - landmarks[374].y);

        const faceHeight = Math.abs(landmarks[10].y - landmarks[152].y);
        const blinkThreshold = faceHeight * 0.015;

        const leftEyeClosed = leftEyeDistance < blinkThreshold;
        const rightEyeClosed = rightEyeDistance < blinkThreshold;
        const bothEyesClosed = leftEyeClosed && rightEyeClosed;

        if (data.leftEyeWasOpen && data.rightEyeWasOpen && bothEyesClosed) {
          data.blinkCount++;
          data.leftEyeWasOpen = false;
          data.rightEyeWasOpen = false;
        } else if (!data.leftEyeWasOpen && !data.rightEyeWasOpen && !bothEyesClosed) {
          data.leftEyeWasOpen = true;
          data.rightEyeWasOpen = true;
        }

        // 2️⃣ FACIAL MOTION
        if (data.previousLandmarks) {
          let totalMotion = 0;
          const expressiveLandmarks = [61, 291, 13, 14, 105, 334, 93, 323];

          for (const idx of expressiveLandmarks) {
            const dx = landmarks[idx].x - data.previousLandmarks[idx].x;
            const dy = landmarks[idx].y - data.previousLandmarks[idx].y;
            totalMotion += Math.sqrt(dx * dx + dy * dy);
          }
          const avgMotion = totalMotion / expressiveLandmarks.length;
          data.motionValues.push(avgMotion);
        }
        data.previousLandmarks = landmarks.map((l) => ({ x: l.x, y: l.y, z: l.z }));

        // 3️⃣ FACIAL ASYMMETRY
        const mouthAsymmetry = Math.abs(landmarks[61].y - landmarks[291].y);
        const browAsymmetry = Math.abs(landmarks[105].y - landmarks[334].y);
        const cheekAsymmetry = Math.abs(landmarks[206].y - landmarks[426].y);

        const avgAsymmetry = (mouthAsymmetry + browAsymmetry + cheekAsymmetry) / 3;
        data.asymmetryValues.push(avgAsymmetry);
      }
    }
  };

  const processFrame = async () => {
    if (faceMeshRef.current && videoRef.current && videoRef.current.readyState === 4) {
      await faceMeshRef.current.send({ image: videoRef.current });
    }
    animationRef.current = requestAnimationFrame(processFrame);
  };

  // Timer - only runs when recording
  useEffect(() => {
    if (recording && timer > 0) {
      const currentBlinkRate = (facialDataRef.current.blinkCount / timer) * 60;
      setBlinkRate(currentBlinkRate.toFixed(0));

      // Live facial-motion status from the most recent expression samples
      const recent = facialDataRef.current.motionValues.slice(-30);
      if (recent.length > 0) {
        const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
        setMotionStatus(avg >= 0.0015 ? "Expressive" : avg >= 0.0009 ? "Reduced" : "Very reduced");
      }
    }
  }, [recording, timer]);

  useEffect(() => {
    if (recording && timer < 30) {
      const interval = setTimeout(() => setTimer(timer + 1), 1000);
      return () => clearTimeout(interval);
    } else if (recording && timer >= 30) {
      handleStopRecording();
    }
  }, [recording, timer]);

  // Processing progress
  useEffect(() => {
    if (phase !== "processing") return;
    const interval = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          clearInterval(interval);
          setTimeout(() => setPhase("result"), 500);
          return 100;
        }
        return p + 3;
      });
    }, 100);
    return () => clearInterval(interval);
  }, [phase]);

  const handleStartRecording = async () => {
    if (!cameraReady) return;
    
    // Preload voices and play prompt
    try {
      await preloadFaceVoices();
      // Play the prompt after a short delay
      setTimeout(async () => {
        if (!hasPlayedPrompt) {
          await playFacePrompt(currentPrompt.text);
          setHasPlayedPrompt(true);
        }
      }, 1000);
    } catch (error) {
      console.error('Error playing face prompt:', error);
    }
    
    facialDataRef.current = {
      blinkCount: 0,
      leftEyeWasOpen: true,
      rightEyeWasOpen: true,
      motionValues: [],
      asymmetryValues: [],
      previousLandmarks: null,
    };
    recordingRef.current = true;
    setRecording(true);
    setTimer(0);
  };

  const handleStopRecording = () => {
    stopFacePrompt(); // Stop any ongoing voice
    recordingRef.current = false;
    setRecording(false);

    const data = facialDataRef.current;

    // Calculate metrics
    const calculatedBlinkRate = (data.blinkCount / 30) * 60;
    const validMotionValues = data.motionValues.slice(10);
    const avgRigidity =
      validMotionValues.length > 0
        ? validMotionValues.reduce((a, b) => a + b, 0) / validMotionValues.length
        : 1.5;

    const validAsymmetryValues = data.asymmetryValues.slice(10);
    const avgAsymmetry =
      validAsymmetryValues.length > 0
        ? validAsymmetryValues.reduce((a, b) => a + b, 0) / validAsymmetryValues.length
        : 0.02;

    console.log('═══════════════════════════════════════════════');
    console.log('📊 RAW FACIAL DATA COLLECTED:');
    console.log('Total Blinks:', data.blinkCount);
    console.log('Blink Rate:', calculatedBlinkRate.toFixed(1), '/min');
    console.log('Motion Values:', validMotionValues.length);
    console.log('Asymmetry Values:', validAsymmetryValues.length);
    console.log('═══════════════════════════════════════════════');

    const riskResult = calculateRiskFromSignals(calculatedBlinkRate, avgRigidity, avgAsymmetry);
    setResult(riskResult);

    // Save to localStorage
    addTestRecord({
      type: 'FACE',
      name: 'Facial Symmetry Scan',
      riskScore: riskResult.percentage / 100,
      riskLevel: riskResult.level,
      metadata: {
        blinkRate: calculatedBlinkRate,
        motion: avgRigidity,
        asymmetry: avgAsymmetry,
      },
    });

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }

    setPhase("processing");
  };

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60).toString().padStart(2, '0');
    const secs = (s % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };

  // Camera error screen
  if (cameraError) {
    return (
      <div className="min-h-screen bg-[#EFEBE6] flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center">
          <div className="w-20 h-20 bg-red-100 rounded-3xl mx-auto mb-6 flex items-center justify-center">
            <Activity className="w-10 h-10 text-red-500" />
          </div>
          <h2 className="text-2xl font-bold text-[#1A1A1A] mb-4">Camera Access Required</h2>
          <p className="text-[#6B6B6B] mb-6">{cameraError}</p>
          <button
            onClick={() => window.location.reload()}
            className="bg-[#FF8C42] hover:bg-[#FF7A2E] text-white font-semibold py-3 px-6 rounded-2xl"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // RECORDING SCREEN
  if (phase === "recording") {
    return (
      <div className="min-h-screen bg-[#EFEBE6]">
        <div className="max-w-md mx-auto px-5 pt-4 pb-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => navigate(-1)} className="p-1 -ml-1">
              <ArrowLeft size={24} className="text-[#1A1A1A]" />
            </button>
            <h1 className="text-lg font-bold text-[#1A1A1A] absolute left-1/2 -translate-x-1/2">Facial Assessment</h1>
            <button className="p-1">
              <Info size={24} className="text-[#1A1A1A]" />
            </button>
          </div>

          {/* Recording Progress */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-[#FF8C42] uppercase tracking-wider">Recording Progress</span>
              <span className="text-sm text-[#6B6B6B]">{formatTime(timer)} / 00:30</span>
            </div>
            <div className="h-1.5 bg-[#E0E0E0] rounded-full overflow-hidden">
              <div className="h-full bg-[#FF8C42] rounded-full transition-all" style={{ width: `${(timer / 30) * 100}%` }} />
            </div>
          </div>

          {/* Camera Frame */}
          <div className="bg-[#A8C5C0] rounded-[32px] overflow-hidden shadow-2xl mb-5 relative" style={{ paddingBottom: '75%' }}>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-cover"
              style={{ transform: 'scaleX(-1)' }}
            />
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full"
              style={{ transform: 'scaleX(-1)' }}
            />

            {!cameraReady && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-800 bg-opacity-50">
                <div className="text-white text-center">
                  <Activity className="w-12 h-12 mx-auto mb-3 animate-spin" />
                  <p>Initializing camera...</p>
                </div>
              </div>
            )}

            {recording && (
              <div className="absolute top-4 right-4 bg-[#FF8C42] text-white px-4 py-2 rounded-full flex items-center gap-2 animate-pulse">
                <div className="w-3 h-3 bg-white rounded-full" />
                <span className="font-semibold">Recording</span>
              </div>
            )}

            {/* Live Metric Overlays */}
            {recording && (
              <div className="absolute top-4 left-4 flex flex-col gap-2">
                <div className="bg-white/90 backdrop-blur-sm rounded-full px-4 py-2 flex items-center gap-2 shadow-sm">
                  <Eye size={16} className="text-[#7B68EE]" />
                  <span className="text-sm font-semibold text-[#1A1A1A]">Blink rate: {blinkRate}/min</span>
                </div>
                <div className="bg-white/90 backdrop-blur-sm rounded-full px-4 py-2 flex items-center gap-2 shadow-sm">
                  <Activity size={16} className="text-[#FF8C42]" />
                  <span className="text-sm font-semibold text-[#1A1A1A]">Facial motion: {motionStatus}</span>
                </div>
              </div>
            )}

            {/* Positioning Guide */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2">
              <div className="bg-black/70 backdrop-blur-sm rounded-full px-5 py-2.5">
                <span className="text-sm font-medium text-white">Position your face in the frame</span>
              </div>
            </div>
          </div>

          {/* Reading Prompt */}
          <div className="bg-white rounded-3xl p-5 text-center mb-6 shadow-sm">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Volume2 size={14} className="text-[#FF8C42]" />
              <p className="text-xs font-bold text-[#B8B8B8] uppercase tracking-wider">Answer This Question</p>
            </div>
            <p className="text-lg font-semibold text-[#1A1A1A] leading-relaxed">
              {currentPrompt.displayText}
            </p>
            <p className="text-xs text-[#999999] mt-2">
              The question will be read aloud when you start recording
            </p>
          </div>

          {/* Recording CTA */}
          {!recording ? (
            <button
              onClick={handleStartRecording}
              disabled={!cameraReady}
              className={`w-full font-bold text-base rounded-full py-4 flex items-center justify-center gap-2 shadow-lg active:scale-[0.98] transition-all mb-3 ${
                !cameraReady
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-[#FF8C42] hover:bg-[#FF7A2E] text-white'
              }`}
            >
              {!cameraReady ? 'Initializing...' : 'Start Recording'}
            </button>
          ) : (
            <button
              onClick={handleStopRecording}
              className="w-full bg-[#FFD4B8] text-[#1A1A1A] font-bold text-base rounded-full py-4 flex items-center justify-center gap-2 shadow-lg cursor-not-allowed mb-3"
            >
              Recording...
            </button>
          )}

          {/* Cancel Action */}
          <button
            onClick={() => navigate(-1)}
            className="w-full text-[#999999] font-medium text-sm py-2"
          >
            Cancel Assessment
          </button>
        </div>
      </div>
    );
  }

  // PROCESSING SCREEN
  if (phase === "processing") {
    return (
      <div className="min-h-screen bg-[#EFEBE6] flex flex-col items-center justify-center px-6">
        <p className="text-[#6B6B6B] font-semibold text-sm mb-2">Facial Processing</p>
        <h2 className="text-3xl font-bold text-[#1A1A1A] mb-12">Just a moment…</h2>

        <div className="relative mb-12">
          <div className="w-32 h-32 rounded-full bg-[#FF8C42] opacity-10 animate-pulse-ring absolute inset-0" />
          <div className="w-32 h-32 rounded-full bg-[#FFD4B8] flex items-center justify-center relative">
            <Activity size={32} className="text-[#FF8C42]" />
          </div>
        </div>

        <h3 className="text-lg font-bold text-[#1A1A1A] mb-1">Analyzing facial patterns…</h3>
        <p className="text-[#6B6B6B] text-sm text-center mb-6 max-w-xs">
          Checking blink rate, facial motion, and symmetry patterns.
        </p>

        <div className="w-full max-w-xs mb-2">
          <Progress value={progress} className="h-2" />
        </div>
        <div className="w-full max-w-xs flex justify-between text-xs text-[#6B6B6B]">
          <span>Processing</span>
          <span>{progress.toFixed(0)}%</span>
        </div>
      </div>
    );
  }

  // RESULT SCREEN
  if (!result) return null;

  const riskColorMap: Record<string, string> = {
    'Low': '#5DBEA3',
    'Medium': '#FF9F43',
    'High': '#FF8C42',
  };

  const riskBgMap: Record<string, string> = {
    'Low': '#D4F1E8',
    'Medium': '#FFE8D6',
    'High': '#FFE8D6',
  };

  return (
    <div className="min-h-screen bg-[#EFEBE6] pb-24">
      <div className="max-w-md mx-auto px-5 pt-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <button onClick={() => navigate("/home")} className="p-1 -ml-1">
            <ArrowLeft size={24} className="text-[#1A1A1A]" />
          </button>
          <h1 className="text-lg font-bold text-[#FF8C42] absolute left-1/2 -translate-x-1/2">NeuroVoice</h1>
          <button className="p-1">
            <Info size={24} className="text-[#1A1A1A]" />
          </button>
        </div>

        {/* Status Header */}
        <div className="text-center mb-8 animate-fade-in">
          <h2 className="text-3xl font-bold text-[#1A1A1A] mb-2">Analysis Complete</h2>
          <p className="text-[#6B6B6B] text-base">We've carefully reviewed your recent session.</p>
        </div>

        {/* Risk Ring */}
        <div className="flex flex-col items-center mb-8 animate-fade-in" style={{ animationDelay: "0.1s" }}>
          <div className="relative w-56 h-56 mb-4">
            <svg viewBox="0 0 224 224" className="w-full h-full -rotate-90">
              <circle cx="112" cy="112" r="96" fill="none" stroke="#F0F0F0" strokeWidth="20" />
              <circle
                cx="112" cy="112" r="96"
                fill="none"
                stroke={riskColorMap[result.level]}
                strokeWidth="20"
                strokeLinecap="round"
                strokeDasharray={`${result.percentage * 6.03} 603`}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-6xl font-bold" style={{ color: riskColorMap[result.level] }}>{result.percentage}%</span>
            </div>
          </div>
          <div className="px-5 py-2 rounded-full text-sm font-bold uppercase tracking-wide" style={{ 
            backgroundColor: riskBgMap[result.level],
            color: riskColorMap[result.level]
          }}>
            {result.level} Risk
          </div>
        </div>

        {/* Insight Message */}
        <div className="bg-white rounded-3xl p-5 text-center mb-6 shadow-sm animate-fade-in" style={{ animationDelay: "0.15s" }}>
          <p className="text-sm text-[#6B6B6B] leading-relaxed">
            {result.level === 'Low' 
              ? 'Your patterns show healthy facial movement and expression. Keep up the good work!'
              : result.level === 'Medium'
              ? 'Your patterns suggest some variations. Let\'s look closer at the details below.'
              : 'Your patterns suggest moderate fatigue levels. Let\'s look closer at the details below.'}
          </p>
        </div>

        {/* Metrics Grid — only measured signals (blink rate, facial motion, asymmetry) */}
        <div className="grid grid-cols-2 gap-3 mb-8 animate-fade-in" style={{ animationDelay: "0.2s" }}>
          {/* Blink Rate */}
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Eye size={20} className="text-[#7B68EE]" />
            </div>
            <p className="text-xs font-semibold text-[#6B6B6B] uppercase tracking-wide mb-1">Blink Rate</p>
            <p className="text-2xl font-bold text-[#1A1A1A] mb-1">{result.details.blinkRate.toFixed(0)}<span className="text-sm font-normal text-[#6B6B6B]">/min</span></p>
            <p className="text-xs" style={{ color: result.details.blinkRate >= 12 ? '#5DBEA3' : '#FF8C42' }}>
              {result.details.blinkRate >= 12 ? 'Normal (≥12)' : 'Reduced'}
            </p>
          </div>

          {/* Facial Motion / hypomimia */}
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Activity size={20} className="text-[#FF8C42]" />
            </div>
            <p className="text-xs font-semibold text-[#6B6B6B] uppercase tracking-wide mb-1">Facial Motion</p>
            <p className="text-2xl font-bold text-[#1A1A1A] mb-1">{result.details.motion >= 1.5 ? 'Normal' : result.details.motion >= 0.9 ? 'Reduced' : 'Very low'}</p>
            <p className="text-xs" style={{ color: result.details.motion >= 1.5 ? '#5DBEA3' : '#FF8C42' }}>
              Expression amplitude
            </p>
          </div>

          {/* Asymmetry */}
          <div className="bg-white rounded-2xl p-4 shadow-sm col-span-2">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp size={20} className="text-[#5DBEA3]" />
            </div>
            <p className="text-xs font-semibold text-[#6B6B6B] uppercase tracking-wide mb-1">Facial Asymmetry</p>
            <p className="text-2xl font-bold text-[#1A1A1A] mb-1">{(result.details.asymmetry * 100).toFixed(1)}%</p>
            <p className="text-xs" style={{ color: result.details.asymmetry < 0.035 ? '#5DBEA3' : '#FF8C42' }}>
              {result.details.asymmetry < 0.035 ? 'Symmetric' : 'Mild asymmetry'}
            </p>
          </div>
        </div>

        {/* Honest note about what is not measured */}
        <div className="bg-[#FFF4E6] rounded-2xl p-4 mb-8 flex items-start gap-3">
          <Info size={16} className="text-[#FF8C42] flex-shrink-0 mt-0.5" />
          <p className="text-xs text-[#6B6B6B] leading-relaxed">
            This scan measures blink rate, facial expression amplitude, and symmetry from your camera.
            Heart rate and breathing are not measured. This is a screening tool, not a diagnosis.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-3 animate-fade-in" style={{ animationDelay: "0.25s" }}>
          <button
            onClick={() => navigate("/insights")}
            className="w-full bg-[#FF8C42] hover:bg-[#FF7A2E] text-white font-bold text-base rounded-full py-4 flex items-center justify-center gap-2 shadow-lg active:scale-[0.98] transition-all"
          >
            <TrendingUp size={20} />
            View Insights
          </button>
          <button
            onClick={() => {}}
            className="w-full bg-white border-2 border-[#E0E0E0] text-[#1A1A1A] font-bold text-base rounded-full py-4 flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
          >
            <Share2 size={20} />
            Share Report
          </button>
        </div>
      </div>

      <BottomNav />
    </div>
  );
};

export default FaceTest;
