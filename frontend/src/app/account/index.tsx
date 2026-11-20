import { router, useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { ScreenHeader } from '@/components/screen-header';
import { ThemedButton } from '@/components/ui';
import { Colors, Fonts, Radius } from '@/constants/theme';
import { clearSavedToken, fetchMe, getSavedToken, type Me } from '@/lib/account';

// 로그인 FRD §2-1 내 계정 화면. 시안 05a(로그인 전), 05b(로그인 후).
// 백업 상태, 로그아웃, 탈퇴(FRD §5, §6, §7)는 다음 단계에서 붙인다.

type State = { kind: 'loading' } | { kind: 'loggedOut' } | { kind: 'loggedIn'; me: Me } | { kind: 'error' };

const ROUTE_PATH = 'M6 56c30 0 38-38 70-38s40 30 72 30 40-40 72-40 46 18 75 18';
const PROVIDER_LABEL = { APPLE: 'Apple', KAKAO: '카카오' } as const;

export default function AccountScreen() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  const load = useCallback(async () => {
    const token = await getSavedToken();
    if (!token) { setState({ kind: 'loggedOut' }); return; }
    try {
      const me = await fetchMe(token);
      if (me?.nickname) { setState({ kind: 'loggedIn', me }); return; }
      // 서버가 토큰을 거절했다. 다시 로그인하게 한다
      await clearSavedToken();
      setState({ kind: 'loggedOut' });
    } catch (e) {
      console.warn('[account] load failed', e);
      setState({ kind: 'error' });
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScreenHeader title="내 계정" />
      <View style={styles.body}>
        {state.kind === 'loading' && <ActivityIndicator color={Colors.textMuted} style={{ marginTop: 40 }} />}

        {state.kind === 'loggedOut' && (
          <View style={styles.promo}>
            <Svg width="100%" height={70} viewBox="0 0 301 70" preserveAspectRatio="xMidYMid meet">
              <Path d={ROUTE_PATH} fill="none" stroke={Colors.accent} strokeWidth={6} strokeLinecap="round" opacity={0.3} />
              <Path d={ROUTE_PATH} fill="none" stroke="#FFB49A" strokeWidth={2} strokeLinecap="round" />
            </Svg>
            <Text style={styles.promoText}>
              로그인하면 러닝 기록이 서버에 백업돼요. 앱을 지웠다 다시 깔아도 러닝 기록이 돌아와요.
            </Text>
            <ThemedButton title="로그인" onPress={() => router.push('/account/login')} />
          </View>
        )}

        {state.kind === 'loggedIn' && (
          <View style={styles.card}>
            <Pressable
              onPress={() => router.push({ pathname: '/account/nickname', params: { current: state.me.nickname ?? '' } })}
              accessibilityRole="button" accessibilityLabel={`닉네임 ${state.me.nickname}, 변경`}
              style={({ pressed }) => [styles.row, styles.rowDivider, pressed && styles.pressed]}>
              <Text style={styles.rowKey}>닉네임</Text>
              <View style={styles.rowValueWrap}>
                <Text style={styles.rowValue}>{state.me.nickname}</Text>
                <SymbolView name="chevron.right" size={13} tintColor={Colors.textMuted} />
              </View>
            </Pressable>
            <View style={styles.row}>
              <Text style={styles.rowKey}>로그인 수단</Text>
              <Text style={styles.rowValue}>{PROVIDER_LABEL[state.me.provider]}</Text>
            </View>
          </View>
        )}

        {state.kind === 'error' && (
          <View style={styles.promo}>
            <Text style={styles.promoText}>계정 정보를 불러오지 못했어요. 다시 시도해 주세요.</Text>
            <ThemedButton title="다시 시도" variant="outline" onPress={() => { setState({ kind: 'loading' }); void load(); }} />
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.bg },
  body: { flex: 1, paddingHorizontal: 24, paddingTop: 16 },
  promo: { borderRadius: Radius.card, backgroundColor: Colors.bgCard, paddingVertical: 24, paddingHorizontal: 22, gap: 20 },
  promoText: { fontFamily: Fonts.sansBold, fontSize: 17, lineHeight: 27, color: Colors.text },
  card: { borderRadius: Radius.card, backgroundColor: Colors.bgCard, paddingHorizontal: 18, paddingVertical: 4 },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: 'rgba(237,241,245,0.07)' },
  rowKey: { fontFamily: Fonts.sans, fontSize: 15, color: Colors.textMuted },
  rowValueWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowValue: { fontFamily: Fonts.sansBold, fontSize: 16, color: Colors.text },
  pressed: { opacity: 0.6 },
});
