import { useLayoutEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Colors, Fonts } from '@/constants/theme';
import { STAMP_LAYOUTS, type StampLayout } from './route-preview';

const WIDTH = 60, GAP = 8;
// 실제 배치의 특징을 작은 막대로 표현한다. 기록 값·개인 문구는 표시하지 않는다.
const MARKS: Record<Exclude<StampLayout, 'row'>, number[][]> = {
  corner: [[0,12,12,6], [21,0,7,2], [21,5,7,2], [21,10,7,2]],
  glass: [[3,3,11,5], [3,12,5,2], [11,12,5,2], [19,12,5,2]],
  rail: [[2,0,1,18], [6,0,13,5], [6,8,9,2], [6,13,9,2]],
  stack: [[2,8,16,6], [2,17,6,1], [10,17,6,1], [18,17,6,1]],
  bar: [[0,4,28,1], [0,9,5,7], [8,9,5,7], [16,9,5,7], [24,9,4,7]],
  line: [[0,11,5,2], [7,11,5,2], [14,11,5,2], [21,11,7,2]],
};
export function StampPresetSelector({ value, onChange }: { value: StampLayout; onChange: (layout: StampLayout) => void }) {
  const scroll = useRef<ScrollView>(null);
  const [viewport, setViewport] = useState(0);
  useLayoutEffect(() => {
    const index = STAMP_LAYOUTS.findIndex(layout => layout.id === value);
    if (viewport > 0 && index >= 0) scroll.current?.scrollTo({ x: Math.max(0, 6 + index * (WIDTH + GAP) - (viewport - WIDTH) / 2), animated: false });
  }, [value, viewport]);
  return <ScrollView ref={scroll} horizontal style={styles.root} showsHorizontalScrollIndicator={false}
    contentContainerStyle={styles.list} onLayout={event => setViewport(event.nativeEvent.layout.width)}>
    {STAMP_LAYOUTS.map(layout => {
      const selected = layout.id === value, color = selected ? Colors.accentText : Colors.text;
      return <Pressable key={layout.id} onPress={() => onChange(layout.id)} style={[styles.button, selected && styles.selected]}
        accessibilityRole="button" accessibilityLabel={`러닝 데이터 프리셋 ${layout.label}`} accessibilityState={{ selected }}>
        <View accessible={false} style={[styles.sample, layout.id === 'glass' && { borderWidth: 1, borderColor: color, borderRadius: 3 }]}>
          {MARKS[layout.id as Exclude<StampLayout, 'row'>].map(([left, top, width, height], i) =>
            <View key={i} style={{ position: 'absolute', left, top, width, height, borderRadius: 1, backgroundColor: color }} />)}
        </View>
        <Text style={[styles.label, { color }]}>{layout.label}</Text>
      </Pressable>;
    })}
  </ScrollView>;
}
const styles = StyleSheet.create({
  root: { flex: 1, minWidth: 0 }, list: { gap: GAP, paddingHorizontal: 6 },
  button: { width: WIDTH, minHeight: 48, paddingVertical: 5, borderRadius: 16, gap: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(11,13,16,.55)' },
  selected: { backgroundColor: Colors.accent }, sample: { width: 28, height: 20 },
  label: { fontFamily: Fonts.sans, fontSize: 10 },
});
