import { Link, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Button, FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { listResults, type SavedResult } from '@/lib/results-store';

// 홈과 보관함 FRD §1: 홈은 결과물 목록이다.
// §1-1 화면 구성(위→아래): 이어서 만들기(v0는 편집 없어 미완성 개념 자체가 없음, 생략) →
// 새로 만들기(항상) → 결과물 목록(있으면) → 쇼케이스(v0는 여유 시라 생략)
// 디자인 시스템(1a 야간 네온) 나오면 이 화면은 갈아끼운다.

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
        <Button title="새로 만들기" onPress={() => router.push('/record-selection')} />

        {results.length === 0 ? (
          <Text style={styles.empty}>아직 만든 결과물이 없어요</Text>
        ) : (
          <FlatList
            data={results}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <View style={styles.resultRow}>
                <Text style={styles.resultDate}>{item.runDate.slice(0, 10)}</Text>
                <Text>{(item.distanceMeters / 1000).toFixed(2)}km</Text>
              </View>
            )}
          />
        )}

        <Link href="/dev-test" style={styles.devLink}>
          개발용 확인 화면
        </Link>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { flex: 1, padding: 24, gap: 16 },
  empty: { color: '#888', textAlign: 'center', marginTop: 40 },
  list: { gap: 8 },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
  },
  resultDate: { fontWeight: '600' },
  devLink: { marginTop: 'auto', color: '#888', fontSize: 12, textAlign: 'center' },
});
