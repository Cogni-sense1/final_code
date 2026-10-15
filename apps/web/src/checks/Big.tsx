import { Sparkles } from 'lucide-react';
import { useRef, useState } from 'react';
import { type Assessment, type Lm, POSE, ReachAccumulator } from '@neurovoice/shared';
import { api, errorText } from '../lib/api';
import { useTracking } from '../lib/vision';
import { Card, ErrorNote } from '../ui';
import { CameraStage, CheckLayout, Hud, Intro, ResultView, Unusable, Working } from './shared';

const SECONDS = 45;
/** Target positions in shoulder-widths from the chest: wide and high, the LSVT BIG idea. */
const SPOTS: [number, number][] = [[-2.0, -1.2], [2.0, -1.2], [-2.3, 0.1], [2.3, 0.1], [-1.2, -2.1], [1.2, -2.1]];
const PRAISE = ['Big!', 'Great reach!', 'Wide!', 'Lovely!', 'Keep it big!'];

interface Target { x: number; y: number; r: number; born: number }

function Game({ onDone }: { onDone: (acc: ReachAccumulator, score: number) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const acc = useRef(new ReachAccumulator());
  const target = useRef<Target | null>(null);
  const next = useRef(0);
  const started = useRef<number | null>(null);
  const finished = useRef(false);
  const flash = useRef({ text: '', until: 0 });
  const scoreRef = useRef(0);
  const [score, setScore] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [span, setSpan] = useState(0);

  const { state, message } = useTracking('pose', video, (f) => {
    const c = canvas.current;
    const v = video.current;
    if (!c || !v) return;
    if (c.width !== v.videoWidth) { c.width = v.videoWidth; c.height = v.videoHeight; }
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, c.width, c.height);
    const pose = f.pose;
    const s = acc.current.push(pose);
    if (!pose || s === null) return;
    if (started.current === null) started.current = f.t;

    const ls = pose[POSE.L_SHOULDER]!;
    const rs = pose[POSE.R_SHOULDER]!;
    const sw = Math.hypot(ls.x - rs.x, ls.y - rs.y);
    if (!target.current) {
      const [dx, dy] = SPOTS[next.current++ % SPOTS.length]!;
      target.current = {
        x: Math.min(0.94, Math.max(0.06, (ls.x + rs.x) / 2 + dx * sw)),
        y: Math.min(0.92, Math.max(0.08, (ls.y + rs.y) / 2 + dy * sw)),
        r: Math.max(0.05, sw * 0.45), born: f.t,
      };
    }
    const t = target.current;
    const near = (w: Lm): boolean => Math.hypot(w.x - t.x, (w.y - t.y) * (c.height / c.width)) < t.r;
    if (near(pose[POSE.L_WRIST]!) || near(pose[POSE.R_WRIST]!)) {
      const took = (f.t - t.born) / 1000;
      acc.current.hit(took);
      scoreRef.current += 10 + Math.max(0, Math.round(10 - took * 3));
      setScore(scoreRef.current);
      flash.current = { text: PRAISE[next.current % PRAISE.length]!, until: f.t + 700 };
      target.current = null;
    } else {
      const pulse = 1 + 0.12 * Math.sin(f.t / 180);
      ctx.beginPath();
      ctx.arc(t.x * c.width, t.y * c.height, t.r * c.width * pulse, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(240,128,60,.35)';
      ctx.fill();
      ctx.lineWidth = 6;
      ctx.strokeStyle = '#F0803C';
      ctx.stroke();
    }
    for (const i of [POSE.L_WRIST, POSE.R_WRIST]) {
      ctx.beginPath();
      ctx.arc(pose[i]!.x * c.width, pose[i]!.y * c.height, 14, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
    }

    const sec = Math.floor((f.t - started.current) / 1000);
    if (sec !== seconds) { setSeconds(sec); setSpan(s); }
    if (sec >= SECONDS && !finished.current) {
      finished.current = true;
      onDone(acc.current, scoreRef.current);
    }
  });

  const praise = performance.now() < flash.current.until ? flash.current.text : '';
  return (
    <div className="animate-rise">
      <CameraStage ref={video} canvas={canvas} state={state} message={message} tall>
        <Hud className="left-3 top-3 text-sm font-semibold">{started.current === null ? 'Step back until you fit' : `${Math.max(0, SECONDS - seconds)} s left`}</Hud>
        <Hud className="right-3 top-3 text-center"><span className="block text-2xl font-extrabold tabular-nums leading-none">{score}</span><span className="text-[10px] font-bold uppercase tracking-wider text-white/70">score</span></Hud>
        {praise && <div className="absolute inset-x-0 top-1/3 text-center text-5xl font-extrabold text-white drop-shadow-lg">{praise}</div>}
      </CameraStage>
      <p className="mt-5 text-center text-2xl font-bold leading-snug">
        {started.current === null ? 'Prop the phone up and step back' : span < 1.6 ? 'Reach BIGGER. Stretch all the way out.' : 'Touch each circle with your hand.'}
      </p>
    </div>
  );
}

export default function Big() {
  const [stage, setStage] = useState<'intro' | 'play' | 'working' | 'result' | 'unusable'>('intro');
  const [result, setResult] = useState<Assessment | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [error, setError] = useState('');

  async function done(acc: ReachAccumulator, score: number) {
    const out = acc.result(score);
    if (!out.usable) { setProblems(out.problems); return setStage('unusable'); }
    setStage('working');
    try {
      setResult(await api.submitAssessment({ type: 'lsvt', features: out.features, quality: { usable: true, problems: [] }, durationS: SECONDS, channel: 'web' }));
      setStage('result');
    } catch (err) {
      setError(errorText(err));
      setStage('intro');
    }
  }

  return (
    <CheckLayout title="BIG movements">
      {stage === 'intro' && (
        <>
          <Intro icon={<Sparkles className="h-9 w-9" />} title="Reach big for 45 seconds" startLabel="Play"
            steps={['Prop the phone up and step back so your arms fit in view when stretched wide.', 'A circle appears. Reach out and touch it with your hand.', 'Make every reach as big as you can. Bigger and faster scores more.']}
            privacy="The video stays on this device. Only reach size and timing are saved." onStart={() => { setError(''); setStage('play'); }} />
          <p className="mt-3 text-xs leading-relaxed text-ink-faint">Inspired by amplitude-focused exercise programmes such as LSVT BIG. This is a practice game, not a substitute for therapy with a certified clinician.</p>
          {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}
        </>
      )}
      {stage === 'play' && <Game onDone={done} />}
      {stage === 'working' && <Working />}
      {stage === 'unusable' && <Unusable problems={problems} onRetry={() => setStage('play')} />}
      {stage === 'result' && result && (
        <ResultView assessment={result} onAgain={() => setStage('play')}
          extra={<Card className="mt-3 flex items-center justify-between bg-navy text-white"><span className="font-semibold">Game score</span><span className="text-3xl font-extrabold tabular-nums">{result.features.game_score ?? 0}</span></Card>} />
      )}
    </CheckLayout>
  );
}
