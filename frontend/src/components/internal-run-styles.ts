import { StyleSheet } from 'react-native';
import { Colors, Fonts } from '@/constants/theme';

export const trackingStyles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg }, body: { padding: 24, gap: 16, paddingBottom: 50 },
  title: { color: Colors.text, fontFamily: Fonts.sansBold, fontSize: 19, marginTop: 8 },
  text: { color: Colors.text, fontFamily: Fonts.sans, fontSize: 14, lineHeight: 22 },
  subtitle: { color: Colors.textMuted, fontFamily: Fonts.sans, fontSize: 12, lineHeight: 18 },
  notice: { color: Colors.accent, fontFamily: Fonts.sans, fontSize: 13, lineHeight: 20 },
  link: { color: Colors.accent, fontFamily: Fonts.sans, fontSize: 13 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  metric: { width: '47%', padding: 18, borderRadius: 20, backgroundColor: Colors.bgCard, gap: 6 },
  value: { color: Colors.text, fontFamily: Fonts.sansBold, fontSize: 34 }, smallButton: { paddingVertical: 12 },
});
