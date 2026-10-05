import { useEffect, useLayoutEffect, useRef } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts } from '@/constants/theme';

import NativePicker from './native-route-color-picker';

/** 시작 색은 고정하고 후보만 미리보기에 전달한다. 닫기는 완료 또는 취소로 처리한다. */
export function RouteColorPicker({ color, onPreview, onFinish }: {
  color: string; onPreview: (color: string) => void; onFinish: (color: string | null) => void;
}) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const selection = useRef(color);
  const finished = useRef(false);
  const callbacks = useRef({ onPreview, onFinish });
  useLayoutEffect(() => { callbacks.current = { onPreview, onFinish }; });
  const finish = (save: boolean) => {
    if (finished.current) return;
    finished.current = true;
    callbacks.current.onFinish(save ? selection.current : null);
  };
  useEffect(() => () => {
    if (!finished.current) { finished.current = true; callbacks.current.onFinish(null); }
  }, []);
  return <Modal transparent animationType="slide" onRequestClose={() => finish(false)}>
    <View style={styles.overlay}>
      <Pressable style={styles.backdrop} onPress={() => finish(false)} accessibilityLabel="색상 선택 취소" />
      <View style={[styles.sheet, { height: Math.min(height * .78, 700), paddingBottom: insets.bottom }]} accessibilityViewIsModal>
        <View style={styles.header}>
          <Pressable onPress={() => finish(false)} style={styles.action} accessibilityRole="button" accessibilityLabel="색상 선택 취소"><Text style={styles.cancel}>취소</Text></Pressable>
          <Text style={styles.title}>경로 색상</Text>
          <Pressable onPress={() => finish(true)} style={styles.action} accessibilityRole="button" accessibilityLabel="색상 선택 완료"><Text style={styles.done}>완료</Text></Pressable>
        </View>
        <NativePicker color={color} style={styles.picker} onColorChange={event => {
          const hex = event.nativeEvent.color;
          if (!finished.current && /^#[0-9a-f]{6}$/i.test(hex)) {
            selection.current = hex.toUpperCase(); callbacks.current.onPreview(selection.current);
          }
        }} />
      </View>
    </View>
  </Modal>;
}
const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,.12)' },
  sheet: { backgroundColor: Colors.bgCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
  header: { height: 52, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12 },
  action: { minWidth: 52, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  title: { color: Colors.text, fontFamily: Fonts.sansBold, fontSize: 15 },
  cancel: { color: Colors.textMuted, fontFamily: Fonts.sans, fontSize: 14 },
  done: { color: Colors.accent, fontFamily: Fonts.sansBold, fontSize: 14 },
  picker: { flex: 1 },
});
