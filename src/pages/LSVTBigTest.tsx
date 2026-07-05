import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, TrendingUp } from "lucide-react";
import BottomNav from "@/components/BottomNav";
import { addTestRecord } from "@/utils/testHistory";

declare global { interface Window { Pose: any; Camera: any; } }

type Phase = "intro" | "running" | "result";
interface Particle { x:number;y:number;vx:number;vy:number;size:number;color:string;life:number;rot:number;rotV:number; }

const PCOLS=['#22d3ee','#f0abfc','#fbbf24','#34d399','#f87171','#a78bfa','#d6fa61','#fff'];
const CONNECTIONS=[[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28]];

// Spawn offsets in normalised pose space relative to shoulder midpoint.
// Just beyond comfortable reach so the user must stretch.
const SPAWN_OFFSETS = [
  { dx:  0.00, dy: -0.45, label: 'Reach UP ⬆️' },
  { dx: -0.48, dy:  0.00, label: 'Reach LEFT ⬅️' },
  { dx:  0.48, dy:  0.00, label: 'Reach RIGHT ➡️' },
  { dx: -0.34, dy: -0.34, label: 'UP-LEFT ↖️' },
  { dx:  0.34, dy: -0.34, label: 'UP-RIGHT ↗️' },
  { dx: -0.48, dy:  0.22, label: 'LOW-LEFT ↙️' },
  { dx:  0.48, dy:  0.22, label: 'LOW-RIGHT ↘️' },
];

const HIT_PX = 62;    // generous hit radius in pixels
const HIT_COOLDOWN = 25; // frames before next hit can register

