import { Alert, Linking, Pressable, StyleSheet, Text } from 'react-native';

import { Colors, Fonts } from '@/constants/theme';

const PRIVACY_POLICY_URL = 'https://phs00.notion.site/privacy';

async function openPrivacyPolicy() {
  try {
    await Linking.openURL(PRIVACY_POLICY_URL);
  } catch {
    Alert.alert('개인정보 처리방침을 열지 못했어요', '잠시 후 다시 시도해 주세요.', [
      { text: '닫기', style: 'cancel' },
      { text: '다시 시도', onPress: () => { void openPrivacyPolicy(); } },
    ]);
  }
}

export function PrivacyPolicyLink() {
  return (
    <Pressable onPress={() => { void openPrivacyPolicy(); }}
      accessibilityRole="link" accessibilityLabel="개인정보 처리방침"
      accessibilityHint="기본 브라우저에서 열립니다"
      style={({ pressed }) => [styles.link, pressed && styles.pressed]}>
      <Text style={styles.text}>개인정보 처리방침 ↗</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  link: { minHeight: 44, paddingHorizontal: 12, alignSelf: 'center', alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.6 },
  text: { fontFamily: Fonts.sans, fontSize: 12, color: Colors.textMuted, textDecorationLine: 'underline' },
});
