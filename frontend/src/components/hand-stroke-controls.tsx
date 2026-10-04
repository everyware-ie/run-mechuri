import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { Colors, Fonts } from '@/constants/theme';
import { INK_COLORS, type HandStroke, type InkBrush } from '@/lib/hand-drawing';
import { Slider } from './slider';

export function HandStrokeBrushes({ brush, onChange }: { brush: InkBrush; onChange: (brush: InkBrush) => void }) {
  return <View style={styles.row}>
    {([{ id: 'pen', label: '펜', symbol: 'pencil.tip' }, { id: 'highlight', label: '형광', symbol: 'highlighter' },
      { id: 'neon', label: '네온', symbol: 'sparkles' }] as const).map(b => <Pressable key={b.id}
      onPress={() => onChange(b.id)} style={[styles.brush, brush === b.id && styles.on]}
      accessibilityRole="button" accessibilityLabel={`선택한 손그림 ${b.label}`} accessibilityState={{ selected: brush === b.id }}>
      <SymbolView name={b.symbol} size={16} tintColor={brush === b.id ? Colors.accentText : Colors.text} />
      <Text style={[styles.brushLabel, brush === b.id && styles.onText]}>{b.label}</Text>
    </Pressable>)}
  </View>;
}
export function HandStrokeControls({ stroke, onChange, onWidthStart, onWidthChange, onWidthCommit }: {
  stroke: HandStroke; onChange: (patch: Partial<Pick<HandStroke, 'brush' | 'color'>>) => void;
  onWidthStart: () => void; onWidthChange: (width: number) => void; onWidthCommit: (width: number) => void;
}) {
  return <View style={styles.root}>
    <View style={[styles.row, styles.palette]}>{INK_COLORS.map(color => <Pressable key={color} onPress={() => onChange({ color })} hitSlop={5}
      style={[styles.swatch, { backgroundColor: color }, stroke.color === color && styles.swatchOn]}
      accessibilityRole="button" accessibilityLabel={`선택한 손그림 색 ${color}`} accessibilityState={{ selected: stroke.color === color }} />)}</View>
    <View style={styles.row}>
      <Text style={styles.label}>굵기</Text>
      <View style={styles.track}><Slider value={stroke.width} minimumValue={4} maximumValue={48}
        accessibilityLabel="선택한 손그림 굵기" onSlidingStart={onWidthStart} onChange={onWidthChange} onSlidingComplete={onWidthCommit} /></View>
      <Text style={styles.value}>{Math.round(stroke.width)}px</Text>
    </View>
    <Text style={styles.hint}>끌어서 옮기고, 두 손가락이나 왼쪽 슬라이더로 크기를 바꿔요.</Text>
  </View>;
}
const styles = StyleSheet.create({
  root: { gap: 14 }, row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brush: { width: 40, height: 44, borderRadius: 22, backgroundColor: 'rgba(11,13,16,.68)', alignItems: 'center', justifyContent: 'center', gap: 3 },
  brushLabel: { color: Colors.text, fontFamily: Fonts.sans, fontSize: 9 },
  on: { backgroundColor: Colors.accent }, onText: { color: Colors.accentText },
  label: { color: Colors.text, fontFamily: Fonts.sans, fontSize: 13 },
  palette: { justifyContent: 'space-between' },
  swatch: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: Colors.textMuted },
  swatchOn: { borderWidth: 3, borderColor: Colors.accent }, track: { flex: 1 }, value: { width: 40, color: Colors.textMuted, fontFamily: Fonts.sans, fontSize: 12 },
  hint: { color: Colors.textMuted, fontFamily: Fonts.sans, fontSize: 11 },
});
