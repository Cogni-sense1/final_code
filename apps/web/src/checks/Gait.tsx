import { Footprints } from 'lucide-react';
import { useRef, useState } from 'react';
import { type Assessment, GaitAccumulator, POSE } from '@neurovoice/shared';
import { api, errorText } from '../lib/api';
import { drawPoints, useTracking } from '../lib/vision';
import { ErrorNote } from '../ui';
import { CameraStage, CheckLayout, Hud, Intro, ResultView, Unusable, Working } from './shared';

const SECONDS = 30;
const BODY = [POSE.L_SHOULDER, POSE.R_SHOULDER, POSE.L_WRIST, POSE.R_WRIST, POSE.L_HIP, POSE.R_HIP, POSE.L_ANKLE, POSE.R_ANKLE];

function Capture({ onDone }: { onDone: (acc: GaitAccumulator) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const acc = useRef(new GaitAccumulator());
  const started = useRef<number | null>(null);
  const finished = useRef(false);
  const [steps, setSteps] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [inView, setInView] = useState(false);

  const { state, message } = useTracking('pose', video, (f) => {
    const pose = f.pose;
    drawPoints(canvas.current, video.current, pose ? BODY.map((i) => pose[i]!) : null, '#F0803C', 7);
    // Head to feet must be visible before the clock starts.
    const whole = !!pose && BODY.every((i) => { const p = pose[i]!; return p.y > 0.02 && p.y < 0.98 && p.x > 0.02 && p.x < 0.98; });
    if (whole !== inView) setInView(whole);
    if (started.current === null) {
      if (!whole) return;
      started.current = f.t;
    }
    acc.current.push(f.t, pose);
    if (acc.current.steps !== steps) setSteps(acc.current.steps);
    const s = (f.t - started.current) / 1000;
    if (Math.floor(s) !== seconds) setSeconds(Math.floor(s));
    if (s >= SECONDS && !finished.current) {
      finished.current = true;
      onDone(acc.current);
    }
  });

  return (
    <div className="animate-rise">
      <CameraStage ref={video} canvas={canvas} state={state} message={message} tall>
        <Hud className="left-3 top-3 text-sm font-semibold">{started.current === null ? 'Step back until you fit' : `${Math.max(0, SECONDS - seconds)} s left`}</Hud>
        {started.current !== null && !inView && <Hud className="inset-x-3 top-16 bg-alert/90 text-center text-sm font-semibold">Step back into the frame</Hud>}
        <Hud className="bottom-5 left-1/2 -translate-x-1/2 px-6 text-center">
          <span className="block text-5xl font-extrabold tabular-nums leading-none">{steps}</span>
          <span className="text-xs font-semibold uppercase tracking-wider text-white/70">steps</span>
        </Hud>
      </CameraStage>
      <p className="mt-5 text-center text-2xl font-bold leading-snug">
        {started.current === null ? 'Prop the phone up and step back so head to feet are in view' : 'March on the spot. Lift your knees and let your arms swing.'}
      </p>
    </div>
  );
}

export default function Gait() {
  const [stage, setStage] = useState<'intro' | 'capture' | 'working' | 'result' | 'unusable'>('intro');
  const [result, setResult] = useState<Assessment | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [error, setError] = useState('');

  async function done(acc: GaitAccumulator) {
    const out = acc.result();
    if (!out.usable) { setProblems(out.problems); return setStage('unusable'); }
    setStage('working');
    try {
      setResult(await api.submitAssessment({ type: 'gait', features: out.features, quality: { usable: true, problems: [], score: out.quality }, durationS: SECONDS, channel: 'web' }));
      setStage('result');
    } catch (err) {
      setError(errorText(err));
      setStage('intro');
    }
  }

  return (
    <CheckLayout title="Walking test">
      {stage === 'intro' && (
        <>
          <Intro icon={<Footprints className="h-9 w-9" />} title="March on the spot for thirty seconds"
            steps={['Clear some space and stand near something sturdy you can hold if needed.', 'Prop the phone against something at waist height.', 'Step back until your whole body is in view, then march on the spot.']}
            privacy="The video stays on this device. Only step timing and arm swing are saved." onStart={() => { setError(''); setStage('capture'); }} />
          <p className="mt-3 rounded-2xl bg-warn-soft p-3.5 text-sm font-medium text-warn">Skip this check if you feel unsteady today. Safety comes first.</p>
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
