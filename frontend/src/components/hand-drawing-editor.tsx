import { Skia } from '@shopify/react-native-skia';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Alert, AppState, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { Colors, Fonts } from '@/constants/theme';
import { eraseHandStrokes, inkPoint, INK_COLORS, MAX_INK_POINTS, MAX_STROKES, type HandStroke, type InkBrush, type InkPoint } from '@/lib/hand-drawing';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '@/lib/route-projection';
import type { ActiveHandStroke } from './hand-drawing-layer';
import { VerticalSlider } from './vertical-slider';

const newStrokeId = () => `ink-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const BRUSHES = [{ id: 'pen', label: '펜', symbol: 'pencil.tip' }, { id: 'highlight', label: '형광', symbol: 'highlighter' },
  { id: 'neon', label: '네온', symbol: 'sparkles' }, { id: 'eraser', label: '지우개', symbol: 'eraser' }] as const;
export type HandDrawingPreview = { strokes: HandStroke[]; active?: ActiveHandStroke };
type Props = {
  initial: HandStroke[]; canvasSize: { width: number; height: number };
  onPreviewChange: (preview: HandDrawingPreview) => void;
  onChange: (strokes: HandStroke[]) => void; onDone: () => void;
};
export function HandDrawingEditor({ initial, canvasSize, onPreviewChange, onChange, onDone }: Props) {
  const [strokes, setStrokes] = useState(initial), [history, setHistory] = useState<HandStroke[][]>([]);
  const [brush, setBrush] = useState<InkBrush | 'eraser'>('pen'), [color, setColor] = useState('#FFFFFF'), [width, setWidth] = useState(12);
  const path = useSharedValue(Skia.Path.Make());
  const sizeRef = useRef(canvasSize), strokesRef = useRef(strokes);
  useLayoutEffect(() => { sizeRef.current = canvasSize; }, [canvasSize]);
  const options = useRef({ brush, color, width, onChange });
  useLayoutEffect(() => { options.current = { brush, color, width, onChange }; }, [brush, color, width, onChange]);
  // 기존 미리보기를 유지하고 SharedValue 경로만 연결한다. 점마다 React를 다시 그리지 않는다.
  useLayoutEffect(() => {
    onPreviewChange({ strokes, active: brush === 'eraser' ? undefined : { path, brush, color, width } });
  }, [strokes, brush, color, width, path, onPreviewChange]);
  const gesture = useRef<{ before: HandStroke[]; stroke?: HandStroke; previous: InkPoint; remaining: number; limited: boolean } | null>(null);
  const local = useCallback((next: HandStroke[]) => { strokesRef.current = next; setStrokes(next); }, []);
  const finish = useRef(() => {});
  const finishStroke = useCallback(() => {
    const g = gesture.current;
    if (!g) return;
    gesture.current = null;
    const next = g.stroke ? [...g.before, g.stroke] : strokesRef.current;
    path.set(Skia.Path.Make());
    if (next !== g.before) {
      setHistory(previous => [...previous.slice(-59), g.before]);
      local(next); options.current.onChange(next);
    }
    if (g.limited) Alert.alert('손그림이 꽉 찼어요', '획을 지우거나 되돌린 뒤 이어서 그려 주세요.');
  }, [local, path]);
  useLayoutEffect(() => { finish.current = finishStroke; }, [finishStroke]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => { if (state !== 'active') finish.current(); });
    return () => subscription.remove();
  }, []);
  const pointFor = (x: number, y: number) => inkPoint(x * CANVAS_WIDTH / Math.max(1, sizeRef.current.width), y * CANVAS_HEIGHT / Math.max(1, sizeRef.current.height));
  // 아래 ref는 PanResponder의 터치 콜백에서만 읽는다. 생성 시에는 콜백을 실행하지 않는다.
  // eslint-disable-next-line react-hooks/refs
  const [pan] = useState(() => PanResponder.create({
    onStartShouldSetPanResponder: evt => evt.nativeEvent.touches.length === 1,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: evt => {
      const point = pointFor(evt.nativeEvent.locationX, evt.nativeEvent.locationY), o = options.current;
      const before = strokesRef.current;
      const remaining = MAX_INK_POINTS - before.reduce((n, s) => n + s.points.length, 0);
      const g = { before, previous: point, remaining, limited: false } as NonNullable<typeof gesture.current>;
      gesture.current = g;
      if (o.brush === 'eraser') { local(eraseHandStrokes(before, point, point, Math.max(24, o.width))); return; }
      if (remaining < 1 || before.length >= MAX_STROKES) { g.limited = true; return; }
      g.stroke = { id: newStrokeId(), brush: o.brush, color: o.color, width: o.width, points: [point] };
      const p = Skia.Path.Make(); p.moveTo(point.x, point.y); p.lineTo(point.x + .1, point.y); path.set(p);
    },
    onPanResponderMove: evt => {
      const g = gesture.current;
      if (!g || evt.nativeEvent.touches.length !== 1) return;
      const point = pointFor(evt.nativeEvent.locationX, evt.nativeEvent.locationY);
      if (options.current.brush === 'eraser') {
        const next = eraseHandStrokes(strokesRef.current, g.previous, point, Math.max(24, options.current.width));
        if (next !== strokesRef.current) local(next);
        g.previous = point;
      } else if (g.stroke && Math.hypot(point.x - g.previous.x, point.y - g.previous.y) >= 3) {
        if (g.stroke.points.length >= g.remaining) { g.limited = true; return; }
        g.stroke.points.push(point);
        g.previous = point;
        const p = path.get().copy(); p.lineTo(point.x, point.y); path.set(p);
      }
    },
    onPanResponderRelease: () => finish.current(), onPanResponderTerminate: () => finish.current(),
  }));
  const undo = () => {
    const previous = history.at(-1); if (!previous) return;
    setHistory(h => h.slice(0, -1)); local(previous); onChange(previous);
  };
  return <View style={StyleSheet.absoluteFill}>
    <View style={StyleSheet.absoluteFill} {...pan.panHandlers} accessibilityLabel="손그림 캔버스" />
    <View style={styles.header}>
      <Pressable onPress={undo} disabled={!history.length} style={[styles.button, !history.length && styles.disabled]}
        accessibilityRole="button" accessibilityLabel="손그림 되돌리기" accessibilityState={{ disabled: !history.length }}>
        <SymbolView name="arrow.counterclockwise" size={17} tintColor={Colors.text} />
      </Pressable>
      <View style={styles.brushRow}>{BRUSHES.map(b => <Pressable key={b.id} onPress={() => setBrush(b.id)}
        style={[styles.button, brush === b.id && styles.selected]} accessibilityRole="button" accessibilityLabel={b.label} accessibilityState={{ selected: brush === b.id }}>
        <SymbolView name={b.symbol} size={16} tintColor={brush === b.id ? Colors.bg : Colors.text} />
        <Text style={[styles.brushLabel, brush === b.id && styles.selectedLabel]}>{b.label}</Text>
      </Pressable>)}</View>
      <Pressable onPress={() => { finish.current(); onDone(); }} style={styles.done} accessibilityRole="button" accessibilityLabel="그리기 완료">
        <Text style={styles.doneText}>완료</Text>
      </Pressable>
    </View>
    <View style={styles.slider}><VerticalSlider value={width} minimumValue={4} maximumValue={48} unit="px"
      accessibilityLabel={brush === 'eraser' ? '지우개 크기' : '붓 굵기'} onChange={setWidth} onSlidingComplete={setWidth} /></View>
    <View style={styles.palette}>{INK_COLORS.map(c => <Pressable key={c} onPress={() => setColor(c)} style={[styles.swatch, { backgroundColor: c }, color === c && styles.swatchOn]}
      accessibilityRole="button" accessibilityLabel={`손그림 색 ${c}`} accessibilityState={{ selected: c === color }} hitSlop={5} />)}</View>
    {strokes.length === 0 && <View pointerEvents="none" style={styles.hint}><Text style={styles.hintText}>경로 옆에 자유롭게 그려 보세요</Text></View>}
  </View>;
}
const styles = StyleSheet.create({
  header: { position: 'absolute', top: 14, left: 10, right: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brushRow: { flexDirection: 'row', gap: 4 }, button: { width: 40, height: 44, borderRadius: 22, backgroundColor: 'rgba(11,13,16,.68)', alignItems: 'center', justifyContent: 'center', gap: 3 },
  brushLabel: { color: Colors.text, fontFamily: Fonts.sans, fontSize: 9 }, selected: { backgroundColor: Colors.text }, selectedLabel: { color: Colors.bg },
  disabled: { opacity: .4 }, done: { backgroundColor: Colors.text, borderRadius: 20, height: 40, paddingHorizontal: 13, justifyContent: 'center' },
  doneText: { fontFamily: Fonts.sansBold, fontSize: 12, color: Colors.bg }, slider: { position: 'absolute', left: 2, top: '27%', height: '30%' },
  palette: { position: 'absolute', bottom: 18, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 8, paddingVertical: 8, backgroundColor: 'rgba(11,13,16,.45)', borderRadius: 24 },
  swatch: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,.3)' }, swatchOn: { borderWidth: 3, borderColor: Colors.accent },
  hint: { position: 'absolute', top: '50%', left: 0, right: 0, alignItems: 'center' }, hintText: { color: Colors.text, fontFamily: Fonts.sans, fontSize: 12, backgroundColor: 'rgba(11,13,16,.6)', padding: 10, borderRadius: 16 },
});
