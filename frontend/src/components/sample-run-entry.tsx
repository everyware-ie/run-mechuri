import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Fonts } from '@/constants/theme';
import { markConnectedOnce } from '@/lib/connection-store';
import { createSampleRun } from '@/lib/sample-run';
import { formatDistanceKm, formatDuration, formatPace } from '@/lib/stamp-format';
import { useCreationFlow } from '@/state/creation-flow';

// FRD: docs/specs/frd/sample-record-experience.md §1 진입
const SAMPLE = createSampleRun().run;
const SAMPLE_META = [formatDistanceKm(SAMPLE.distanceMeters), formatDuration(SAMPLE.durationSeconds), formatPace(SAMPLE.averagePaceSecPerKm)].join(' · ');

export function SampleRunEntry({ fromWelcome = false, disabled = false }: { fromWelcome?: boolean; disabled?: boolean }) {
  const { setSelectedRun } = useCreationFlow();
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const start = async () => {
    if (disabled || lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const { run, track } = createSampleRun();
      await setSelectedRun(run, track);
      if (fromWelcome) {
        await markConnectedOnce();
        // 첫 실행은 홈을 스택에 남겨 배경 선택에서 돌아갈 수 있게 한다.
        router.replace('/');
      }
      router.push('/background-selection');
    } catch {
      setError('샘플을 준비하지 못했어요. 다시 눌러 주세요.');
    } finally {
      lock.current = false; setBusy(false);
    }
  };
  return (
    <View style={styles.entry}>
      <Pressable testID="sample-run-entry" accessibilityLabel="샘플 기록으로 만들어 보기"
        style={({ pressed }) => [styles.card, (busy || disabled) && styles.disabled, pressed && styles.pressed]}
        onPress={() => { void start(); }} disabled={busy || disabled}
        accessibilityRole="button" accessibilityState={{ disabled: busy || disabled, busy }}
        accessibilityHint="건강 기록 없이 하트 샘플로 편집을 시작해요">
        <View style={styles.thumb}><SymbolView name="heart" size={24} tintColor={Colors.accent} /></View>
        <View style={styles.cardMain}>
          <Text style={styles.title}>{busy ? '샘플 준비 중' : '샘플 기록으로 만들어 보기'}</Text>
          <Text style={styles.meta}>{SAMPLE_META}</Text>
        </View>
      </Pressable>
      <Text style={styles.note}>건강 기록 없이 하트 경로로 체험해 보세요.</Text>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    </View>
  );
}
const styles = StyleSheet.create({
  entry: { gap: 8 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14,
    borderRadius: 18, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bgCard },
  thumb: { width: 52, height: 52, borderRadius: 12, backgroundColor: 'rgba(237,241,245,0.05)', alignItems: 'center', justifyContent: 'center' },
  cardMain: { flex: 1, gap: 4 },
  title: { fontFamily: Fonts.sansBold, fontSize: 15, color: Colors.text },
  meta: { fontFamily: Fonts.sans, fontSize: 10.5, color: Colors.textMuted, lineHeight: 16 },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.85 },
  note: { fontFamily: Fonts.sans, fontSize: 12, color: Colors.textMuted, textAlign: 'center' },
  error: { fontFamily: Fonts.sans, fontSize: 12, color: Colors.danger, textAlign: 'center' },
});
