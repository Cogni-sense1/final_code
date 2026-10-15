import { Mic, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Assessment } from '@neurovoice/shared';
import { api, errorText, useAuth } from '../lib/api';
import { startRecording, type Recorder } from '../lib/audio';
import { cx, ErrorNote, Ring } from '../ui';
import { CheckLayout, Intro, ResultView, Unusable, VoiceModelCard, Working } from './shared';

type Stage = 'intro' | 'vowel' | 'reading' | 'working' | 'result' | 'unusable';
const VOWEL_SECONDS = 6;
const READING_MAX = 20;

export default function Voice() {
  const { config } = useAuth();
  const [stage, setStage] = useState<Stage>('intro');
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Assessment | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const rec = useRef<Recorder | null>(null);
  const vowel = useRef<Assessment | null>(null);
  const [model, setModel] = useState<Assessment['model']>();
  const sentence = useRef(Math.floor(Math.random() * (config?.sentences.length ?? 1)));
  const task = stage === 'reading' ? 'reading' : 'vowel';
  const limit = task === 'vowel' ? VOWEL_SECONDS : READING_MAX;

  useEffect(() => () => rec.current?.cancel(), []);

  useEffect(() => {
    if (!recording) return;
    const started = performance.now();
    const id = window.setInterval(() => {
      const s = (performance.now() - started) / 1000;
      setElapsed(s);
      setLevel(rec.current?.level() ?? 0);
      if (s >= limit) void finish();
    }, 80);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording]);

  async function begin() {
    setError('');
    try {
      rec.current = await startRecording();
      setElapsed(0);
      setRecording(true);
    } catch {
      setError('Microphone access is needed for this check. Allow it in your browser settings and try again.');
    }
  }

  async function finish() {
    if (!rec.current) return;
    const current = rec.current;
    rec.current = null;
    setRecording(false);
    const was = task;
    setStage('working');
    try {
      const wav = await current.stop();
      const out = await api.analyzeVoice(wav, was, was === 'reading' ? sentence.current : undefined);
      if (!out.assessment.quality.usable) {
        setProblems(out.assessment.quality.problems);
        setStage('unusable');
      } else if (was === 'vowel') {
        vowel.current = out.assessment;
        setStage('reading');
      } else {
        // The held vowel is the cleaner signal, so it leads the result. The screening
        // score comes from the newest recording, which already averages in the earlier ones.
        setModel(out.assessment.model);
        setResult(vowel.current ?? out.assessment);
        setStage('result');
      }
    } catch (err) {
      setError(errorText(err));
      setStage(was);
    }
  }

  const retry = (): void => { vowel.current = null; setStage('vowel'); };

  return (
    <CheckLayout title="Voice check" step={stage === 'vowel' ? 'Part 1 of 2' : stage === 'reading' ? 'Part 2 of 2' : undefined}>
      {stage === 'intro' && (
        <Intro icon={<Mic className="h-9 w-9" />} title="Two short recordings"
          steps={['Find a quiet spot and hold the phone a hand-width from your mouth.', 'Say "aaah" in a steady voice for six seconds.', 'Then read one sentence aloud in your normal voice.']}
          privacy="Your recording is measured and then deleted, unless you chose to keep recordings." onStart={() => setStage('vowel')} />
      )}

      {(stage === 'vowel' || stage === 'reading') && (
        <div className="flex flex-1 flex-col items-center text-center animate-rise">
          <p className="text-lg text-ink-soft">{stage === 'vowel' ? 'Take a breath, tap the button, and say' : 'Tap the button and read this aloud'}</p>
          {stage === 'vowel'
            ? <p className="mt-2 text-6xl font-extrabold tracking-tight text-navy">"aaah"</p>
            : <p className="mt-3 rounded-xl3 bg-white p-5 text-2xl font-semibold leading-snug shadow-card">{config?.sentences[sentence.current]}</p>}

          <div className="relative mt-10">
            {recording && <span className="absolute inset-0 rounded-full bg-brand/30 animate-pulseRing" />}
            <Ring value={recording ? elapsed / limit : 0} size={200} stroke={12} color="#F0803C">
              <button type="button" aria-label={recording ? 'Stop recording' : 'Start recording'} onClick={recording ? () => void finish() : begin}
                className={cx('flex h-36 w-36 items-center justify-center rounded-full text-white transition active:scale-95', recording ? 'bg-navy' : 'bg-brand shadow-lift')}
                style={recording ? { transform: `scale(${1 + level * 0.12})` } : undefined}>
                {recording ? <Square className="h-12 w-12" fill="currentColor" /> : <Mic className="h-14 w-14" />}
              </button>
            </Ring>
          </div>
          <p className="mt-6 h-7 text-lg font-semibold tabular-nums">
            {recording ? (stage === 'vowel' ? `Keep going… ${Math.max(0, Math.ceil(limit - elapsed))}` : 'Tap the square when you finish') : ''}
          </p>
          {error && <div className="mt-2 w-full"><ErrorNote>{error}</ErrorNote></div>}
        </div>
      )}

      {stage === 'working' && <Working label="Measuring your voice" />}
      {stage === 'unusable' && <Unusable problems={problems} onRetry={retry} />}
      {stage === 'result' && result && <ResultView assessment={result} onAgain={retry} extra={model && <VoiceModelCard model={model} />} />}
      {stage === 'intro' && error && <ErrorNote>{error}</ErrorNote>}
    </CheckLayout>
  );
}
