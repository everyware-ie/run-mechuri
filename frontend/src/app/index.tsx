import { Link, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, Label, ThemedButton } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { listResults, type SavedResult } from '@/lib/results-store';

// 홈과 보관함 FRD §1: 홈은 결과물 목록이다.
// §1-1 화면 구성(위→아래): 이어서 만들기(v0는 편집 없어 미완성 개념 자체가 없음, 생략) →
// 새로 만들기(항상) → 결과물 목록(있으면) → 쇼케이스(v0는 여유 시라 생략)
// 디자인: "1a 야간 네온"(2026-08-25 결정)

export default function HomeScreen() {
  const [results, setResults] = useState<SavedResult[]>([]);

  useFocusEffect(
    useCallback(() => {
      listResults().then(setResults);
    }, [])
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <ThemedButton title="새로 만들기" onPress={() => router.push('/record-selection')} />

        {results.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>아직 만든 결과물이 없어요</Text>
          </View>
        ) : (
          <>
            <Label>My Drawings</Label>
            <FlatList
              data={results}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.list}
              renderItem={({ item }) => (
                <Card style={styles.resultRow}>
                  <Text style={styles.resultDistance}>{(item.distanceMeters / 1000).toFixed(2)}km</Text>
                  <Text style={styles.resultDate}>{item.runDate.slice(0, 10)}</Text>
                </Card>
              )}
            />
          </>
        )}

        <Link href="/dev-test" style={styles.devLink}>
          개발용 확인 화면
        </Link>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.bg },
  container: { flex: 1, padding: Spacing.lg, gap: Spacing.md },
  emptyBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontFamily: 'SpaceGrotesk_500Medium', fontSize: 15, color: Colors.textMuted },
  list: { gap: Spacing.sm },
  resultRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  resultDistance: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 20, color: Colors.text },
  resultDate: { fontFamily: 'JetBrainsMono_500Medium', fontSize: 11, color: Colors.textMuted },
  devLink: {
    marginTop: 'auto',
    fontFamily: 'JetBrainsMono_500Medium',
    color: Colors.textMuted,
    fontSize: 11,
    textAlign: 'center',
  },
});
