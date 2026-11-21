import { useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/screen-header';
import { ThemedButton } from '@/components/ui';
import { Colors, Fonts } from '@/constants/theme';
import { getPendingToken, getSavedToken, saveNickname, saveToken, setPendingToken } from '@/lib/account';
import { goBackOrHome } from '@/lib/navigation';
import {
  lowercaseNickname, nicknameError, nicknameLength, NICKNAME_MAX, NICKNAME_MESSAGES, type NicknameError,
} from '@/lib/nickname';

// 로그인 FRD §4 닉네임. 시안 04a~c(가입), 06(변경).
// current 파라미터가 있으면 내 계정에서 바꾸는 것이고, 없으면 가입 중이다.

export default function NicknameScreen() {
  const { current } = useLocalSearchParams<{ current?: string }>();
  const signup = !current;
  const [value, setValue] = useState('');
  const [serverError, setServerError] = useState<NicknameError | null>(null);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);

  const localError = value.trim() ? nicknameError(value) : null;
  const error = localError ?? serverError;
  const unchanged = value.trim() === current;
  const canSubmit = !!value.trim() && !error && !unchanged && !saving;

  const submit = async () => {
    if (busy.current || !canSubmit) return;
    busy.current = true; setSaving(true);
    try {
      const token = signup ? getPendingToken() : await getSavedToken();
      if (!token) { goBackOrHome(); return; }
      const result = await saveNickname(token, value);
      if ('error' in result) { setServerError(result.error); return; }
      // 가입은 닉네임까지 저장해야 끝난다. 그 전에 닫기·뒤로 스와이프·앱 종료로 나가면 로그인하지 않은 상태로 남는다(§4, §3-2 흐름)
      if (signup) { await saveToken(token); setPendingToken(null); }
      goBackOrHome();
    } catch (e) {
      console.warn('[account] nickname save failed', e);
      Alert.alert('닉네임을 저장하지 못했어요. 다시 시도해 주세요.', undefined, [
        { text: '닫기', style: 'cancel' },
        { text: '다시 시도', onPress: () => { void submit(); } },
      ]);
    } finally {
      busy.current = false; setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {signup ? (
        <View style={styles.nav}>
          <Pressable onPress={goBackOrHome} hitSlop={8} accessibilityRole="button" accessibilityLabel="닫기" style={styles.iconButton}>
            <SymbolView name="xmark" size={18} tintColor={Colors.text} />
          </Pressable>
        </View>
      ) : (
        <ScreenHeader title="닉네임 변경" />
      )}
      <KeyboardAvoidingView behavior="padding" style={styles.body}>
        {signup && (
          <>
            <Text style={styles.mono}>SIGN UP · NICKNAME</Text>
            <Text style={styles.h1}>닉네임을 정해 주세요</Text>
            <Text style={styles.sub}>크루에서 다른 사람에게 보이는 이름이에요. 나중에 내 계정에서 바꿀 수 있어요.</Text>
          </>
        )}
        <View style={[styles.fieldBlock, signup && { marginTop: 32 }]}>
          <Text style={styles.label}>닉네임</Text>
          <View style={[styles.field, error ? styles.fieldError : styles.fieldFocus]}>
            <TextInput
              value={value}
              onChangeText={(text) => { setValue(lowercaseNickname(text)); setServerError(null); }}
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              returnKeyType="done"
              onSubmitEditing={() => { void submit(); }}
              placeholder={current}
              placeholderTextColor={Colors.textMuted}
              accessibilityLabel="닉네임"
              style={styles.input}
            />
            <Text style={[styles.count, localError === 'INVALID_LENGTH' && styles.countError]}>
              {nicknameLength(value)}/{NICKNAME_MAX}
            </Text>
          </View>
          {error ? (
            <View style={styles.errorRow} accessibilityLiveRegion="polite">
              <SymbolView name="exclamationmark.circle" size={14} tintColor={Colors.accent} />
              <Text style={styles.errorText}>{NICKNAME_MESSAGES[error]}</Text>
            </View>
          ) : (
            <Text style={styles.hint}>2~10자, 한글·영문 소문자·숫자</Text>
          )}
        </View>
        {!signup && (
          <View style={styles.nowRow}>
            <Text style={styles.nowLabel}>NOW</Text>
            <Text style={styles.hint}>{current}</Text>
          </View>
        )}
        <View style={{ flex: 1 }} />
        <ThemedButton title="완료" disabled={!canSubmit} onPress={() => { void submit(); }} />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.bg },
  nav: { height: 44, paddingHorizontal: 8, justifyContent: 'center' },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, paddingHorizontal: 24, paddingBottom: 16 },
  mono: { marginTop: 20, fontFamily: Fonts.mono, fontSize: 11, letterSpacing: 1.3, color: Colors.textMuted },
  h1: { marginTop: 10, fontFamily: Fonts.sansBold, fontSize: 26, lineHeight: 35, color: Colors.text },
  sub: { marginTop: 6, fontFamily: Fonts.sans, fontSize: 15, lineHeight: 24, color: Colors.textMuted },
  fieldBlock: { marginTop: 28, gap: 8 },
  label: { fontFamily: Fonts.sansBold, fontSize: 13, color: Colors.textMuted },
  field: {
    height: 56, borderRadius: 14, backgroundColor: Colors.bgCard, paddingHorizontal: 16,
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  fieldFocus: { borderWidth: 1.5, borderColor: Colors.text },
  fieldError: { borderWidth: 1.5, borderColor: Colors.accent },
  input: { flex: 1, fontFamily: Fonts.sans, fontSize: 17, color: Colors.text },
  count: { fontFamily: Fonts.mono, fontSize: 13, color: Colors.textMuted },
  countError: { color: Colors.accent },
  hint: { fontFamily: Fonts.sans, fontSize: 13, lineHeight: 20, color: Colors.textMuted },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  errorText: { fontFamily: Fonts.sansBold, fontSize: 13, lineHeight: 20, color: Colors.accent },
  nowRow: { marginTop: 20, flexDirection: 'row', gap: 8, alignItems: 'center' },
  nowLabel: { fontFamily: Fonts.mono, fontSize: 11, letterSpacing: 0.9, color: Colors.textMuted },
});
