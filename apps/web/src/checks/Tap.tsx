import { Hand } from 'lucide-react';
import { useRef, useState } from 'react';
import { type Assessment, TapCounter, tapFeatures } from '@neurovoice/shared';
import { api, errorText } from '../lib/api';
import { drawPoints, useTracking } from '../lib/vision';
import { Button, ErrorNote } from '../ui';
import { CameraStage, CheckLayout, Hud, Intro, ResultView, Unusable, Working } from './shared';

const SECONDS = 12;
type Side = 'right' | 'left';

/** One hand at a time, so it never matters which hand the tracker thinks it sees. */
function Capture({ side, counter, onDone }: { side: Side; counter: TapCounter; onDone: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const started = useRef<number | null>(null);
  const finished = useRef(false);
  const [taps, setTaps] = useState(0);
  const [seconds, setSeconds] = useState(0);

  const { state, message } = useTracking('hands', video, (f) => {
    const hand = f.hands.right ?? f.hands.left;
    drawPoints(canvas.current, video.current, hand, '#F0803C', 4);
    if (started.current === null) {
      if (!hand) return;
      started.current = f.t;
    }
    counter.push(f.t, hand);
    if (counter.count !== taps) setTaps(counter.count);
    const s = (f.t - started.current) / 1000;
    if (Math.floor(s) !== seconds) setSeconds(Math.floor(s));
    if (s >= SECONDS && !finished.current) {
      finished.current = true;
      onDone();
    }
  });

  return (
    <div className="animate-rise">
      <CameraStage ref={video} canvas={canvas} state={state} message={message}>
        <Hud className="left-3 top-3 text-sm font-semibold">{started.current === null ? `Show your ${side} hand` : `${Math.max(0, SECONDS - seconds)} s left`}</Hud>
        <Hud className="bottom-5 left-1/2 -translate-x-1/2 px-6 text-center">
          <span className="block text-5xl font-extrabold tabular-nums leading-none">{taps}</span>
          <span className="text-xs font-semibold uppercase tracking-wider text-white/70">taps</span>
        </Hud>
      </CameraStage>
      <p className="mt-5 text-center text-2xl font-bold leading-snug">
        <span className="text-brand-deep">{side === 'right' ? 'Right' : 'Left'} hand.</span> Tap thumb and index finger, as big and as fast as you can.
      </p>
    </div>
  );
}

export default function Tap() {
  const [stage, setStage] = useState<'intro' | 'right' | 'switch' | 'left' | 'working' | 'result' | 'unusable'>('intro');
  const counters = useRef({ right: new TapCounter(), left: new TapCounter() });
  const [result, setResult] = useState<Assessment | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [error, setError] = useState('');

  const restart = (): void => {
    counters.current = { right: new TapCounter(), left: new TapCounter() };
    setError('');
    setStage('right');
  };

  async function submit() {
    const out = tapFeatures(counters.current.left, counters.current.right);
    if (!out.usable) { setProblems(out.problems); return setStage('unusable'); }
    setStage('working');
    try {
      setResult(await api.submitAssessment({ type: 'tap', features: out.features, quality: { usable: true, problems: [], score: out.quality }, durationS: SECONDS * 2, channel: 'web' }));
      setStage('result');
    } catch (err) {
      setError(errorText(err));
      setStage('intro');
    }
  }

  return (
    <CheckLayout title="Finger tapping" step={stage === 'right' ? 'Hand 1 of 2' : stage === 'left' || stage === 'switch' ? 'Hand 2 of 2' : undefined}>
      {stage === 'intro' && (
        <>
          <Intro icon={<Hand className="h-9 w-9" />} title="Twelve seconds per hand"
            steps={['Prop the phone up or hold it in your other hand.', 'Show one hand side-on, so the camera sees thumb and index finger.', 'Tap them together as big and as fast as you can.']}
            privacy="The video stays on this device. Only tap timing and size are saved." onStart={restart} />
          {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}
        </>
      )}
      {stage === 'right' && <Capture key="right" side="right" counter={counters.current.right} onDone={() => setStage('switch')} />}
      {stage === 'switch' && (
        <div className="flex flex-1 flex-col items-center justify-center text-center animate-rise">
          <p className="text-6xl font-extrabold text-navy">{counters.current.right.count}</p>
          <p className="mt-1 text-ink-soft">taps with your right hand</p>
          <h2 className="mt-8 text-3xl font-extrabold">Now your left hand</h2>
          <p className="mt-2 text-lg text-ink-soft">Rest for a moment if you need to.</p>
          <div className="mt-8 w-full"><Button full onClick={() => setStage('left')}>I'm ready</Button></div>
        </div>
      )}
      {stage === 'left' && <Capture key="left" side="left" counter={counters.current.left} onDone={() => void submit()} />}
      {stage === 'working' && <Working />}
      {stage === 'unusable' && <Unusable problems={problems} onRetry={restart} />}
      {stage === 'result' && result && <ResultView assessment={result} onAgain={restart} />}
    </CheckLayout>
  );
}
