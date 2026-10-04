import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { RouteColorPicker } from './route-color-picker';
import { Colors, Fonts } from '@/constants/theme';
import { LINE_WIDTH_MAX, LINE_WIDTH_MIN, ROUTE_COLORS, STAMP_FONTS, resolveRouteStyle, resolveStampFont, type RouteStyle, type TextStyleChoice } from '@/lib/editor-style';
import { Slider } from './slider';

export function RouteStyleControls({ value, onChange, onSlidingStart, onSlidingComplete, onColorPreview, onColorSelectionEnd, active = true }: {
  value?: RouteStyle;
  active?: boolean;
  onChange: (value: RouteStyle) => void;
  onSlidingStart: () => void;
  onSlidingComplete: (value: RouteStyle) => void;
  onColorPreview?: (color: string | null) => void;
  onColorSelectionEnd?: () => void;
}) {
  const resolved = resolveRouteStyle(value);
  const [pickerColor, setPickerColor] = useState<string | null>(null);
  const custom = !ROUTE_COLORS.some(c => c.hex === resolved.color);
  return <View style={styles.content}>
    <View style={styles.colors}>
      {ROUTE_COLORS.map(color => {
        const selected = color.hex === resolved.color;
        return <Pressable key={color.id} onPress={() => onSlidingComplete({ ...value, color: color.id })}
          style={[styles.colorHit, selected && styles.colorSelected]}
          accessibilityRole="button" accessibilityLabel={`선 색 ${color.label}`} accessibilityState={{ selected }}>
          <View style={[styles.swatch, { backgroundColor: color.hex }]} />
        </Pressable>;
      })}
      {Platform.OS === 'ios' && <Pressable style={[styles.colorHit, custom && styles.colorSelected]}
        accessibilityRole="button" accessibilityLabel="더 많은 색" accessibilityState={{ selected: custom }}
        onPress={() => { onSlidingStart(); setPickerColor(resolved.color); }}>
        <Svg width={28} height={28} viewBox="0 0 28 28">
          <Defs><LinearGradient id="route-rainbow" x1="0%" y1="0%" x2="100%" y2="100%">
            {['#FF5656', '#FFD84D', '#55E5AB', '#509CFF', '#BD6AFF'].map((color, i) => <Stop key={color} offset={`${i * 25}%`} stopColor={color} />)}
          </LinearGradient></Defs>
          <Circle cx={14} cy={14} r={14} fill="url(#route-rainbow)" />
          {custom && <Circle cx={14} cy={14} r={9} fill={resolved.color} stroke={Colors.bgCard} strokeWidth={2} />}
        </Svg>
      </Pressable>}
    </View>
    <View style={styles.sliderRow}>
      <Text style={styles.label}>두께</Text>
      <View style={styles.track}><Slider value={resolved.widthScale * 100}
        minimumValue={LINE_WIDTH_MIN} maximumValue={LINE_WIDTH_MAX} accessibilityLabel="선 두께"
        onSlidingStart={onSlidingStart} onChange={width => onChange({ ...value, widthScale: width / 100 })}
        onSlidingComplete={width => onSlidingComplete({ ...value, widthScale: width / 100 })} /></View>
      <Text style={styles.value}>{Math.round(resolved.widthScale * 100)}%</Text>
    </View>
    {active && pickerColor !== null && <RouteColorPicker color={pickerColor} onPreview={color => onColorPreview?.(color)}
      onFinish={color => {
        onColorPreview?.(null);
        if (color !== null) onSlidingComplete({ ...value, color: color as `#${string}` });
        onColorSelectionEnd?.();
        setPickerColor(null);
      }} />}
  </View>;
}

export function TextStyleControls({ value, onChange }: { value: TextStyleChoice; onChange: (value: TextStyleChoice) => void }) {
  return <View style={styles.content}>
    <View style={styles.fonts}>{STAMP_FONTS.map(font => {
      const selected = (value.font ?? 'preset') === font.id;
      return <Pressable key={font.id} onPress={() => onChange({ ...value, font: font.id })}
        style={[styles.fontChip, selected && styles.chipSelected]}
        accessibilityRole="button" accessibilityLabel={`폰트 ${font.label}`} accessibilityState={{ selected }}>
        <Text style={[styles.sample, { fontFamily: resolveStampFont(font.id, 'SpaceGrotesk_700Bold') }]}>오늘 5.24</Text>
        <Text style={[styles.fontLabel, selected && styles.selectedLabel]}>{font.label}</Text>
      </Pressable>;
    })}</View>
    <View style={styles.textColors}>
      <Text style={styles.label}>글자 색</Text>
      {([{ id: undefined, label: '기본' }, { id: 'white', label: '흰색' }, { id: 'black', label: '검정' }] as const).map(color => {
        const selected = value.textColor === color.id;
        return <Pressable key={color.label} onPress={() => onChange({ ...value, textColor: color.id })}
          style={[styles.textChip, selected && styles.chipSelected]}
          accessibilityRole="button" accessibilityLabel={`글자 색 ${color.label}`} accessibilityState={{ selected }}>
          <Text style={[styles.fontLabel, selected && styles.selectedLabel]}>{color.label}</Text>
        </Pressable>;
      })}
    </View>
    <Text style={styles.note}>폰트와 글자 색은 문구에도 함께 적용돼요.</Text>
  </View>;
}

const styles = StyleSheet.create({
  content: { gap: 12 },
  colors: { flexDirection: 'row', justifyContent: 'space-between' },
  colorHit: { width: 44, flexShrink: 1, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  colorSelected: { borderColor: Colors.accent },
  swatch: { width: 28, height: 28, borderRadius: 14 },
  sliderRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  label: { fontFamily: Fonts.sans, fontSize: 12, color: Colors.textMuted },
  track: { flex: 1 },
  value: { minWidth: 42, fontFamily: Fonts.sans, fontSize: 12, color: Colors.accent, textAlign: 'right' },
  fonts: { flexDirection: 'row', gap: 6 },
  fontChip: { flex: 1, minHeight: 64, padding: 8, borderRadius: 12, justifyContent: 'center', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: Colors.borderStrong },
  chipSelected: { borderColor: Colors.accent, backgroundColor: 'rgba(255,90,43,0.12)' },
  sample: { fontSize: 17, color: Colors.text },
  fontLabel: { fontFamily: Fonts.sans, fontSize: 11, color: Colors.textMuted, textAlign: 'center' },
  selectedLabel: { color: Colors.accent },
  textColors: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  textChip: { flex: 1, minHeight: 44, borderWidth: 1, borderColor: Colors.borderStrong, borderRadius: 22, alignItems: 'center', justifyContent: 'center', padding: 8 },
  note: { fontFamily: Fonts.sans, fontSize: 11, lineHeight: 16, color: Colors.textMuted },
});
