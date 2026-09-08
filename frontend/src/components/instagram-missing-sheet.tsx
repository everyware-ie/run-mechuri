import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';

import { ThemedButton } from './ui';

// "3a" 시안(메추리 앱 시안 (오프라인)) S8b-상세: 인스타그램 미설치 안내는 OS 기본
// Alert가 아니라 앱 디자인("1a 야간 네온")에 맞춘 카드로 보여준다(2026-09-08,
// 이미지 UI 반영 — docs/product/features/export-and-share.md 참고). §3-2: 배경을
// 살짝 남기고 어둡게 스크림을 깔아 "화면 안에서" 안내가 뜨는 느낌을 낸다.
//
// primaryLabel/onPrimary는 선택이다 — share.tsx(아직 사진앱에 안 남은 결과물)는
// "기기에 저장"을 이어서 제공하지만, result/[id].tsx(이미 보관함에 있는 결과물)는
// 저장 동작이 따로 없어 "닫기"만 준다.
type Props = {
  visible: boolean;
  description: string;
  primaryLabel?: string;
  onPrimary?: () => void;
  onClose: () => void;
};

export function InstagramMissingSheet({ visible, description, primaryLabel, onPrimary, onClose }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.scrim}>
        <View style={styles.card}>
          <Text style={styles.title}>인스타그램이 없습니다</Text>
          <Text style={styles.desc}>{description}</Text>
          {onPrimary && primaryLabel && (
            <ThemedButton title={primaryLabel} onPress={onPrimary} style={styles.primaryButton} />
          )}
          <Pressable onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeText}>닫기</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(11,13,16,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  card: {
    alignSelf: 'stretch',
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  title: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 18, color: Colors.text },
  desc: {
    fontFamily: 'JetBrainsMono_500Medium',
    fontSize: 12.5,
    color: Colors.textMuted,
    lineHeight: 18,
    marginBottom: Spacing.sm,
  },
  primaryButton: { marginTop: Spacing.xs },
  closeButton: { alignItems: 'center', paddingVertical: Spacing.sm },
  closeText: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 13, color: Colors.textMuted },
});
