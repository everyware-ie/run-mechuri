import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';

// "3안" 시안의 화면 상단 행 — 네이티브 내비 바 대신 쓴다(_layout.tsx headerShown: false).
// 왼쪽 뒤로가기(←)·가운데 제목·오른쪽 슬롯. 시안 기준: ← 는 #7C8894 17px,
// 제목은 Space Grotesk 500 13px.

type Props = {
  title?: string;
  /** 없으면 뒤로가기 화살표를 숨긴다(홈처럼 최상위 화면). */
  onBack?: (() => void) | null;
  /** 오른쪽 끝 요소(예: "다음", 메뉴). 없으면 좌우 균형용 빈 자리. */
  right?: ReactNode;
};

export function ScreenHeader({ title, onBack, right }: Props) {
  const showBack = onBack !== null;
  return (
    <View style={styles.row}>
      <View style={styles.side}>
        {showBack && (
          <Pressable
            onPress={onBack ?? (() => router.back())}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="뒤로">
            <Text style={styles.back}>←</Text>
          </Pressable>
        )}
      </View>
      {title ? <Text style={styles.title}>{title}</Text> : <View />}
      <View style={[styles.side, styles.sideRight]}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 6,
    paddingBottom: 12,
  },
  side: { minWidth: 40, justifyContent: 'center' },
  sideRight: { alignItems: 'flex-end' },
  back: { fontSize: 20, color: Colors.textMuted, lineHeight: 22 },
  title: { fontFamily: 'SpaceGrotesk_500Medium', fontSize: 13, color: Colors.text },
});
