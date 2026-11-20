import * as AppleAuthentication from 'expo-apple-authentication';
import { useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrivacyPolicyLink } from '@/components/privacy-policy-link';
import { ScreenHeader } from '@/components/screen-header';
import { Colors, Fonts } from '@/constants/theme';
import { signInWithApple, signInWithKakao, type ProviderCredential } from '@/lib/account';

// 로그인 FRD §3-1 로그인 수단 선택, §3-2 흐름(취소·실패).
// 서비스 이용약관은 공개 URL이 아직 없어 처리방침만 연결한다(구현 노트 어긋남 기록).

const BUTTON_HEIGHT = 52;
const BUTTON_RADIUS = 12;

export default function LoginScreen() {
  const busy = useRef(false);
  const [pending, setPending] = useState(false);

  const run = async (signIn: () => Promise<ProviderCredential | null>) => {
    if (busy.current) return;
    busy.current = true; setPending(true);
    try {
      const credential = await signIn();
      if (!credential) return; // 취소: 안내 없이 이 화면에 머문다
      // TODO(2단계): 서버 로그인으로 교체
      console.log('[account] credential', credential);
    } catch (e) {
      console.warn('[account] sign-in failed', e);
      Alert.alert('로그인하지 못했어요. 다시 시도해 주세요.', undefined, [
        { text: '닫기', style: 'cancel' },
        { text: '다시 시도', onPress: () => { void run(signIn); } },
      ]);
    } finally {
      busy.current = false; setPending(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScreenHeader title="로그인" />
      <View style={styles.body}>
        <Text style={styles.lead}>로그인하면 기록이 서버에 백업돼요.</Text>
        <View style={[styles.buttons, pending && styles.pending]} pointerEvents={pending ? 'none' : 'auto'}>
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
            cornerRadius={BUTTON_RADIUS}
            style={styles.button}
            onPress={() => { void run(signInWithApple); }}
          />
          <Pressable
            onPress={() => { void run(signInWithKakao); }}
            accessibilityRole="button"
            accessibilityLabel="카카오로 계속하기"
            style={({ pressed }) => [styles.button, styles.kakao, pressed && styles.pressed]}>
            <Text style={styles.kakaoText}>카카오로 계속하기</Text>
          </Pressable>
        </View>
        <PrivacyPolicyLink />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.bg },
  body: { flex: 1, paddingHorizontal: 24, justifyContent: 'center', gap: 24 },
  lead: { fontFamily: Fonts.sans, fontSize: 15, color: Colors.text, textAlign: 'center' },
  buttons: { gap: 12 },
  pending: { opacity: 0.5 },
  button: { height: BUTTON_HEIGHT, width: '100%', borderRadius: BUTTON_RADIUS },
  // 카카오 디자인 가이드의 컨테이너 색 #FEE500, 레이블 85% 검정
  kakao: { backgroundColor: '#FEE500', alignItems: 'center', justifyContent: 'center' },
  kakaoText: { fontFamily: Fonts.sansBold, fontSize: 17, color: 'rgba(0,0,0,0.85)' },
  pressed: { opacity: 0.7 },
});
