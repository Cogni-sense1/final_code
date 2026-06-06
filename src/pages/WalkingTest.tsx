import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, TrendingUp, Share2 } from "lucide-react";
import BottomNav from "@/components/BottomNav";

declare global { interface Window { Pose: any; Camera: any; } }

type Phase = "intro" | "running" | "result";

interface Particle { x:number;y:number;vx:number;vy:number;size:number;color:string;life:number;rot:number;rotV:number; }

const PCOLS = ['#22d3ee','#f0abfc','#fbbf24','#34d399','#f87171','#a78bfa','#fff'];
const ARM_WIN=30, STRIDE_WIN=30, VEL_WIN=15;
const CONNECTIONS:number[][] = [[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28]];

const WalkingTest = () => {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("intro");
  const [score, setScore] = useState(0);
  const [stars, setStars] = useState(0);
  const [timerVal, setTimerVal] = useState("0s / 30s");
  const [armSwing, setArmSwing] = useState({ text:"Measuring…", cls:"ok" });
  const [stepLen, setStepLen] = useState({ text:"Measuring…", cls:"ok" });
  const [walkSpeed, setWalkSpeed] = useState({ text:"Measuring…", cls:"ok" });
  const [trunkPost, setTrunkPost] = useState({ text:"Measuring…", cls:"ok" });
  const [flags, setFlags] = useState({ asym:false, shuffle:false, brady:false, stoop:false, turn:false });
  const [flagCount, setFlagCount] = useState(0);
  const [resultData, setResultData] = useState<any>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mpCameraRef = useRef<any>(null);
  const rafRef = useRef<number>(0);
  const runningRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval>|null>(null);
  const testTimeRef = useRef(0);
  const scoreRef = useRef(0);
  const starsRef = useRef(0);
  const particlesRef = useRef<Particle[]>([]);
  const pulseRef = useRef(0);
  const lastLmRef = useRef<any>(null);

  // Buffers
  const leftWristBuf = useRef<number[]>([]);
  const rightWristBuf = useRef<number[]>([]);
  const ankleGapBuf = useRef<number[]>([]);
  const hipVelBuf = useRef<number[]>([]);
  const prevHipX = useRef<number|null>(null);
  const shoulderWidthBuf = useRef<number[]>([]);
  const turnActive = useRef(false);
  const turnStepCount = useRef(0);
  const metricsRef = useRef({ asymmetryRatio:0, shuffling:false, bradykinesia:false, trunkAngle:0, stooped:false, impaired_turn:false, flagCount:0 });
  const flagsRef = useRef({ asym:false, shuffle:false, brady:false, stoop:false, turn:false });

  // Detailed metrics for result screen
  const detailRef = useRef({
    leftArmRangeMax: 0, rightArmRangeMax: 0,
    legRaiseMax: 0,       // max ankle-above-hip distance
    avgStepGap: 0,
    avgHipVel: 0,
    trunkAngleFinal: 0,
    asymmetryRatioFinal: 0,
  });

  const burst = useCallback((x:number, y:number) => {
    const canvas = canvasRef.current; if(!canvas) return;
    for(let i=0;i<22;i++){
      const a=Math.random()*Math.PI*2, sp=3+Math.random()*9;
      particlesRef.current.push({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-3,size:4+Math.random()*12,color:PCOLS[Math.floor(Math.random()*PCOLS.length)],life:1,rot:Math.random()*Math.PI*2,rotV:(Math.random()-0.5)*0.3});
    }
  }, []);

  const awardPoints = useCallback((pts:number) => {
    scoreRef.current += pts;
    setScore(scoreRef.current);
    const ns = Math.min(5, Math.floor(scoreRef.current/20));
    if(ns > starsRef.current){
      starsRef.current = ns;
      setStars(ns);
      const canvas = canvasRef.current;
      if(canvas) burst(canvas.width*0.5, canvas.height*0.3);
    }
  }, [burst]);

  const updateFlags = useCallback((f: typeof flagsRef.current) => {
    flagsRef.current = f;
    setFlags({...f});
    const count = [f.asym,f.shuffle,f.brady,f.stoop,f.turn].filter(Boolean).length;
    metricsRef.current.flagCount = count;
    setFlagCount(count);
  }, []);

  const onPoseResults = useCallback((res:any) => {
    if(!res.poseLandmarks || !runningRef.current) return;
    const lm = res.poseLandmarks;
    lastLmRef.current = lm;

    // Arm swing — track range per arm
    const lw=lm[15],rw=lm[16],ls=lm[11],rs=lm[12];
    const lRel=lw.y-ls.y, rRel=rw.y-rs.y;
    leftWristBuf.current.push(lRel); rightWristBuf.current.push(rRel);
    if(leftWristBuf.current.length>ARM_WIN){leftWristBuf.current.shift();rightWristBuf.current.shift();}
    if(leftWristBuf.current.length>=ARM_WIN){
      const lRange=Math.max(...leftWristBuf.current)-Math.min(...leftWristBuf.current);
      const rRange=Math.max(...rightWristBuf.current)-Math.min(...rightWristBuf.current);
      const maxR=Math.max(lRange,rRange)+1e-6;
      const ratio=Math.abs(lRange-rRange)/maxR;
      metricsRef.current.asymmetryRatio=ratio;
      detailRef.current.leftArmRangeMax=Math.max(detailRef.current.leftArmRangeMax, lRange);
      detailRef.current.rightArmRangeMax=Math.max(detailRef.current.rightArmRangeMax, rRange);
      detailRef.current.asymmetryRatioFinal=ratio;
      const flag=ratio>0.35;
      if(flag) awardPoints(5);
      setArmSwing({text:`Ratio: ${ratio.toFixed(2)}`,cls:flag?'bad':'ok'});
      updateFlags({...flagsRef.current, asym:flag});
    }

    // Step length + leg raise height
    const la=lm[27],ra=lm[28];
    const lh=lm[23],rh=lm[24];
    ankleGapBuf.current.push(Math.abs(la.x-ra.x));
    if(ankleGapBuf.current.length>STRIDE_WIN) ankleGapBuf.current.shift();
    const avgGap=ankleGapBuf.current.reduce((a,b)=>a+b,0)/ankleGapBuf.current.length;
    detailRef.current.avgStepGap=avgGap;
    const hipY=(lh.y+rh.y)/2;
    const legRaise=Math.max(0, hipY-la.y, hipY-ra.y);
    detailRef.current.legRaiseMax=Math.max(detailRef.current.legRaiseMax, legRaise);
    const shuffling=avgGap<0.12;
    setStepLen({text:`Avg gap: ${avgGap.toFixed(3)}`,cls:shuffling?'bad':'ok'});
    updateFlags({...flagsRef.current, shuffle:shuffling});

    // Walking speed
    const hipX=(lh.x+rh.x)/2;
    if(prevHipX.current!==null){
      hipVelBuf.current.push(Math.abs(hipX-prevHipX.current));
      if(hipVelBuf.current.length>VEL_WIN) hipVelBuf.current.shift();
      const avgVel=hipVelBuf.current.reduce((a,b)=>a+b,0)/hipVelBuf.current.length;
      detailRef.current.avgHipVel=avgVel;
      const brady=avgVel<0.005;
      setWalkSpeed({text:`Vel: ${avgVel.toFixed(4)}`,cls:brady?'warn':'ok'});
      updateFlags({...flagsRef.current, brady});
    }
    prevHipX.current=hipX;

    // Trunk angle
    const smx=(ls.x+rs.x)/2,smy=(ls.y+rs.y)/2;
    const hmx=(lh.x+rh.x)/2,hmy=(lh.y+rh.y)/2;
    const tvx=smx-hmx,tvy=smy-hmy;
    const mag=Math.sqrt(tvx**2+tvy**2)+1e-6;
    const trunkAngle=Math.acos(Math.max(-1,Math.min(1,(tvy*(-1))/mag)))*180/Math.PI;
    detailRef.current.trunkAngleFinal=trunkAngle;
    const stooped=trunkAngle>15;
    setTrunkPost({text:`${trunkAngle.toFixed(1)}°`,cls:stooped?'warn':'ok'});
    updateFlags({...flagsRef.current, stoop:stooped});

    // Turn quality
    const sw=Math.abs(ls.x-rs.x);
    shoulderWidthBuf.current.push(sw);
    if(shoulderWidthBuf.current.length>60) shoulderWidthBuf.current.shift();
    if(shoulderWidthBuf.current.length>=10){
      const recentAvg=shoulderWidthBuf.current.slice(-5).reduce((a,b)=>a+b,0)/5;
      const baseline=shoulderWidthBuf.current.slice(0,10).reduce((a,b)=>a+b,0)/10;
      const turningNow=recentAvg<baseline*0.65;
      if(turningNow&&!turnActive.current){turnActive.current=true;turnStepCount.current=0;}
      if(!turningNow&&turnActive.current){
        turnActive.current=false;
        const impaired=turnStepCount.current>3;
        updateFlags({...flagsRef.current, turn:impaired});
        if(impaired) awardPoints(5);
        const canvas=canvasRef.current;
        if(canvas) burst(canvas.width/2,canvas.height/2);
      }
      if(turnActive.current){
        if(la.y<lh.y-0.15) turnStepCount.current++;
        if(ra.y<rh.y-0.15) turnStepCount.current++;
      }
    }
  }, [awardPoints, updateFlags, burst]);

  // Render loop
  const renderLoop = useCallback(() => {
    rafRef.current = requestAnimationFrame(renderLoop);
    const canvas = canvasRef.current; if(!canvas) return;
    const ctx = canvas.getContext('2d'); if(!ctx) return;
    const W=canvas.width, H=canvas.height;
    ctx.clearRect(0,0,W,H);
    if(!runningRef.current) return;

    // Skeleton
    const lm = lastLmRef.current;
    if(lm){
      ctx.save(); ctx.lineWidth=3;
      CONNECTIONS.forEach(([a,b])=>{
        const pa=lm[a],pb=lm[b];
        if(!pa||!pb||pa.visibility<0.3||pb.visibility<0.3) return;
        ctx.beginPath(); ctx.strokeStyle='rgba(133,200,255,0.7)'; ctx.shadowColor='#85c8ff'; ctx.shadowBlur=8;
        ctx.moveTo((1-pa.x)*W,pa.y*H); ctx.lineTo((1-pb.x)*W,pb.y*H); ctx.stroke();
      });
      [11,12,13,14,15,16,23,24,25,26,27,28].forEach(i=>{
        const p=lm[i]; if(!p||p.visibility<0.3) return;
        ctx.beginPath(); ctx.arc((1-p.x)*W,p.y*H,5,0,Math.PI*2);
        ctx.fillStyle='#85c8ff'; ctx.shadowColor='#85c8ff'; ctx.shadowBlur=12; ctx.fill();
      });
      ctx.restore();
    }

    // Walking guide arrow
    pulseRef.current+=0.06;
    const alpha=0.4+Math.sin(pulseRef.current)*0.2;
    ctx.save(); ctx.globalAlpha=alpha;
    ctx.strokeStyle='#d6fa61'; ctx.shadowColor='#d6fa61'; ctx.shadowBlur=15; ctx.lineWidth=2.5;
    const ay=H*0.88;
    ctx.beginPath(); ctx.moveTo(W*0.15,ay); ctx.lineTo(W*0.85,ay);
    ctx.moveTo(W*0.78,ay-12); ctx.lineTo(W*0.85,ay); ctx.lineTo(W*0.78,ay+12); ctx.stroke();
    ctx.font='bold 13px monospace'; ctx.fillStyle='#d6fa61'; ctx.textAlign='center';
    ctx.fillText('Walk forward → turn → walk back',W/2,ay-18); ctx.restore();

    // Particles
    particlesRef.current = particlesRef.current.filter(p=>{
      p.x+=p.vx; p.y+=p.vy; p.vy+=0.28; p.life-=0.02; p.rot+=p.rotV;
      if(p.life<=0) return false;
      ctx.save(); ctx.globalAlpha=p.life; ctx.translate(p.x,p.y); ctx.rotate(p.rot);
      ctx.fillStyle=p.color; ctx.shadowColor=p.color; ctx.shadowBlur=10;
      ctx.beginPath();
      for(let i=0;i<8;i++){const r=i%2===0?p.size:p.size*0.4,ang=(i*Math.PI)/4;i===0?ctx.moveTo(Math.cos(ang)*r,Math.sin(ang)*r):ctx.lineTo(Math.cos(ang)*r,Math.sin(ang)*r);}
      ctx.closePath(); ctx.fill(); ctx.restore();
      return true;
    });
  }, []);

  useEffect(()=>{
    let mounted=true;
    const loadScript=(src:string):Promise<void>=>new Promise((res,rej)=>{
      if(document.querySelector(`script[src="${src}"]`)){res();return;}
      const s=document.createElement('script'); s.src=src; s.crossOrigin='anonymous';
      s.onload=()=>res(); s.onerror=()=>rej(); document.head.appendChild(s);
    });
    (async()=>{
      await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js');
      await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/pose/pose.js');
      if(!mounted||!videoRef.current) return;
      const pose=new window.Pose({locateFile:(f:string)=>`https://cdn.jsdelivr.net/npm/@mediapipe/pose/${f}`});
      pose.setOptions({modelComplexity:1,smoothLandmarks:true,minDetectionConfidence:0.5,minTrackingConfidence:0.5});
      pose.onResults(onPoseResults);
      const cam=new window.Camera(videoRef.current,{
        onFrame:async()=>{if(videoRef.current?.videoWidth) await pose.send({image:videoRef.current});},
        width:1280,height:720
      });
      mpCameraRef.current=cam; await cam.start();
    })();
    rafRef.current=requestAnimationFrame(renderLoop);
    const resize=()=>{
      const c=canvasRef.current,cont=containerRef.current;
      if(c&&cont){const r=cont.getBoundingClientRect();c.width=r.width;c.height=r.height;}
    };
    resize(); window.addEventListener('resize',resize);
    return ()=>{mounted=false;cancelAnimationFrame(rafRef.current);try{mpCameraRef.current?.stop();}catch{}window.removeEventListener('resize',resize);};
  },[onPoseResults,renderLoop]);

  const startTest=()=>{
    leftWristBuf.current=[];rightWristBuf.current=[];ankleGapBuf.current=[];hipVelBuf.current=[];
    prevHipX.current=null;shoulderWidthBuf.current=[];turnActive.current=false;turnStepCount.current=0;
    scoreRef.current=0;starsRef.current=0;testTimeRef.current=0;particlesRef.current=[];
    detailRef.current={leftArmRangeMax:0,rightArmRangeMax:0,legRaiseMax:0,avgStepGap:0,avgHipVel:0,trunkAngleFinal:0,asymmetryRatioFinal:0};
    setScore(0);setStars(0);setFlags({asym:false,shuffle:false,brady:false,stoop:false,turn:false});setFlagCount(0);
    runningRef.current=true; setPhase('running');
    timerRef.current=setInterval(()=>{
      testTimeRef.current++;
      setTimerVal(`${testTimeRef.current}s / 30s`);
      if(testTimeRef.current>=30) endTest();
    },1000);
  };

  const endTest=()=>{
    if(timerRef.current) clearInterval(timerRef.current);
    runningRef.current=false;
    const fc=metricsRef.current.flagCount;
    let riskLevel='Low',riskColor='#5DBEA3',riskBg='#D4F1E8';
    if(fc>2){riskLevel='High';riskColor='#FF5A5A';riskBg='#FFE8E8';}
    else if(fc>0){riskLevel='Medium';riskColor='#FF9F43';riskBg='#FFF3E0';}
    const riskPct = fc===0?15:fc<=2?50:85;
    setResultData({fc,riskLevel,riskColor,riskBg,riskPct,score:scoreRef.current,stars:starsRef.current,detail:{...detailRef.current},flags:{...flagsRef.current}});
    setPhase('result');
  };

  const clsColor=(cls:string)=>cls==='ok'?'#34d399':cls==='warn'?'#fbbf24':'#f87171';

  if(phase==='result'&&resultData){
    const {fc,riskLevel,riskColor,riskBg,riskPct,score:sc,detail,flags:rf}=resultData;
    const circumference=503;
    const flagItems=[
      {key:'asym',label:'Arm Asymmetry'},{key:'shuffle',label:'Shuffling Gait'},
      {key:'brady',label:'Bradykinesia'},{key:'stoop',label:'Forward Stoop'},{key:'turn',label:'Impaired Turn'}
    ] as const;
    return(
      <div className="min-h-screen bg-[#EFEBE6] pb-24">
        <div className="max-w-md mx-auto px-5 pt-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-8 relative">
            <button onClick={()=>navigate('/home')} className="p-1 -ml-1"><ArrowLeft size={24} className="text-[#1A1A1A]"/></button>
            <h1 className="text-lg font-bold text-[#FF8C42] absolute left-1/2 -translate-x-1/2">NeuroVoice</h1>
            <div className="w-6"/>
          </div>

          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-[#1A1A1A] mb-2">Analysis Complete</h2>
            <p className="text-[#6B6B6B] text-base">We've reviewed your walking session.</p>
          </div>

          {/* Risk Ring */}
          <div className="flex flex-col items-center mb-8">
            <div className="relative w-56 h-56 mb-4">
              <svg viewBox="0 0 224 224" className="w-full h-full -rotate-90">
                <circle cx="112" cy="112" r="80" fill="none" stroke="#F0F0F0" strokeWidth="20"/>
                <circle cx="112" cy="112" r="80" fill="none" stroke={riskColor} strokeWidth="20" strokeLinecap="round"
                  strokeDasharray={`${riskPct*5.03} 503`}/>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-5xl font-bold" style={{color:riskColor}}>{riskPct}%</span>
              </div>
            </div>
            <div className="px-5 py-2 rounded-full text-sm font-bold uppercase tracking-wide" style={{backgroundColor:riskBg,color:riskColor}}>
              {riskLevel} Risk — {fc}/5 flags
            </div>
          </div>

          {/* Insight */}
          <div className="bg-white rounded-3xl p-5 text-center mb-6 shadow-sm">
            <p className="text-sm text-[#6B6B6B] leading-relaxed">
              {fc===0?'Excellent movement quality. No clinical flags detected.':fc<=2?'Some movement irregularities noted. Consider a follow-up evaluation.':'Multiple clinical flags detected. Recommend neurological consultation.'}
            </p>
          </div>

          {/* Movement Metrics Grid */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <p className="text-xs font-semibold text-[#6B6B6B] uppercase tracking-wide mb-1">Left Arm Swing</p>
              <p className="text-2xl font-bold text-[#1A1A1A]">{(detail.leftArmRangeMax*100).toFixed(1)}<span className="text-sm font-normal text-[#6B6B6B]"> u</span></p>
              <div className="flex gap-1 h-6 items-end mt-2">{[40,55,50,60,45].map((h,i)=><div key={i} className="flex-1 rounded-t" style={{height:`${h}%`,backgroundColor:'#FFD4B8'}}/>)}</div>
            </div>
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <p className="text-xs font-semibold text-[#6B6B6B] uppercase tracking-wide mb-1">Right Arm Swing</p>
              <p className="text-2xl font-bold text-[#1A1A1A]">{(detail.rightArmRangeMax*100).toFixed(1)}<span className="text-sm font-normal text-[#6B6B6B]"> u</span></p>
              <div className="flex gap-1 h-6 items-end mt-2">{[50,45,60,55,40].map((h,i)=><div key={i} className="flex-1 rounded-t" style={{height:`${h}%`,backgroundColor:'#C8E6DD'}}/>)}</div>
            </div>
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <p className="text-xs font-semibold text-[#6B6B6B] uppercase tracking-wide mb-1">Leg Raise Height</p>
              <p className="text-2xl font-bold text-[#1A1A1A]">{(detail.legRaiseMax*100).toFixed(1)}<span className="text-sm font-normal text-[#6B6B6B]"> u</span></p>
              <div className="flex gap-1 h-6 items-end mt-2">{[60,70,65,75,68].map((h,i)=><div key={i} className="flex-1 rounded-t" style={{height:`${h}%`,backgroundColor:'#DDD8F5'}}/>)}</div>
            </div>
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <p className="text-xs font-semibold text-[#6B6B6B] uppercase tracking-wide mb-1">Trunk Angle</p>
              <p className="text-2xl font-bold text-[#1A1A1A]">{detail.trunkAngleFinal.toFixed(1)}<span className="text-sm font-normal text-[#6B6B6B]">°</span></p>
              <div className="flex gap-1 h-6 items-end mt-2">{[55,60,58,62,57].map((h,i)=><div key={i} className="flex-1 rounded-t" style={{height:`${h}%`,backgroundColor:'#FFD4B8'}}/>)}</div>
            </div>
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <p className="text-xs font-semibold text-[#6B6B6B] uppercase tracking-wide mb-1">Asymmetry Ratio</p>
              <p className="text-2xl font-bold" style={{color:detail.asymmetryRatioFinal>0.35?'#FF5A5A':'#5DBEA3'}}>{detail.asymmetryRatioFinal.toFixed(2)}</p>
              <p className="text-xs text-[#6B6B6B] mt-1">{detail.asymmetryRatioFinal>0.35?'Asymmetric':'Symmetric'}</p>
            </div>
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <p className="text-xs font-semibold text-[#6B6B6B] uppercase tracking-wide mb-1">Step Width</p>
              <p className="text-2xl font-bold text-[#1A1A1A]">{(detail.avgStepGap*100).toFixed(1)}<span className="text-sm font-normal text-[#6B6B6B]"> u</span></p>
              <p className="text-xs text-[#6B6B6B] mt-1">{detail.avgStepGap<0.12?'Shuffling':'Normal'}</p>
            </div>
          </div>

          {/* Clinical Flags */}
          <div className="bg-white rounded-3xl p-5 mb-6 shadow-sm">
            <p className="text-sm font-bold text-[#1A1A1A] mb-4">Clinical Flags</p>
            <div className="flex flex-col gap-3">
              {flagItems.map(({key,label})=>{
                const active=rf[key];
                return(
                  <div key={key} className="flex items-center justify-between">
                    <span className="text-sm text-[#6B6B6B]">{label}</span>
                    <span className="text-xs font-bold px-3 py-1 rounded-full" style={{backgroundColor:active?'#FFE8E8':'#D4F1E8',color:active?'#FF5A5A':'#5DBEA3'}}>
                      {active?'Detected':'Normal'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-3">
            <button onClick={()=>navigate('/insights')} className="w-full bg-[#FF8C42] hover:bg-[#FF7A2E] text-white font-bold text-base rounded-full py-4 flex items-center justify-center gap-2 shadow-lg active:scale-[0.98] transition-all">
              <TrendingUp size={20}/> View Insights
            </button>
            <button onClick={()=>{setPhase('intro');setTimerVal('0s / 30s');setScore(0);setStars(0);}} className="w-full bg-white border-2 border-[#E0E0E0] text-[#1A1A1A] font-bold text-base rounded-full py-4 flex items-center justify-center gap-2 active:scale-[0.98] transition-all">
              Try Again
            </button>
          </div>
        </div>
        <BottomNav/>
      </div>
    );
  }

  return(
    <div style={{minHeight:'100vh',background:'linear-gradient(135deg,#0f0f23 0%,#1a1a2e 100%)',color:'#fff',fontFamily:'Menlo,Monaco,Consolas,monospace',display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden',position:'relative'}}>

      {/* HUD left */}
      <div style={{position:'fixed',top:20,left:20,width:240,zIndex:50,background:'rgba(17,24,39,0.9)',backdropFilter:'blur(12px)',borderRadius:12,padding:20,border:'1px solid rgba(133,200,255,0.5)',boxShadow:'0 0 30px rgba(133,200,255,0.3)'}}>
        <div style={{fontSize:13,fontWeight:700,color:'#85c8ff',marginBottom:4}}>🚶 Walking Test</div>
        <div style={{fontSize:11,color:'#6b7280',marginBottom:12}}>Parkinson's Diagnostic</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,textAlign:'center'}}>
          <div><div style={{fontSize:26,fontWeight:'bold',color:'#d6fa61'}}>{score}</div><div style={{fontSize:12,color:'#9ca3af'}}>Score</div></div>
          <div><div style={{fontSize:26,fontWeight:'bold',color:'#fbbf24'}}>⭐ {stars}</div><div style={{fontSize:12,color:'#9ca3af'}}>Stars</div></div>
        </div>
        {[{label:'Arm Swing Asymmetry',val:armSwing},{label:'Step Length',val:stepLen},{label:'Walking Speed',val:walkSpeed},{label:'Trunk Posture',val:trunkPost}].map(({label,val})=>(
          <div key={label} style={{background:'rgba(255,255,255,0.05)',borderRadius:8,padding:'10px 12px',marginTop:10,border:'1px solid rgba(255,255,255,0.08)'}}>
            <div style={{fontSize:11,color:'#9ca3af',marginBottom:4,textTransform:'uppercase',letterSpacing:'0.05em'}}>{label}</div>
            <div style={{fontSize:15,fontWeight:700,color:clsColor(val.cls)}}>{val.text}</div>
          </div>
        ))}
        <div style={{marginTop:14,textAlign:'center',fontSize:12,color:'#6b7280'}}>Duration: <span style={{color:'#85c8ff'}}>{timerVal}</span></div>
      </div>

      {/* Flags panel right */}
      <div style={{position:'fixed',top:20,right:20,width:200,zIndex:50,background:'rgba(17,24,39,0.9)',backdropFilter:'blur(12px)',borderRadius:12,padding:16,border:'1px solid rgba(214,250,97,0.3)',boxShadow:'0 0 20px rgba(214,250,97,0.2)'}}>
        <div style={{fontSize:12,fontWeight:700,color:'#d6fa61',marginBottom:10}}>⚠ Clinical Flags</div>
        {[{key:'asym',label:'Arm asymmetry'},{key:'shuffle',label:'Shuffling gait'},{key:'brady',label:'Bradykinesia'},{key:'stoop',label:'Forward stoop'},{key:'turn',label:'Impaired turn'}].map(({key,label})=>(
          <div key={key} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 0',fontSize:13,borderBottom:'1px solid rgba(255,255,255,0.06)'}}>
            <div style={{width:10,height:10,borderRadius:'50%',flexShrink:0,background:flags[key as keyof typeof flags]?'#f87171':'#34d399'}}/>
            <span style={{color:'#d1d5db'}}>{label}</span>
          </div>
        ))}
        <div style={{marginTop:14,textAlign:'center'}}>
          <div style={{fontSize:20,fontWeight:'bold',color:flagCount===0?'#34d399':flagCount<=2?'#fbbf24':'#f87171'}}>
            Risk: {flagCount===0?'Low':flagCount<=2?'Moderate':'High'}
          </div>
          <div style={{fontSize:11,color:'#6b7280',marginTop:2}}>{flagCount} / 5 flags</div>
        </div>
      </div>

      {/* Game container */}
      <div ref={containerRef} style={{position:'relative',width:'calc(100vw - 560px)',marginLeft:260,height:'85vh',maxWidth:1000,maxHeight:750,border:'1px solid rgba(133,200,255,0.5)',borderRadius:20,overflow:'hidden',background:'#1b2337',boxShadow:'0 0 15px #1a2a4a,0 0 25px rgba(133,200,255,0.3)'}}>
        <video ref={videoRef} autoPlay muted playsInline style={{width:'100%',height:'100%',objectFit:'cover',transform:'scaleX(-1)'}}/>
        <canvas ref={canvasRef} style={{position:'absolute',top:0,left:0,width:'100%',height:'100%',pointerEvents:'none'}}/>
      </div>

      {/* Intro overlay */}
      {phase==='intro'&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.95)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:60}}>
          <div style={{background:'#111827',borderRadius:16,padding:40,border:'2px solid rgba(133,200,255,0.3)',textAlign:'center',maxWidth:560}}>
            <div style={{fontSize:48,marginBottom:12}}>🚶‍♂️</div>
            <h2 style={{fontSize:30,fontWeight:'bold',marginBottom:16,color:'#85c8ff'}}>Diagnostic Walking Test</h2>
            <p style={{color:'#d1d5db',marginBottom:24,lineHeight:1.7,fontSize:14}}>
              This test replicates a neurologist's clinical walking evaluation.<br/><br/>
              <strong style={{color:'#fbbf24'}}>Instructions:</strong><br/>
              Stand upright and walk forward naturally for 8–10 steps, turn around, and walk back.<br/><br/>
              The system will analyze your <em>arm swing symmetry</em>, <em>step length</em>, <em>walking speed</em>, <em>posture</em>, and <em>turn quality</em>.
            </p>
            <button onClick={startTest} style={{display:'block',width:'100%',padding:14,border:'none',borderRadius:8,fontWeight:'bold',fontSize:16,color:'#000',cursor:'pointer',background:'linear-gradient(90deg,#85c8ff,#d6fa61)'}}>
              Begin Walking Test
            </button>
            <button onClick={()=>navigate('/home')} style={{marginTop:12,background:'none',border:'none',color:'#6b7280',cursor:'pointer',fontSize:13}}>← Back to Home</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default WalkingTest;
