import { router, useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/screen-header';
import { ThemedButton } from '@/components/ui';
import { Colors, Fonts, Radius } from '@/constants/theme';
import { fetchMe, forgetSession, getSavedToken, type Me } from '@/lib/account';
import { stopBackup, useBackupState } from '@/lib/backup';
import { goToLogin } from '@/lib/navigation';

// 로그인 FRD §2-1 내 계정 화면. 시안 05b(로그인 후).
// 로그인이 필수라 로그인한 사람만 온다. 서버가 로그인을 거절하면 로그인 수단 선택으로 보낸다.
// 로그아웃은 확인 창(FRD §6), 탈퇴는 확인 화면(§7, account/withdraw.tsx)으로 간다.

type State = { kind: 'loading' } | { kind: 'loggedIn'; me: Me } | { kind: 'error' };

const PROVIDER_LABEL = { APPLE: 'Apple', KAKAO: '카카오' } as const;

/** FRD §2-1 백업 시각 형식 `11월 23일 14시 03분` */
const formatBackupTime = (ms: number) => {
  const d = new Date(ms);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${d.getHours()}시 ${String(d.getMinutes()).padStart(2, '0')}분`;
};

export default function AccountScreen() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const backup = useBackupState();

  const load = useCallback(async (isActive: () => boolean) => {
    try {
      const token = await getSavedToken();
      const me = token ? await fetchMe(token) : null;
      if (!isActive()) return;
      if (me?.nickname) { setState({ kind: 'loggedIn', me }); return; }
      await forgetSession();
      router.replace('/account/login');
    } catch (e) {
      console.warn('[account] load failed', e);
      if (isActive()) setState({ kind: 'error' });
    }
  }, []);

  // 화면을 빠르게 오가면 이전 조회 결과가 늦게 도착할 수 있다. 지금 포커스의 결과만 반영한다
  // FRD §6 로그아웃. 기기 기록과 "올린 기록" 표시는 그대로 두고, 올리던 것만 멈춘다
  const confirmLogout = () => {
    const lines = [
      backup.remaining > 0 ? `아직 백업되지 않은 러닝 기록 ${backup.remaining}건이 있어요. 로그아웃하면 백업되지 않아요.` : null,
      '이 기기의 기록은 그대로 남아요.',
    ].filter(Boolean).join('\n\n');
    Alert.alert('로그아웃할까요?', lines, [
      { text: '취소', style: 'cancel' },
      { text: '로그아웃', style: 'destructive', onPress: () => { void (async () => {
        await stopBackup();
        await forgetSession();
        goToLogin();
      })(); } },
    ]);
  };

  useFocusEffect(useCallback(() => {
    let active = true;
    void load(() => active);
    return () => { active = false; };
  }, [load]));

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScreenHeader title="내 계정" />
      <View style={styles.body}>
        {state.kind === 'loading' && <ActivityIndicator color={Colors.textMuted} style={{ marginTop: 40 }} />}

        {state.kind === 'loggedIn' && (
          <>
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

            {/* FRD §2-1 백업 상태, §5-1 진행 표시, §5-4 올라가지 않은 기록 수 */}
            {(backup.progress || backup.lastBackupAt || backup.remaining > 0) && (
              <View style={styles.section}>
                <Text style={styles.mono}>BACKUP</Text>
                <View style={styles.card}>
                  {backup.progress && (
                    <View style={[styles.row, styles.rowDivider]} accessibilityLiveRegion="polite">
                      <Text style={styles.rowKey}>기록 백업 중</Text>
                      <Text style={styles.rowMono}>{backup.progress.done}/{backup.progress.total}</Text>
                    </View>
                  )}
                  {backup.lastBackupAt && (
                    <View style={[styles.row, styles.rowDivider]}>
                      <Text style={styles.rowKey}>마지막 백업</Text>
                      <Text style={styles.rowValue}>{formatBackupTime(backup.lastBackupAt)}</Text>
                    </View>
                  )}
                  {!backup.progress && backup.remaining > 0 && (
                    <View style={styles.row}>
                      <Text style={styles.rowKey}>백업되지 않은 러닝 기록</Text>
                      <View style={styles.rowValueWrap}>
                        <View style={styles.dot} />
                        <Text style={styles.rowValue}>{backup.remaining}건</Text>
                      </View>
                    </View>
                  )}
                </View>
                {!backup.progress && backup.remaining > 0 && (
                  <Text style={styles.hint}>인터넷에 연결되면 자동으로 백업해요.</Text>
                )}
              </View>
            )}
            <View style={{ flex: 1 }} />
            <View style={styles.footer}>
              <ThemedButton title="로그아웃" variant="outline" onPress={confirmLogout} />
              {/* FRD §2-1: 탈퇴는 다른 항목보다 덜 눈에 띄게 아래쪽에 */}
              <Pressable onPress={() => router.push({ pathname: '/account/withdraw', params: { provider: state.me.provider } })}
                accessibilityRole="button" hitSlop={8}
                style={({ pressed }) => [styles.withdraw, pressed && styles.pressed]}>
                <Text style={styles.withdrawText}>탈퇴</Text>
              </Pressable>
            </View>
          </>
        )}

        {state.kind === 'error' && (
          <View style={styles.promo}>
            <Text style={styles.promoText}>계정 정보를 불러오지 못했어요. 다시 시도해 주세요.</Text>
            <ThemedButton title="다시 시도" variant="outline" onPress={() => { setState({ kind: 'loading' }); void load(() => true); }} />
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.bg },
  body: { flex: 1, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 12, gap: 22 },
  footer: { gap: 6, alignItems: 'stretch' },
  withdraw: { height: 44, alignSelf: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  withdrawText: { fontFamily: Fonts.sans, fontSize: 14, color: Colors.textMuted },
  promo: { borderRadius: Radius.card, backgroundColor: Colors.bgCard, paddingVertical: 24, paddingHorizontal: 22, gap: 20 },
  promoText: { fontFamily: Fonts.sansBold, fontSize: 17, lineHeight: 27, color: Colors.text },
  section: { gap: 10 },
  mono: { paddingLeft: 4, fontFamily: Fonts.mono, fontSize: 11, letterSpacing: 1.3, color: Colors.textMuted },
  card: { borderRadius: Radius.card, backgroundColor: Colors.bgCard, paddingHorizontal: 18, paddingVertical: 4 },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: 'rgba(237,241,245,0.07)' },
  rowKey: { fontFamily: Fonts.sans, fontSize: 15, color: Colors.textMuted },
  rowValueWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowValue: { fontFamily: Fonts.sansBold, fontSize: 16, color: Colors.text },
  rowMono: { fontFamily: Fonts.mono, fontSize: 14, color: Colors.text },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.accent },
  hint: { paddingLeft: 4, fontFamily: Fonts.sans, fontSize: 13, lineHeight: 20, color: Colors.textMuted },
  pressed: { opacity: 0.6 },
});
