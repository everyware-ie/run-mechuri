import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import { Colors, Fonts } from '@/constants/theme';
import { runNumber, runPace, runTime } from '@/lib/tracking-display';
import type { RunSummary } from '../../modules/run-tracking/src/RunTracking';

export function RunDistanceSummary({ run, completed = false }: { run: RunSummary; completed?: boolean }) {
  return <View style={measureUI.summary}>
    <View style={measureUI.distanceRow}><Text style={measureUI.distance} numberOfLines={1} adjustsFontSizeToFit>{(run.distance / 1000).toFixed(2)}</Text><Text style={measureUI.distanceUnit}>km</Text></View>
    <View style={measureUI.metrics}>
      <Metric label="시간" value={runTime(run.duration)} />
      <Metric label="평균 페이스" value={runPace(run.averagePace)} />
      <Metric label={completed ? '평균 심박' : '심박'} value={runNumber(completed ? run.averageHeartRate : run.heartRate)} heart />
    </View>
  </View>;
}
function Metric({ label, value, heart }: { label: string; value: string; heart?: boolean }) {
  return <View style={measureUI.metric}><Text style={measureUI.label}>{label}</Text><View style={measureUI.metricValueRow}>
    {heart ? <SymbolView name={value === '-' ? 'heart' : 'heart.fill'} size={12} tintColor={value === '-' ? Colors.textMuted : Colors.accent} /> : null}
    <Text style={measureUI.metricValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
  </View>{heart ? <Text style={measureUI.unit}>bpm</Text> : null}</View>;
}
export function RunConnectionRow({ title, value, active, onPress }: { title: string; value: string; active?: boolean; onPress?: () => void }) {
  const contents = <><View style={[measureUI.connectionDot, active && measureUI.connectionDotActive]} /><Text style={measureUI.connectionTitle}>{title}</Text><Text style={measureUI.connectionValue}>{value}</Text>{onPress ? <SymbolView name="chevron.right" size={11} tintColor={Colors.textMuted} /> : null}</>;
  return onPress ? <Pressable accessibilityRole="button" accessibilityLabel={`${title}, ${value}`} onPress={onPress} style={measureUI.connectionRow}>{contents}</Pressable> : <View style={measureUI.connectionRow}>{contents}</View>;
}
export function RunSheet({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <View style={measureUI.modal}><Pressable accessibilityRole="button" accessibilityLabel="시트 닫기" onPress={onClose} style={StyleSheet.absoluteFill} />
      <View accessibilityViewIsModal style={[measureUI.sheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>
        <View style={measureUI.handle} /><View style={measureUI.sheetHeader}><Text accessibilityRole="header" style={measureUI.sheetTitle}>{title}</Text><Pressable accessibilityRole="button" accessibilityLabel="닫기" onPress={onClose} style={measureUI.close}><SymbolView name="xmark" size={15} tintColor={Colors.textMuted} /></Pressable></View>
        <ScrollView contentContainerStyle={measureUI.sheetBody} keyboardShouldPersistTaps="handled">{children}</ScrollView>
      </View>
    </View>
  </Modal>;
}
export const measureUI = StyleSheet.create({
  summary: { gap: 18 }, distanceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 7 },
  distance: { color: Colors.text, fontFamily: Fonts.sansBold, fontSize: 80, letterSpacing: -3, fontVariant: ['tabular-nums'], flexShrink: 1 },
  distanceUnit: { color: Colors.textMuted, fontFamily: Fonts.sansBold, fontSize: 18 },
  metrics: { flexDirection: 'row', gap: 12 }, metric: { flex: 1, gap: 6 }, label: { color: Colors.textMuted, fontFamily: Fonts.sans, fontSize: 11 },
  metricValueRow: { flexDirection: 'row', alignItems: 'center', gap: 4 }, metricValue: { color: Colors.text, fontFamily: Fonts.sansBold, fontSize: 24, fontVariant: ['tabular-nums'], flexShrink: 1 },
  unit: { color: Colors.textMuted, fontFamily: Fonts.sans, fontSize: 10 },
  connections: { borderTopWidth: 1, borderColor: Colors.border }, connectionRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderColor: Colors.border, paddingVertical: 10 },
  connectionDot: { width: 7, height: 7, borderRadius: 4, borderWidth: 1, borderColor: Colors.textMuted }, connectionDotActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  connectionTitle: { color: Colors.text, fontFamily: Fonts.sans, fontSize: 13 }, connectionValue: { flex: 1, textAlign: 'right', color: Colors.textMuted, fontFamily: Fonts.sans, fontSize: 12 },
  statusBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, watchStatus: { color: Colors.textMuted, fontFamily: Fonts.sans, fontSize: 11, flexShrink: 1, textAlign: 'right' },
  secondary: { flexDirection: 'row', gap: 16, paddingVertical: 2, flexWrap: 'wrap' }, secondaryText: { color: Colors.textMuted, fontFamily: Fonts.sans, fontSize: 12 },
  statusNotice: { color: Colors.textMuted, fontFamily: Fonts.sans, fontSize: 12, lineHeight: 18 },
  modal: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' }, sheet: { maxHeight: '90%', backgroundColor: Colors.bgCard, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 24 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.borderStrong, alignSelf: 'center', marginTop: 10, marginBottom: 16 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, sheetTitle: { color: Colors.text, fontFamily: Fonts.sansBold, fontSize: 22, flex: 1 },
  close: { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' }, sheetBody: { gap: 20, paddingTop: 12, paddingBottom: 8 },
  setting: { backgroundColor: Colors.bg, borderRadius: 20, padding: 16, gap: 10 }, settingHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, settingTitle: { color: Colors.text, fontFamily: Fonts.sansBold, fontSize: 15, flex: 1 },
});
