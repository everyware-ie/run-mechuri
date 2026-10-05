import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Colors, Fonts } from '@/constants/theme';

export function RunMetric({ title, value, unit, compact = false }: { title: string; value: string; unit: string; compact?: boolean }) {
  return <View style={[runUI.metric, compact && runUI.compactMetric]}>
    <Text style={runUI.label}>{title}</Text>
    <Text style={[runUI.number, compact && runUI.compactNumber]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    <Text style={runUI.unit}>{unit}</Text>
  </View>;
}
export function RunStatus({ label, active = false }: { label: string; active?: boolean }) {
  return <View style={runUI.status}><View style={[runUI.dot, active && runUI.dotActive]} /><Text style={[runUI.statusText, active && { color: Colors.accent }]}>{label}</Text></View>;
}
export function RunDisclosure({ label, open, onPress, children }: { label: string; open: boolean; onPress: () => void; children: ReactNode }) {
  return <View style={runUI.disclosure}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={onPress} style={runUI.disclosureButton}>
      <Text style={runUI.disclosureLabel}>{label}</Text><SymbolView name={open ? 'chevron.up' : 'chevron.down'} size={13} tintColor={Colors.textMuted} />
    </Pressable>{open ? <View style={runUI.disclosureContent}>{children}</View> : null}
  </View>;
}
export function RunAction({ title, symbol, primary = false, disabled = false, onPress }: { title: string; symbol: SymbolViewProps['name']; primary?: boolean; disabled?: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [runUI.action, primary && runUI.actionPrimary, disabled && { opacity: 0.4 }, pressed && !disabled && { opacity: 0.75 }]}>
    <SymbolView name={symbol} size={19} tintColor={primary ? Colors.accentText : Colors.text} /><Text style={[runUI.actionText, primary && { color: Colors.accentText }]}>{title}</Text>
  </Pressable>;
}
export const runUI = StyleSheet.create({
  body: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 28, gap: 22 },
  hero: { alignItems: 'center', gap: 20, paddingTop: 12, paddingBottom: 6 },
  orbit: { width: 150, height: 150, borderRadius: 75, borderWidth: 1, borderColor: 'rgba(255,90,43,0.18)', alignItems: 'center', justifyContent: 'center' },
  orbitInner: { width: 112, height: 112, borderRadius: 56, backgroundColor: 'rgba(255,90,43,0.09)', borderWidth: 1, borderColor: 'rgba(255,90,43,0.28)', alignItems: 'center', justifyContent: 'center' },
  headline: { color: Colors.text, fontFamily: Fonts.sansBold, fontSize: 28, lineHeight: 37, textAlign: 'center' },
  eyebrow: { color: Colors.textMuted, fontFamily: Fonts.sans, fontSize: 10, letterSpacing: 2 },
  center: { alignItems: 'center', gap: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', borderWidth: 1, borderColor: Colors.border, borderRadius: 24, overflow: 'hidden', backgroundColor: Colors.bgCard },
  metric: { width: '50%', paddingHorizontal: 18, paddingVertical: 22, gap: 10, borderWidth: 0.5, borderColor: Colors.border },
  mapBody: { gap: 14, paddingTop: 12 },
  compactMetric: { paddingVertical: 12, gap: 5 },
  compactNumber: { fontSize: 30 },
  mapHeadline: { fontSize: 23, lineHeight: 31 },
  label: { color: Colors.textMuted, fontFamily: Fonts.sans, fontSize: 12 },
  number: { color: Colors.text, fontFamily: Fonts.sansBold, fontSize: 40, fontVariant: ['tabular-nums'] },
  unit: { color: Colors.textMuted, fontFamily: Fonts.sans, fontSize: 11 },
  status: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.textMuted },
  dotActive: { backgroundColor: Colors.accent },
  statusText: { color: Colors.textMuted, fontFamily: Fonts.sansBold, fontSize: 12 },
  support: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  supportItem: { flex: 1, gap: 7, alignItems: 'center' },
  supportValue: { color: Colors.text, fontFamily: Fonts.sans, fontSize: 14, fontVariant: ['tabular-nums'] },
  watch: { flexDirection: 'row', alignItems: 'center', gap: 14, borderTopWidth: 1, borderBottomWidth: 1, borderColor: Colors.border, paddingVertical: 18 },
  watchText: { flex: 1, gap: 5 },
  footer: { paddingHorizontal: 24, paddingTop: 14, paddingBottom: 10, gap: 10, borderTopWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bg },
  actions: { flexDirection: 'row', gap: 12 },
  action: { flex: 1, minHeight: 64, paddingHorizontal: 12, paddingVertical: 15, borderRadius: 32, borderWidth: 1, borderColor: Colors.borderStrong, flexDirection: 'row', gap: 9, alignItems: 'center', justifyContent: 'center' },
  actionPrimary: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  actionText: { color: Colors.text, fontFamily: Fonts.sansBold, fontSize: 15, flexShrink: 1 },
  footnote: { color: Colors.textMuted, fontFamily: Fonts.sans, fontSize: 11, lineHeight: 16, textAlign: 'center' },
  disclosure: { borderTopWidth: 1, borderColor: Colors.border },
  disclosureButton: { minHeight: 52, paddingVertical: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  disclosureLabel: { color: Colors.textMuted, fontFamily: Fonts.sans, fontSize: 13 },
  disclosureContent: { gap: 14, paddingBottom: 12 },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 16, borderBottomWidth: 1, borderColor: Colors.border },
  historyIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.bgCard, justifyContent: 'center', alignItems: 'center' },
  historyText: { flex: 1, gap: 6 },
  error: { borderRadius: 16, padding: 14, backgroundColor: 'rgba(255,90,43,0.08)' },
  route: { backgroundColor: Colors.bgCard, borderRadius: 24, padding: 20 },
  emptyRoute: { padding: 22, borderRadius: 20, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', gap: 12 },
});
