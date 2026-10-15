import { PenLine, RotateCcw } from 'lucide-react';
import { useMemo, useRef, useState, type PointerEvent } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { type Assessment, CANVAS, drawingFeatures, type DrawingTask, MODALITIES, packStrokes, type Pt, spiralGuide, waveGuide } from '@neurovoice/shared';
import { api, errorText } from '../lib/api';
import { Button, ErrorNote } from '../ui';
import { CheckLayout, Intro, ResultView, Unusable, Working } from './shared';

const COPY: Record<DrawingTask, { title: string; steps: string[]; hint: string }> = {
  spiral: {
    title: 'Trace the spiral',
    steps: ['Use the index finger of your writing hand.', 'Start at the centre dot and follow the dashed line outward.', 'Go at a comfortable pace without lifting your finger.'],
    hint: 'Start from the dot in the centre',
  },
  wave: {
    title: 'Trace the wave',
    steps: ['Use the index finger of your writing hand.', 'Start at the left dot and follow the dashed wave to the right.', 'Try not to lift your finger.'],
    hint: 'Start from the dot on the left',
  },
  clock: {
    title: 'Draw a clock',
    steps: ['Draw a round clock face.', 'Put in all twelve numbers.', 'Set the hands to ten past eleven.'],
    hint: 'Draw a clock showing ten past eleven',
  },
};

const path = (pts: readonly (readonly [number, number])[]): string => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');

function Pad({ task, onDone }: { task: DrawingTask; onDone: (strokes: Pt[][]) => void }) {
  const svg = useRef<SVGSVGElement>(null);
  const strokes = useRef<Pt[][]>([]);
  const drawing = useRef(false);
  const [paths, setPaths] = useState<string[]>([]);
  const guide = useMemo(() => (task === 'spiral' ? spiralGuide() : task === 'wave' ? waveGuide() : null), [task]);

  const point = (e: PointerEvent): Pt => {
    const r = svg.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * CANVAS, y: ((e.clientY - r.top) / r.height) * CANVAS, t: performance.now() };
  };
  const redraw = (): void => setPaths(strokes.current.map((s) => path(s.map((p) => [p.x, p.y] as const))));

  return (
    <div className="flex flex-1 flex-col animate-rise">
      <p className="mb-3 text-center text-lg font-semibold">{COPY[task].hint}</p>
      <svg ref={svg} viewBox={`0 0 ${CANVAS} ${CANVAS}`} className="aspect-square w-full touch-none rounded-xl3 bg-white shadow-card"
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); drawing.current = true; strokes.current.push([point(e)]); redraw(); }}
        onPointerMove={(e) => { if (!drawing.current) return; strokes.current[strokes.current.length - 1]!.push(point(e)); redraw(); }}
        onPointerUp={() => { drawing.current = false; }}
        onPointerCancel={() => { drawing.current = false; }}>
        {guide && (
          <>
            <path d={path(guide)} fill="none" stroke="#E0D8CC" strokeWidth={3} strokeDasharray="2 7" strokeLinecap="round" />
            <circle cx={guide[0]![0]} cy={guide[0]![1]} r={6} fill="#F0803C" />
          </>
        )}
        {paths.map((d, i) => <path key={i} d={d} fill="none" stroke="#1F2A44" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />)}
      </svg>
      <div className="mt-auto flex gap-3 pt-6">
        <Button variant="secondary" aria-label="Clear" onClick={() => { strokes.current = []; redraw(); }}><RotateCcw className="h-5 w-5" /></Button>
        <Button full disabled={!paths.length} onClick={() => onDone(strokes.current)}>I'm finished</Button>
      </div>
    </div>
  );
}

export default function Draw() {
  const { task } = useParams<{ task: DrawingTask }>();
  const [stage, setStage] = useState<'intro' | 'draw' | 'working' | 'result' | 'unusable'>('intro');
  const [result, setResult] = useState<Assessment | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [error, setError] = useState('');
  if (task !== 'spiral' && task !== 'wave' && task !== 'clock') return <Navigate to="/checks" replace />;

  async function done(strokes: Pt[][]) {
    const out = drawingFeatures(task as DrawingTask, strokes);
    if (!out.usable) { setProblems(out.problems); return setStage('unusable'); }
    setStage('working');
    try {
      setResult(await api.submitAssessment({
        type: task as DrawingTask, features: out.features, quality: { usable: true, problems: [] }, durationS: Math.min(600, out.features.total_time ?? 0), channel: 'web',
        strokes: packStrokes(strokes),
      }));
      setStage('result');
    } catch (err) {
      setError(errorText(err));
      setStage('intro');
    }
  }

  return (
    <CheckLayout title={MODALITIES[task].name}>
      {stage === 'intro' && (
        <>
          <Intro icon={<PenLine className="h-9 w-9" />} title={COPY[task].title} steps={COPY[task].steps} onStart={() => { setError(''); setStage('draw'); }}
            privacy={task === 'clock' ? 'Your drawing is saved so a clinician you invite can look at it.' : undefined} />
          {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}
        </>
      )}
      {stage === 'draw' && <Pad key={task} task={task} onDone={done} />}
      {stage === 'working' && <Working />}
      {stage === 'unusable' && <Unusable problems={problems} onRetry={() => setStage('draw')} />}
      {stage === 'result' && result && <ResultView assessment={result} onAgain={() => setStage('draw')} />}
    </CheckLayout>
  );
}