const LSVTBigTest = () => {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("intro");
  const [score, setScore] = useState(0);
  const [stars, setStars] = useState(0);
  const [hits, setHits] = useState(0);
  const [level, setLevel] = useState(1);
  const [timerVal, setTimerVal] = useState("0s / 30s");
  const [targetLabel, setTargetLabel] = useState("—");
  const [resultData, setResultData] = useState<any>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mpCameraRef = useRef<any>(null);
  const rafRef = useRef<number>(0);
  const runningRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval>|null>(null);
  const gameTimeRef = useRef(0);
  const scoreRef = useRef(0);
  const starsRef = useRef(0);
  const hitsRef = useRef(0);
  const levelRef = useRef(1);
  const particlesRef = useRef<Particle[]>([]);
  const pulseRef = useRef(0);
  const lastLmRef = useRef<any>(null);
  const spawnIdxRef = useRef(0);
  const hitCooldownRef = useRef(0);
  // Reach amplitude (LSVT BIG's therapeutic target): wrist-to-shoulder
  // excursion normalised by shoulder width, captured at each hit.
  const reachSumRef = useRef(0);
  const reachMaxRef = useRef(0);

  const burst = useCallback((x:number, y:number, count=32) => {
    for (let i=0; i<count; i++) {
      const a=Math.random()*Math.PI*2, sp=4+Math.random()*12;
      particlesRef.current.push({
        x, y, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp-4,
        size:5+Math.random()*14, color:PCOLS[Math.floor(Math.random()*PCOLS.length)],
        life:1, rot:Math.random()*Math.PI*2, rotV:(Math.random()-0.5)*0.3
      });
    }
  }, []);

  const pickNextSpawn = useCallback((currentIdx: number) => {
    let next = Math.floor(Math.random() * SPAWN_OFFSETS.length);
    while (next === currentIdx) next = Math.floor(Math.random() * SPAWN_OFFSETS.length);
    spawnIdxRef.current = next;
    setTargetLabel(SPAWN_OFFSETS[next].label);
  }, []);

  const registerHit = useCallback((sx: number, sy: number, reachAmp: number) => {
    hitsRef.current++;
    reachSumRef.current += reachAmp;
    reachMaxRef.current = Math.max(reachMaxRef.current, reachAmp);
    scoreRef.current += 10 + levelRef.current * 5;
    hitCooldownRef.current = HIT_COOLDOWN;
    burst(sx, sy, 36);
    const ns = Math.min(5, Math.floor(hitsRef.current / 3));
    if (ns > starsRef.current) {
      starsRef.current = ns;
      setStars(ns);
      const c = canvasRef.current;
      if (c) burst(c.width * 0.5, c.height * 0.3, 20);
    }
    if (hitsRef.current % 9 === 0) { levelRef.current++; setLevel(levelRef.current); }
    setHits(hitsRef.current);
    setScore(scoreRef.current);
    pickNextSpawn(spawnIdxRef.current);
  }, [burst, pickNextSpawn]);

  const renderLoop = useCallback(() => {
    rafRef.current = requestAnimationFrame(renderLoop);
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    // Particles
    particlesRef.current = particlesRef.current.filter(p => {
      p.x+=p.vx; p.y+=p.vy; p.vy+=0.28; p.life-=0.019; p.rot+=p.rotV;
      if (p.life <= 0) return false;
      ctx.save(); ctx.globalAlpha=p.life; ctx.translate(p.x,p.y); ctx.rotate(p.rot);
      ctx.fillStyle=p.color; ctx.shadowColor=p.color; ctx.shadowBlur=12;
      ctx.beginPath();
      for (let i=0;i<8;i++) {
        const r=i%2===0?p.size:p.size*0.4, ang=(i*Math.PI)/4;
        i===0?ctx.moveTo(Math.cos(ang)*r,Math.sin(ang)*r):ctx.lineTo(Math.cos(ang)*r,Math.sin(ang)*r);
      }
      ctx.closePath(); ctx.fill(); ctx.restore();
      return true;
    });

    if (!runningRef.current || !lastLmRef.current) return;
    pulseRef.current += 0.06;
    if (hitCooldownRef.current > 0) hitCooldownRef.current--;

    const lm = lastLmRef.current;

    // Skeleton
    ctx.save();
    CONNECTIONS.forEach(([a,b]) => {
      const pa=lm[a], pb=lm[b];
      if (!pa||!pb||pa.visibility<0.3||pb.visibility<0.3) return;
      ctx.beginPath(); ctx.strokeStyle='rgba(214,250,97,0.5)'; ctx.shadowColor='#d6fa61';
      ctx.shadowBlur=6; ctx.lineWidth=2.5;
      ctx.moveTo((1-pa.x)*W, pa.y*H); ctx.lineTo((1-pb.x)*W, pb.y*H); ctx.stroke();
    });
    [11,12,13,14,15,16,23,24].forEach(i => {
      const p=lm[i]; if (!p||p.visibility<0.3) return;
      ctx.beginPath(); ctx.arc((1-p.x)*W, p.y*H, 5, 0, Math.PI*2);
      ctx.fillStyle='#d6fa61'; ctx.shadowColor='#d6fa61'; ctx.shadowBlur=10; ctx.fill();
    });
    ctx.restore();

    // Star position: shoulder midpoint + spawn offset, recalculated every frame
    // so it stays body-relative as the person moves around
    const ls=lm[11], rs=lm[12];
    if (!ls||!rs||ls.visibility<0.3||rs.visibility<0.3) return;
    const midNx = (ls.x + rs.x) / 2;
    const midNy = (ls.y + rs.y) / 2;
    const off = SPAWN_OFFSETS[spawnIdxRef.current];
    // x is mirrored on canvas
    const sx = (1 - (midNx + off.dx)) * W;
    const sy = (midNy + off.dy) * H;

    // Wrist positions in canvas pixels
    const lw=lm[15], rw=lm[16];
    const lwx = lw&&lw.visibility>0.25 ? (1-lw.x)*W : -9999;
    const lwy = lw&&lw.visibility>0.25 ? lw.y*H : -9999;
    const rwx = rw&&rw.visibility>0.25 ? (1-rw.x)*W : -9999;
    const rwy = rw&&rw.visibility>0.25 ? rw.y*H : -9999;

    const ldist = Math.sqrt((lwx-sx)**2+(lwy-sy)**2);
    const rdist = Math.sqrt((rwx-sx)**2+(rwy-sy)**2);
    const touching = (ldist < HIT_PX || rdist < HIT_PX) && hitCooldownRef.current === 0;

    // Reach amplitude of the reaching hand, normalised by shoulder width so it
    // is scale/distance invariant. This is the actual amplitude-training metric.
    const shoulderW = Math.hypot(ls.x - rs.x, ls.y - rs.y) || 0.001;
    const reaching = ldist <= rdist ? lm[15] : lm[16];
    const reachAmp = reaching && reaching.visibility > 0.25
      ? Math.hypot(reaching.x - midNx, reaching.y - midNy) / shoulderW
      : 0;

    // Draw star ring
    const outerR = 54 + Math.sin(pulseRef.current) * 8;
    const innerR = 40 + Math.sin(pulseRef.current) * 5;
    ctx.save();
    if (touching) {
      ctx.beginPath(); ctx.arc(sx,sy,outerR,0,Math.PI*2);
      ctx.strokeStyle='#34d399'; ctx.shadowColor='#34d399'; ctx.shadowBlur=55;
      ctx.lineWidth=4; ctx.globalAlpha=0.7; ctx.stroke();
      ctx.beginPath(); ctx.arc(sx,sy,innerR,0,Math.PI*2);
      ctx.strokeStyle='#34d399'; ctx.shadowBlur=30; ctx.lineWidth=5; ctx.globalAlpha=1; ctx.stroke();
      ctx.globalAlpha=0.25; ctx.fillStyle='#34d399'; ctx.fill();
    } else {
      ctx.beginPath(); ctx.arc(sx,sy,outerR,0,Math.PI*2);
      ctx.strokeStyle='rgba(251,191,36,0.4)'; ctx.shadowColor='#fbbf24'; ctx.shadowBlur=30;
      ctx.lineWidth=2; ctx.globalAlpha=0.6; ctx.stroke();
      ctx.beginPath(); ctx.arc(sx,sy,innerR,0,Math.PI*2);
      ctx.strokeStyle='rgba(251,191,36,0.85)'; ctx.shadowColor='#fbbf24'; ctx.shadowBlur=20;
      ctx.lineWidth=2.5; ctx.setLineDash([8,5]); ctx.globalAlpha=1; ctx.stroke(); ctx.setLineDash([]);
    }
    // Star shape
    ctx.globalAlpha = touching ? 1 : 0.95;
    ctx.fillStyle = touching ? '#34d399' : '#fbbf24';
    ctx.shadowColor = touching ? '#34d399' : '#fbbf24';
    ctx.shadowBlur = 24;
    ctx.beginPath();
    for (let i=0;i<10;i++) {
      const ra=i%2===0?22:9, ang=(i*Math.PI)/5-Math.PI/2;
      i===0?ctx.moveTo(sx+Math.cos(ang)*ra,sy+Math.sin(ang)*ra):ctx.lineTo(sx+Math.cos(ang)*ra,sy+Math.sin(ang)*ra);
    }
    ctx.closePath(); ctx.fill();
    ctx.restore();

    // Wrist cursors
    [[lwx,lwy,ldist],[rwx,rwy,rdist]].forEach(([wx,wy,dist]) => {
      if (wx < -100) return;
      const inRange = dist < HIT_PX;
      ctx.save(); ctx.beginPath(); ctx.arc(wx,wy,24,0,Math.PI*2);
      ctx.strokeStyle = inRange ? '#34d399' : 'rgba(133,200,255,0.85)';
      ctx.shadowColor = inRange ? '#34d399' : '#85c8ff';
      ctx.shadowBlur = inRange ? 40 : 14;
      ctx.lineWidth=3; ctx.globalAlpha=0.9; ctx.stroke();
      if (inRange) { ctx.globalAlpha=0.2; ctx.fillStyle='#34d399'; ctx.fill(); }
      ctx.restore();
    });

    // Direction hint
    ctx.save(); ctx.font='bold 16px monospace'; ctx.fillStyle='#d6fa61';
    ctx.shadowColor='#d6fa61'; ctx.shadowBlur=12; ctx.textAlign='center';
    ctx.fillText(off.label, W/2, H-18); ctx.restore();

    // Register hit instantly on touch
    if (touching) registerHit(sx, sy, reachAmp);
  }, [registerHit]);

  useEffect(() => {
    let mounted = true;
    const loadScript = (src:string):Promise<void> => new Promise((res,rej) => {
      if (document.querySelector(`script[src="${src}"]`)) { res(); return; }
      const s = document.createElement('script'); s.src=src; s.crossOrigin='anonymous';
      s.onload=()=>res(); s.onerror=()=>rej(); document.head.appendChild(s);
    });
    (async () => {
      await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js');
      await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/pose/pose.js');
      if (!mounted || !videoRef.current) return;
      const pose = new window.Pose({ locateFile:(f:string)=>`https://cdn.jsdelivr.net/npm/@mediapipe/pose/${f}` });
      pose.setOptions({ modelComplexity:1, smoothLandmarks:true, minDetectionConfidence:0.5, minTrackingConfidence:0.5 });
      pose.onResults((res:any) => { if (res.poseLandmarks) lastLmRef.current = res.poseLandmarks; });
      const cam = new window.Camera(videoRef.current, {
        onFrame: async () => { if (videoRef.current?.videoWidth) await pose.send({ image: videoRef.current }); },
        width: 1280, height: 720,
      });
      mpCameraRef.current = cam; await cam.start();
    })();
    rafRef.current = requestAnimationFrame(renderLoop);
    const resize = () => {
      const c=canvasRef.current, cont=containerRef.current;
      if (c&&cont) { const r=cont.getBoundingClientRect(); c.width=r.width; c.height=r.height; }
    };
    resize(); window.addEventListener('resize', resize);
    return () => {
      mounted=false; cancelAnimationFrame(rafRef.current);
      try { mpCameraRef.current?.stop(); } catch {}
      window.removeEventListener('resize', resize);
    };
  }, [renderLoop]);

  const startGame = () => {
    scoreRef.current=0; starsRef.current=0; hitsRef.current=0; levelRef.current=1;
    gameTimeRef.current=0; particlesRef.current=[]; hitCooldownRef.current=0; spawnIdxRef.current=0;
    reachSumRef.current=0; reachMaxRef.current=0;
    setScore(0); setStars(0); setHits(0); setLevel(1); setTimerVal('0s / 30s');
    setTargetLabel(SPAWN_OFFSETS[0].label);
    runningRef.current=true; setPhase('running');
    timerRef.current = setInterval(() => {
      gameTimeRef.current++;
      setTimerVal(`${gameTimeRef.current}s / 30s`);
      if (gameTimeRef.current >= 30) endGame();
    }, 1000);
  };

  const endGame = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    runningRef.current = false;
    const h = hitsRef.current;
    const avgReach = h > 0 ? reachSumRef.current / h : 0;
    // Combine reach count and reach amplitude: good LSVT BIG performance means
    // many hits AND large, exaggerated reaches (avg reach ≳ 1.0 shoulder-widths).
    const perfLevel = (h >= 7 && avgReach >= 0.9) ? 'HIGH'
      : (h >= 3) ? 'MEDIUM' : 'LOW';

    // Persist as a therapy record. LSVT BIG is amplitude training, not a
    // diagnostic screen, so combinedRisk intentionally ignores this type.
    // We store a "performance" score (higher perf = lower nominal risk value).
    try {
      addTestRecord({
        type: 'LSVT_BIG',
        name: 'LSVT BIG Training',
        riskScore: perfLevel === 'HIGH' ? 0.15 : perfLevel === 'MEDIUM' ? 0.5 : 0.85,
        riskLevel: perfLevel === 'HIGH' ? 'Low' : perfLevel === 'MEDIUM' ? 'Medium' : 'High',
        metadata: { hits: h, avgReach, maxReach: reachMaxRef.current },
      });
    } catch (e) { console.error('addTestRecord error:', e); }

    setResultData({ hits:h, perfLevel, score:scoreRef.current, stars:starsRef.current, level:levelRef.current, avgReach, maxReach:reachMaxRef.current });
    setPhase('result');
  };

  if (phase === 'result' && resultData) {
    const { hits:h, perfLevel, score:sc, stars:st, level:lv, avgReach, maxReach } = resultData;
    const riskColor = perfLevel==='HIGH'?'#5DBEA3':perfLevel==='MEDIUM'?'#FF9F43':'#FF5A5A';
    const riskBg = perfLevel==='HIGH'?'#D4F1E8':perfLevel==='MEDIUM'?'#FFF3E0':'#FFE8E8';
    const pct = perfLevel==='HIGH'?85:perfLevel==='MEDIUM'?55:20;
    return (
      <div className="min-h-screen bg-[#EFEBE6] pb-24">
        <div className="max-w-md mx-auto px-5 pt-4">
          <div className="flex items-center justify-between mb-8 relative">
            <button onClick={()=>navigate('/home')} className="p-1 -ml-1"><ArrowLeft size={24} className="text-[#1A1A1A]"/></button>
            <h1 className="text-lg font-bold text-[#FF8C42] absolute left-1/2 -translate-x-1/2">NeuroVoice</h1>
            <div className="w-6"/>
          </div>
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-[#1A1A1A] mb-2">Session Complete!</h2>
            <p className="text-[#6B6B6B] text-base">Your LSVT BIG amplitude training results.</p>
          </div>
          <div className="flex flex-col items-center mb-8">
            <div className="relative w-56 h-56 mb-4">
              <svg viewBox="0 0 224 224" className="w-full h-full -rotate-90">
                <circle cx="112" cy="112" r="80" fill="none" stroke="#F0F0F0" strokeWidth="20"/>
                <circle cx="112" cy="112" r="80" fill="none" stroke={riskColor} strokeWidth="20"
                  strokeLinecap="round" strokeDasharray={`${pct*5.03} 503`}/>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-5xl font-bold" style={{color:riskColor}}>{h}</span>
                <span className="text-sm text-[#6B6B6B]">hits</span>
              </div>
            </div>
            <div className="px-5 py-2 rounded-full text-sm font-bold uppercase tracking-wide"
              style={{backgroundColor:riskBg,color:riskColor}}>{perfLevel} Performance</div>
          </div>
          <div className="bg-white rounded-3xl p-5 text-center mb-6 shadow-sm">
            <p className="text-sm text-[#6B6B6B] leading-relaxed">
              {h<3?'Keep practicing — reach your hand all the way to the star!':
               h<7?'Good effort! Try to reach each star faster.':
               'Excellent amplitude training session! Your movement quality is strong.'}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-white rounded-2xl p-4 shadow-sm text-center">
              <p className="text-2xl font-bold text-[#1A1A1A]">{h}</p>
              <p className="text-xs text-[#6B6B6B] mt-1">Stars Hit</p>
            </div>
            <div className="bg-white rounded-2xl p-4 shadow-sm text-center">
              <p className="text-2xl font-bold text-[#1A1A1A]">{sc}</p>
              <p className="text-xs text-[#6B6B6B] mt-1">Score</p>
            </div>
            <div className="bg-white rounded-2xl p-4 shadow-sm text-center">
              <p className="text-2xl font-bold text-[#1A1A1A]">{lv}</p>
              <p className="text-xs text-[#6B6B6B] mt-1">Level</p>
            </div>
          </div>

          {/* Reach amplitude — the therapeutic target of LSVT BIG */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="bg-white rounded-2xl p-4 shadow-sm text-center">
              <p className="text-2xl font-bold" style={{color:(avgReach ?? 0)>=0.9?'#5DBEA3':'#FF8C42'}}>{(avgReach ?? 0).toFixed(2)}</p>
              <p className="text-xs text-[#6B6B6B] mt-1">Avg Reach (shoulder-widths)</p>
            </div>
            <div className="bg-white rounded-2xl p-4 shadow-sm text-center">
              <p className="text-2xl font-bold text-[#1A1A1A]">{(maxReach ?? 0).toFixed(2)}</p>
              <p className="text-xs text-[#6B6B6B] mt-1">Max Reach</p>
            </div>
          </div>
          {st > 0 && (
            <div className="bg-white rounded-3xl p-4 mb-6 shadow-sm text-center">
              <p className="text-xs font-semibold text-[#6B6B6B] uppercase tracking-wide mb-2">Stars Earned</p>
              <p className="text-3xl">{'⭐'.repeat(st)}</p>
            </div>
          )}
          <div className="bg-white rounded-3xl p-5 mb-6 shadow-sm">
            <p className="text-sm font-bold text-[#1A1A1A] mb-3">Scoring Guide</p>
            {[
              {label:'7+ hits',level:'High',color:'#5DBEA3',bg:'#D4F1E8'},
              {label:'3–6 hits',level:'Medium',color:'#FF9F43',bg:'#FFF3E0'},
              {label:'0–2 hits',level:'Low',color:'#FF5A5A',bg:'#FFE8E8'},
            ].map(({label,level,color,bg})=>(
              <div key={label} className="flex items-center justify-between mb-2">
                <span className="text-sm text-[#6B6B6B]">{label}</span>
                <span className="text-xs font-bold px-3 py-1 rounded-full"
                  style={{backgroundColor:bg,color}}>{level} Performance</span>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-3">
            <button onClick={()=>navigate('/insights')}
              className="w-full bg-[#FF8C42] hover:bg-[#FF7A2E] text-white font-bold text-base rounded-full py-4 flex items-center justify-center gap-2 shadow-lg active:scale-[0.98] transition-all">
              <TrendingUp size={20}/> View Insights
            </button>
            <button onClick={()=>{setPhase('intro');setTimerVal('0s / 30s');setScore(0);setStars(0);setHits(0);setLevel(1);}}
              className="w-full bg-white border-2 border-[#E0E0E0] text-[#1A1A1A] font-bold text-base rounded-full py-4 active:scale-[0.98] transition-all">
              Play Again
            </button>
          </div>
        </div>
        <BottomNav/>
      </div>
    );
  }

  return (
    <div style={{minHeight:'100vh',background:'linear-gradient(135deg,#0f0f23 0%,#1a1a2e 100%)',color:'#fff',
      fontFamily:'Menlo,Monaco,Consolas,monospace',display:'flex',alignItems:'center',
      justifyContent:'center',overflow:'hidden',position:'relative'}}>

      {/* HUD */}
      <div style={{position:'fixed',top:12,left:12,width:'clamp(140px,40vw,240px)',zIndex:50,background:'rgba(17,24,39,0.92)',
        backdropFilter:'blur(12px)',borderRadius:12,padding:'clamp(10px,3vw,20px)',border:'1px solid rgba(214,250,97,0.4)',
        boxShadow:'0 0 30px rgba(214,250,97,0.25)',fontSize:'clamp(11px,3vw,14px)'}}>
        <div style={{fontSize:13,fontWeight:700,color:'#d6fa61',marginBottom:4}}>🌟 LSVT BIG Training</div>
        <div style={{fontSize:11,color:'#6b7280',marginBottom:14}}>Amplitude Therapy</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,textAlign:'center'}}>
          <div><div style={{fontSize:26,fontWeight:'bold',color:'#d6fa61'}}>{score}</div><div style={{fontSize:12,color:'#9ca3af'}}>Score</div></div>
          <div><div style={{fontSize:26,fontWeight:'bold',color:'#fbbf24'}}>⭐ {stars}</div><div style={{fontSize:12,color:'#9ca3af'}}>Stars</div></div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,textAlign:'center',marginTop:10}}>
          <div><div style={{fontSize:22,fontWeight:'bold',color:'#34d399'}}>{hits}</div><div style={{fontSize:12,color:'#9ca3af'}}>Hits</div></div>
          <div><div style={{fontSize:22,fontWeight:'bold',color:'#85c8ff'}}>{level}</div><div style={{fontSize:12,color:'#9ca3af'}}>Level</div></div>
        </div>
        <div style={{background:'rgba(255,255,255,0.05)',borderRadius:8,padding:'10px 12px',marginTop:10,
          border:'1px solid rgba(255,255,255,0.08)'}}>
          <div style={{fontSize:11,color:'#9ca3af',marginBottom:4,textTransform:'uppercase',letterSpacing:'0.05em'}}>Target</div>
          <div style={{fontSize:14,fontWeight:700,color:'#fbbf24'}}>{targetLabel}</div>
        </div>
        <div style={{marginTop:14,textAlign:'center',fontSize:12,color:'#6b7280'}}>
          Time: <span style={{color:'#d6fa61'}}>{timerVal}</span>
        </div>
        <div style={{marginTop:10,fontSize:11,color:'#6b7280',textAlign:'center',lineHeight:1.5}}>
          Hover your palm over the ⭐ to score
        </div>
      </div>

      {/* Game container — fills the screen; HUD overlays on top so it works on
          phone widths as well as desktop. */}
      <div ref={containerRef} style={{position:'relative',width:'100%',
        height:'100vh',maxWidth:1200,border:'1px solid rgba(214,250,97,0.5)',
        overflow:'hidden',background:'#1b2337',
        boxShadow:'0 0 25px rgba(214,250,97,0.3)'}}>
        <video ref={videoRef} autoPlay muted playsInline
          style={{width:'100%',height:'100%',objectFit:'cover',transform:'scaleX(-1)'}}/>
        <canvas ref={canvasRef}
          style={{position:'absolute',top:0,left:0,width:'100%',height:'100%',pointerEvents:'none'}}/>
      </div>

      {/* Intro overlay */}
      {phase === 'intro' && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.95)',display:'flex',
          alignItems:'center',justifyContent:'center',zIndex:60}}>
          <div style={{background:'#111827',borderRadius:16,padding:'clamp(20px,5vw,40px)',
            border:'2px solid rgba(214,250,97,0.3)',textAlign:'center',width:'min(90vw,520px)',maxHeight:'90vh',overflowY:'auto'}}>
            <div style={{fontSize:48,marginBottom:12}}>🌟</div>
            <h2 style={{fontSize:30,fontWeight:'bold',marginBottom:16,color:'#d6fa61'}}>LSVT BIG Training</h2>
            <p style={{color:'#d1d5db',marginBottom:24,lineHeight:1.8,fontSize:14}}>
              A glowing <b style={{color:'#fbbf24'}}>⭐ star</b> will appear just beyond your body.<br/><br/>
              <b style={{color:'#34d399'}}>Reach out and hover your palm over it</b> — it scores instantly on touch.<br/>
              The star jumps to a new position after each hit.<br/><br/>
              <em style={{color:'#9ca3af'}}>Bigger, more exaggerated movements are better for therapy.</em>
            </p>
            <button onClick={startGame} style={{display:'block',width:'100%',padding:14,border:'none',
              borderRadius:8,fontWeight:'bold',fontSize:16,color:'#000',cursor:'pointer',
              background:'linear-gradient(90deg,#d6fa61,#85c8ff)'}}>
              Start Training
            </button>
            <button onClick={()=>navigate('/home')}
              style={{marginTop:12,background:'none',border:'none',color:'#6b7280',cursor:'pointer',fontSize:13}}>
              ← Back to Home
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default LSVTBigTest;
