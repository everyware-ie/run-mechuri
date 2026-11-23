import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/screen-header';
import { ThemedButton } from '@/components/ui';
import { Colors, Fonts } from '@/constants/theme';
import { forgetSession, getSavedToken, withdraw, type Me } from '@/lib/account';
import { clearUploadedMarks, stopBackup } from '@/lib/backup';
import { goToLogin } from '@/lib/navigation';

// 로그인 FRD §7 탈퇴. 시안 08.
// 서버의 계정, 닉네임, 백업 기록을 지우고 Apple 토큰 해지 또는 카카오 연결 끊기를 한다. 기기 기록은 남는다.

export default function WithdrawScreen() {
  const { provider } = useLocalSearchParams<{ provider: Me['provider'] }>();
  const busy = useRef(false);
  const [pending, setPending] = useState(false);

  const submit = async () => {
    if (busy.current) return;
    busy.current = true; setPending(true);
    try {
      const token = await getSavedToken();
      if (token && (await withdraw(token, provider)) === 'cancelled') return; // Apple 화면에서 취소: 이 화면에 머문다
      await stopBackup();
      await clearUploadedMarks();
      await forgetSession();
      goToLogin();
    } catch (e) {
      console.warn('[account] withdraw failed', e);
      Alert.alert('인터넷에 연결한 뒤 다시 시도해 주세요.');
    } finally {
      busy.current = false; setPending(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScreenHeader title="탈퇴" />
      <View style={styles.body}>
        <Text style={styles.h1}>탈퇴하기 전에 확인해 주세요</Text>
        <View style={styles.cards}>
          <View style={[styles.card, styles.cardDanger]}>
            <SymbolView name="trash" size={22} tintColor={Colors.accent} />
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>서버에 백업한 기록과 계정이 지워져요</Text>
              <Text style={styles.cardSub}>닉네임도 함께 지워지고, 되돌릴 수 없어요.</Text>
            </View>
          </View>
          <View style={styles.card}>
            <SymbolView name="iphone" size={22} tintColor={Colors.text} />
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>이 기기에 있는 기록은 남아요</Text>
              <Text style={styles.cardSub}>다시 가입하면 이 기록을 새 계정에 백업할 수 있어요.</Text>
            </View>
          </View>
        </View>
        <View style={{ flex: 1 }} />
        <ThemedButton title="탈퇴하기" disabled={pending} onPress={() => { void submit(); }} />
        <Pressable onPress={() => router.back()} disabled={pending} accessibilityRole="button"
          style={({ pressed }) => [styles.cancel, pressed && { opacity: 0.6 }]}>
          <Text style={styles.cancelText}>취소</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.bg },
  body: { flex: 1, paddingHorizontal: 24, paddingBottom: 12 },
  h1: { marginTop: 24, fontFamily: Fonts.sansBold, fontSize: 26, lineHeight: 35, color: Colors.text },
  cards: { marginTop: 28, gap: 12 },
  card: { borderRadius: 18, backgroundColor: Colors.bgCard, padding: 18, flexDirection: 'row', gap: 14 },
  cardDanger: { borderWidth: 1, borderColor: 'rgba(255,90,43,0.45)' },
  cardText: { flex: 1, gap: 4 },
  cardTitle: { fontFamily: Fonts.sansBold, fontSize: 16, lineHeight: 23, color: Colors.text },
  cardSub: { fontFamily: Fonts.sans, fontSize: 14, lineHeight: 22, color: Colors.textMuted },
  cancel: { height: 48, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontFamily: Fonts.sansBold, fontSize: 15, color: Colors.text },
});
