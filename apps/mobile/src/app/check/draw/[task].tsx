import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Dimensions, PanResponder, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { type Assessment, CANVAS, drawingFeatures, type DrawingTask, MODALITIES, packStrokes, type Pt, spiralGuide, waveGuide } from '@neurovoice/shared';
import { Result, Unusable } from '@/components/Result';
import { api, errorText } from '@/lib/api';
import { C } from '@/theme';
import { Button, ErrorNote, H1, Icon, Loading, Screen, Soft } from '@/ui';

const COPY: Record<DrawingTask, { title: string; steps: string[]; hint: string }> = {
  spiral: { title: 'Trace the spiral', steps: ['Use the index finger of your writing hand.', 'Start at the centre dot and follow the dashed line outward.', 'Go at a comfortable pace without lifting your finger.'], hint: 'Start from the dot in the centre' },
  wave: { title: 'Trace the wave', steps: ['Use the index finger of your writing hand.', 'Start at the left dot and follow the dashed wave to the right.', 'Try not to lift your finger.'], hint: 'Start from the dot on the left' },
  clock: { title: 'Draw a clock', steps: ['Draw a round clock face.', 'Put in all twelve numbers.', 'Set the hands to ten past eleven.'], hint: 'Draw a clock showing ten past eleven' },
};
const path = (pts: readonly (readonly [number, number])[]): string => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');

function Pad({ task, onDone }: { task: DrawingTask; onDone: (strokes: Pt[][]) => void }) {
  const strokes = useRef<Pt[][]>([]);
  // The pad spans the screen inside 20-point margins (capped by the 560-point page width);
  // onLayout then replaces this with the measured width.
  const size = useRef(Math.min(Dimensions.get('window').width, 560) - 40);
  const [paths, setPaths] = useState<string[]>([]);
  const guide = useMemo(() => (task === 'spiral' ? spiralGuide() : task === 'wave' ? waveGuide() : null), [task]);
  const redraw = (): void => setPaths(strokes.current.map((s) => path(s.map((p) => [p.x, p.y] as const))));

  // Touch positions are scaled into the fixed 300-unit space the scoring uses, so
  // results do not depend on the size of the phone.
  const responder = useMemo(() => {
    const point = (x: number, y: number): Pt => ({ x: (x / size.current) * CANVAS, y: (y / size.current) * CANVAS, t: Date.now() });
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => { strokes.current.push([point(e.nativeEvent.locationX, e.nativeEvent.locationY)]); redraw(); },
      onPanResponderMove: (e) => { strokes.current[strokes.current.length - 1]?.push(point(e.nativeEvent.locationX, e.nativeEvent.locationY)); redraw(); },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={{ gap: 14 }}>
      <Text style={styles.hint}>{COPY[task].hint}</Text>
      <View style={styles.pad} onLayout={(e: LayoutChangeEvent) => { if (e.nativeEvent.layout.width > 0) size.current = e.nativeEvent.layout.width; }} {...responder.panHandlers}>
        <Svg width="100%" height="100%" viewBox={`0 0 ${CANVAS} ${CANVAS}`} pointerEvents="none">
          {guide && <Path d={path(guide)} fill="none" stroke="#E0D8CC" strokeWidth={3} strokeDasharray="2 7" strokeLinecap="round" />}
          {guide && <Circle cx={guide[0]![0]} cy={guide[0]![1]} r={6} fill={C.brand} />}
          {paths.map((d, i) => <Path key={i} d={d} fill="none" stroke={C.navy} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />)}
        </Svg>
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button title="Clear" variant="secondary" onPress={() => { strokes.current = []; redraw(); }} />
        <Button title="I'm finished" onPress={() => onDone(strokes.current)} disabled={!paths.length} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

export default function DrawCheck() {
  const { task } = useLocalSearchParams<{ task: string }>();
  const [stage, setStage] = useState<'intro' | 'draw' | 'working' | 'result' | 'unusable'>('intro');
  const [result, setResult] = useState<Assessment | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [round, setRound] = useState(0);
  if (task !== 'spiral' && task !== 'wave' && task !== 'clock') return <Screen><ErrorNote>Unknown check.</ErrorNote></Screen>;
  const again = (): void => { setRound((n) => n + 1); setStage('draw'); };

  async function done(strokes: Pt[][]) {
    const out = drawingFeatures(task as DrawingTask, strokes);
    if (!out.usable) { setProblems(out.problems); return setStage('unusable'); }
    setStage('working');
    try {
      setResult(await api.submitAssessment({
        type: task as DrawingTask, features: out.features, quality: { usable: true, problems: [] },
        durationS: Math.min(600, out.features.total_time ?? 0), channel: 'mobile', strokes: packStrokes(strokes),
      }));
      setStage('result');
    } catch (err) {
      setError(errorText(err));
      setStage('intro');
    }
  }

  return (
    // Scrolling is off while drawing so a stroke never moves the page.
    <Screen scroll={stage !== 'draw'}>
      <View style={styles.head}>
        <Pressable accessibilityLabel="Close" onPress={() => router.back()} style={styles.round}><Icon name="back" /></Pressable>
        <Text style={styles.headTitle}>{MODALITIES[task].name}</Text>
      </View>
      {stage === 'intro' && (
        <View style={{ gap: 14 }}>
          <H1>{COPY[task].title}</H1>
          {COPY[task].steps.map((s, i) => (
            <View key={s} style={styles.step}><View style={styles.num}><Text style={styles.numText}>{i + 1}</Text></View><Text style={styles.stepText}>{s}</Text></View>
          ))}
          {task === 'clock' && <Soft>Your drawing is saved so a clinician you invite can look at it.</Soft>}
          {error ? <ErrorNote>{error}</ErrorNote> : null}
          <Button title="Start" onPress={() => { setError(''); setStage('draw'); }} />
        </View>
      )}
      {stage === 'draw' && <Pad key={`${task}-${round}`} task={task} onDone={done} />}
      {stage === 'working' && <View style={{ height: 300 }}><Loading /></View>}
      {stage === 'unusable' && <Unusable problems={problems} onRetry={again} />}
      {stage === 'result' && result && <Result assessment={result} onAgain={again} />}
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
  hint: { textAlign: 'center', fontSize: 18, fontWeight: '700', color: C.ink },
  pad: { width: '100%', aspectRatio: 1, backgroundColor: C.white, borderRadius: 28, overflow: 'hidden' },
});
