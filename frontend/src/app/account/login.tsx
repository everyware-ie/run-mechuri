import * as AppleAuthentication from 'expo-apple-authentication';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { PrivacyPolicyLink } from '@/components/privacy-policy-link';
import { Colors, Fonts } from '@/constants/theme';
import {
  loginToServer, saveToken, setPendingToken, signInWithApple, signInWithKakao, type ProviderCredential,
} from '@/lib/account';
import { goBackOrHome } from '@/lib/navigation';

// 로그인 FRD §3-1 로그인 수단 선택, §3-2 흐름. 시안 02a·03(2026-11-20 계정 화면 시안).
// 서비스 이용약관은 공개 URL이 아직 없어 처리방침만 연결한다(구현 노트 어긋남 기록).

const BUTTON_HEIGHT = 52;
const BUTTON_RADIUS = 12;
const ROUTE_PATH = 'M18 118c26-6 30-52 62-58s34 36 64 30 22-60 52-70';

type SignIn = () => Promise<ProviderCredential | null>;

export default function LoginScreen() {
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState<SignIn | null>(null);

  const run = async (signIn: SignIn) => {
    if (busy.current) return;
    busy.current = true; setPending(true); setFailed(null);
    try {
      const credential = await signIn();
      if (!credential) return; // 취소: 안내 없이 이 화면에 머문다
      const { token, nickname } = await loginToServer(credential);
      if (nickname) {
        await saveToken(token);
        goBackOrHome();
      } else {
        setPendingToken(token);
        router.replace('/account/nickname');
      }
    } catch (e) {
      console.warn('[account] sign-in failed', e);
      setFailed(() => signIn);
    } finally {
      busy.current = false; setPending(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.nav}>
        <Pressable onPress={goBackOrHome} hitSlop={8} accessibilityRole="button" accessibilityLabel="닫기" style={styles.iconButton}>
          <SymbolView name="xmark" size={18} tintColor={Colors.text} />
        </Pressable>
      </View>
      <View style={styles.body}>
        <View style={[styles.hero, failed && styles.heroDimmed]}>
          <Svg width={220} height={150} viewBox="0 0 220 150">
            {failed ? (
              <Path d={ROUTE_PATH} fill="none" stroke={Colors.textMuted} strokeWidth={2.4} strokeLinecap="round" strokeDasharray="3 7" />
            ) : (
              <>
                <Path d={ROUTE_PATH} fill="none" stroke={Colors.accent} strokeWidth={9} strokeLinecap="round" opacity={0.3} />
                <Path d={ROUTE_PATH} fill="none" stroke="#FFB49A" strokeWidth={2.4} strokeLinecap="round" />
                <Circle cx={196} cy={20} r={5} fill={Colors.accent} />
              </>
            )}
          </Svg>
          <Text style={styles.brand}>Runary</Text>
          <Text style={styles.tagline}>러닝 기록을 나만의 스토리로</Text>
        </View>

        {failed && (
          <View style={styles.notice} accessibilityRole="alert">
            <View style={styles.noticeRow}>
              <SymbolView name="exclamationmark.circle" size={20} tintColor={Colors.accent} />
              <Text style={styles.noticeText}>로그인하지 못했어요. 다시 시도해 주세요.</Text>
            </View>
            <Pressable onPress={() => { void run(failed); }} accessibilityRole="button"
              style={({ pressed }) => [styles.retry, pressed && styles.pressed]}>
              <Text style={styles.retryText}>다시 시도</Text>
            </Pressable>
          </View>
        )}

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
            <Svg width={18} height={18} viewBox="0 0 18 18">
              <Path d="M9 1.6C4.6 1.6 1 4.4 1 7.9c0 2.2 1.5 4.2 3.7 5.3l-.9 3.4c-.1.3.3.5.5.3l4-2.7c.2 0 .5.1.7.1 4.4 0 8-2.8 8-6.3S13.4 1.6 9 1.6z" fill="#000" />
            </Svg>
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
  nav: { height: 44, paddingHorizontal: 8, justifyContent: 'center' },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, paddingHorizontal: 24, paddingBottom: 12 },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18 },
  heroDimmed: { opacity: 0.35 },
  brand: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 40, letterSpacing: -1.6, color: Colors.text },
  tagline: { fontFamily: Fonts.sans, fontSize: 16, color: Colors.textMuted, marginTop: -6 },
  notice: {
    borderRadius: 18, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: 'rgba(255,90,43,0.45)',
    padding: 16, gap: 12, marginBottom: 16,
  },
  noticeRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  noticeText: { flex: 1, fontFamily: Fonts.sansBold, fontSize: 15, lineHeight: 22, color: Colors.text },
  retry: { height: 44, borderRadius: 22, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
  retryText: { fontFamily: Fonts.sansBold, fontSize: 15, color: Colors.accentText },
  buttons: { gap: 12, marginBottom: 6 },
  pending: { opacity: 0.5 },
  button: { height: BUTTON_HEIGHT, width: '100%', borderRadius: BUTTON_RADIUS },
  // 카카오 로그인 디자인 가이드: 컨테이너 #FEE500, 검정 말풍선, 레이블 85% 검정
  kakao: { backgroundColor: '#FEE500', flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  kakaoText: { fontFamily: Fonts.sansBold, fontSize: 17, color: 'rgba(0,0,0,0.85)' },
  pressed: { opacity: 0.7 },
});
