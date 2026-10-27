import * as WebBrowser from 'expo-web-browser';
import { useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text } from 'react-native';

import { Colors, Fonts } from '@/constants/theme';

const PRIVACY_POLICY_URL = 'https://runary.notion.site/privacy';

export function PrivacyPolicyLink() {
  const opening = useRef(false);
  const [busy, setBusy] = useState(false);
  const openPrivacyPolicy = async () => {
    if (opening.current) return;
    opening.current = true; setBusy(true);
    try {
      await WebBrowser.openBrowserAsync(PRIVACY_POLICY_URL, { dismissButtonStyle: 'close' });
    } catch {
      Alert.alert('개인정보 처리방침을 열지 못했어요', '잠시 후 다시 시도해 주세요.', [
        { text: '닫기', style: 'cancel' },
        { text: '다시 시도', onPress: () => { void openPrivacyPolicy(); } },
      ]);
    } finally {
      opening.current = false; setBusy(false);
    }
  };
  return (
    <Pressable onPress={() => { void openPrivacyPolicy(); }}
      disabled={busy} accessibilityState={{ disabled: busy, busy }}
      accessibilityRole="link" accessibilityLabel="개인정보 처리방침"
      accessibilityHint="앱 내 브라우저에서 열립니다"
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
