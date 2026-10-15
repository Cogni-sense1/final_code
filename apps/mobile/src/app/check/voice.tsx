import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { type Assessment, voiceModelNote } from '@neurovoice/shared';
import { Result, Unusable } from '@/components/Result';
import { api, errorText, useAuth } from '@/lib/api';
import { C } from '@/theme';
import { Button, Card, ErrorNote, H1, Icon, Loading, Screen, Soft } from '@/ui';

type Stage = 'intro' | 'vowel' | 'reading' | 'working' | 'result' | 'unusable';
const VOWEL_SECONDS = 6;
const READING_MAX = 20;

export default function VoiceCheck() {
  const { config } = useAuth();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [stage, setStage] = useState<Stage>('intro');
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Assessment | null>(null);
  const [model, setModel] = useState<Assessment['model']>();
  const [problems, setProblems] = useState<string[]>([]);
  const vowel = useRef<Assessment | null>(null);
  const sentence = useRef(Math.floor(Math.random() * (config?.sentences.length ?? 1)));
  const busy = useRef(false);
  const task = stage === 'reading' ? 'reading' : 'vowel';
  const limit = task === 'vowel' ? VOWEL_SECONDS : READING_MAX;

  useEffect(() => {
    if (!recording) return;
    const started = Date.now();
    const id = setInterval(() => {
      const s = (Date.now() - started) / 1000;
      setElapsed(s);
      if (s >= limit) void finish();
    }, 100);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording]);

  async function begin() {
    setError('');
    const permission = await AudioModule.requestRecordingPermissionsAsync();
    if (!permission.granted) return setError('Microphone access is needed for this check. Allow it in your phone settings and try again.');
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setElapsed(0);
      setRecording(true);
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function finish() {
    if (busy.current) return;
    busy.current = true;
    setRecording(false);
    const was = task;
    setStage('working');
    try {
      await recorder.stop();
      if (!recorder.uri) throw new Error('The recording could not be saved.');
      // The phone records AAC; the server converts it before measuring.
      const audio = await (await fetch(recorder.uri)).blob();
      const out = await api.analyzeVoice(audio, was, was === 'reading' ? sentence.current : undefined, 'mobile', 'audio/mp4');
      if (!out.assessment.quality.usable) {
        setProblems(out.assessment.quality.problems);
        setStage('unusable');
      } else if (was === 'vowel') {
        vowel.current = out.assessment;
        setStage('reading');
      } else {
        setModel(out.assessment.model);
        setResult(vowel.current ?? out.assessment);
        setStage('result');
      }
    } catch (err) {
      setError(errorText(err));
      setStage(was);
    }
    busy.current = false;
  }

  const retry = (): void => { vowel.current = null; setError(''); setStage('vowel'); };

  return (
    <Screen>
      <View style={styles.head}>
        <Pressable accessibilityLabel="Close" onPress={() => router.back()} style={styles.round}><Icon name="back" /></Pressable>
        <Text style={styles.headTitle}>Voice check{stage === 'vowel' ? ' · 1 of 2' : stage === 'reading' ? ' · 2 of 2' : ''}</Text>
      </View>

      {stage === 'intro' && (
        <View style={{ gap: 14 }}>
          <H1>Two short recordings</H1>
          {['Find a quiet spot and hold the phone a hand-width from your mouth.', 'Say "aaah" in a steady voice for six seconds.', 'Then read one sentence aloud in your normal voice.'].map((s, i) => (
            <View key={s} style={styles.step}><View style={styles.num}><Text style={styles.numText}>{i + 1}</Text></View><Text style={styles.stepText}>{s}</Text></View>
          ))}
          <Card tint={C.goodSoft}><Text style={{ color: C.good, fontWeight: '600' }}>Your recording is measured and then deleted, unless you chose to keep recordings.</Text></Card>
          <Button title="Start" onPress={() => setStage('vowel')} />
        </View>
      )}

      {(stage === 'vowel' || stage === 'reading') && (
        <View style={{ alignItems: 'center', gap: 18 }}>
          <Soft style={{ fontSize: 18, textAlign: 'center' }}>{stage === 'vowel' ? 'Take a breath, tap the button, and say' : 'Tap the button and read this aloud'}</Soft>
          {stage === 'vowel'
            ? <Text style={styles.aah}>"aaah"</Text>
            : <Card><Text style={styles.sentence}>{config?.sentences[sentence.current]}</Text></Card>}
          <Pressable accessibilityLabel={recording ? 'Stop recording' : 'Start recording'} onPress={recording ? () => void finish() : () => void begin()}
            style={[styles.mic, recording && { backgroundColor: C.navy }]}>
            {recording ? <View style={styles.stop} /> : <Icon name="mic" size={56} color={C.white} />}
          </Pressable>
          <View style={styles.track}><View style={[styles.fill, { width: `${Math.min(100, (elapsed / limit) * 100)}%` }]} /></View>
          <Text style={styles.count}>{recording ? (stage === 'vowel' ? `Keep going… ${Math.max(0, Math.ceil(limit - elapsed))}` : 'Tap the square when you finish') : ' '}</Text>
          {error ? <ErrorNote>{error}</ErrorNote> : null}
        </View>
      )}

      {stage === 'working' && <View style={{ height: 300 }}><Loading /></View>}
      {stage === 'unusable' && <Unusable problems={problems} onRetry={retry} />}
      {stage === 'result' && result && (
        <View style={{ gap: 12 }}>
          <Result assessment={result} onAgain={retry} />
          {model && (
            <Card>
              <Text style={styles.scoreLabel}>VOICE SCREENING SCORE</Text>
              <Text style={styles.score}>{Math.round(model.score * 100)}<Text style={styles.scoreOf}> out of 100</Text></Text>
              <Soft style={{ marginTop: 6, fontSize: 13 }}>{voiceModelNote(model.recordings)}</Soft>
            </Card>
          )}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  round: { width: 46, height: 46, borderRadius: 23, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center' },
  headTitle: { fontSize: 18, fontWeight: '800', color: C.ink },
  step: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  num: { width: 28, height: 28, borderRadius: 14, backgroundColor: C.navy, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  numText: { color: C.white, fontWeight: '800' },
  stepText: { flex: 1, fontSize: 18, lineHeight: 26, color: C.ink },
  aah: { fontSize: 56, fontWeight: '800', color: C.navy },
  sentence: { fontSize: 22, lineHeight: 31, fontWeight: '600', color: C.ink, textAlign: 'center' },
  mic: { width: 150, height: 150, borderRadius: 75, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  stop: { width: 46, height: 46, borderRadius: 8, backgroundColor: C.white },
  track: { width: '80%', height: 8, borderRadius: 4, backgroundColor: C.line, overflow: 'hidden' },
  fill: { height: 8, backgroundColor: C.brand },
  count: { fontSize: 18, fontWeight: '700', color: C.ink },
  scoreLabel: { fontSize: 13, fontWeight: '800', color: C.inkFaint, letterSpacing: 1 },
  score: { fontSize: 38, fontWeight: '800', color: C.ink, marginTop: 6 },
  scoreOf: { fontSize: 14, fontWeight: '600', color: C.inkFaint },
});
