import { ScanFace } from 'lucide-react';
import { useRef, useState } from 'react';
import { type Assessment, FaceAccumulator } from '@neurovoice/shared';
import { api, errorText } from '../lib/api';
import { drawPoints, useTracking } from '../lib/vision';
import { ErrorNote } from '../ui';
import { CameraStage, CheckLayout, Hud, Intro, ResultView, Unusable, Working } from './shared';

const SECONDS = 30;
const PROMPTS = [
  { until: 10, text: 'Relax your face and look at the camera' },
  { until: 20, text: 'Give a big smile, then relax. Repeat.' },
  { until: 30, text: 'Raise your eyebrows high, then relax. Repeat.' },
];

function Capture({ onDone }: { onDone: (acc: FaceAccumulator) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const acc = useRef(new FaceAccumulator());
  const started = useRef<number | null>(null);
  const finished = useRef(false);
  const [seconds, setSeconds] = useState(0);
  const [seen, setSeen] = useState(false);

  const { state, message } = useTracking('face', video, (f) => {
    drawPoints(canvas.current, video.current, f.face, 'rgba(255,217,191,.75)', 1.4);
    // The clock starts the first time a face is found.
    if (started.current === null) {
      if (!f.face) return;
      started.current = f.t;
    }
    acc.current.push(f.t, f.face);
    const s = (f.t - started.current) / 1000;
    if (Math.floor(s) !== seconds) { setSeconds(Math.floor(s)); setSeen(!!f.face); }
    if (s >= SECONDS && !finished.current) {
      finished.current = true;
      onDone(acc.current);
    }
  });

  const prompt = PROMPTS.find((p) => seconds < p.until) ?? PROMPTS[2]!;
  return (
    <div className="animate-rise">
      <CameraStage ref={video} canvas={canvas} state={state} message={message}>
        <Hud className="left-3 top-3 text-sm font-semibold">{started.current === null ? 'Looking for your face' : `${Math.max(0, SECONDS - seconds)} s left`}</Hud>
        <Hud className="right-3 top-3 text-sm font-semibold">{acc.current.blinkCount} blinks</Hud>
        {started.current !== null && !seen && <Hud className="inset-x-3 top-16 bg-alert/90 text-center text-sm font-semibold">Move back into the frame</Hud>}
        <div className="absolute inset-x-0 bottom-0 h-1.5 bg-white/20"><div className="h-full bg-brand transition-all duration-1000 ease-linear" style={{ width: `${(seconds / SECONDS) * 100}%` }} /></div>
      </CameraStage>
      <p className="mt-5 text-center text-2xl font-bold leading-snug">{started.current === null ? 'Hold the phone at eye level in good light' : prompt.text}</p>
    </div>
  );
}

export default function Face() {
  const [stage, setStage] = useState<'intro' | 'capture' | 'working' | 'result' | 'unusable'>('intro');
  const [result, setResult] = useState<Assessment | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [error, setError] = useState('');

  async function done(acc: FaceAccumulator) {
    const out = acc.result();
    if (!out.usable) { setProblems(out.problems); return setStage('unusable'); }
    setStage('working');
    try {
      setResult(await api.submitAssessment({ type: 'face', features: out.features, quality: { usable: true, problems: [], score: out.quality }, durationS: SECONDS, channel: 'web' }));
      setStage('result');
    } catch (err) {
      setError(errorText(err));
      setStage('intro');
    }
  }

  return (
    <CheckLayout title="Face check">
      {stage === 'intro' && (
        <>
          <Intro icon={<ScanFace className="h-9 w-9" />} title="Thirty seconds, three prompts"
            steps={['Face a window or a light so your face is evenly lit.', 'Hold the phone at eye level, about an arm away.', 'Follow the prompt under the camera view.']}
            privacy="The video stays on this device. Only blink rate, movement, and symmetry numbers are saved." onStart={() => { setError(''); setStage('capture'); }} />
          {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}
        </>
      )}
      {stage === 'capture' && <Capture onDone={done} />}
      {stage === 'working' && <Working />}
      {stage === 'unusable' && <Unusable problems={problems} onRetry={() => setStage('capture')} />}
      {stage === 'result' && result && <ResultView assessment={result} onAgain={() => setStage('capture')} />}
    </CheckLayout>
  );
}
