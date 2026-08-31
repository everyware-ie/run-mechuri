import { Link, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RouteThumbnail } from '@/components/route-thumbnail';
import { Card, Label, ThemedButton } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { getDraft, type Draft } from '@/lib/draft-store';
import { listResults, type SavedResult } from '@/lib/results-store';
import { useCreationFlow } from '@/state/creation-flow';

// 홈과 보관함 FRD §1: 홈은 결과물 목록이다.
// §1-1 화면 구성(위→아래): 이어서 만들기(§3, 있을 때만) → 새로 만들기(항상) →
// 결과물 목록(있으면) → 쇼케이스(§4, 여유 시라 v0는 생략)
// 디자인: "1a 야간 네온"

export default function HomeScreen() {
  const [results, setResults] = useState<SavedResult[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const { loadDraft } = useCreationFlow();

  useFocusEffect(
    useCallback(() => {
      listResults().then(setResults);
      getDraft().then(setDraft);
    }, [])
  );

  const handleResumeDraft = () => {
    if (!draft) return;
    loadDraft({
      selectedRun: draft.run,
      track: draft.track,
      backgroundImagePath: draft.backgroundImagePath,
      preset: draft.preset,
      transform: draft.transform,
      smoothOptions: draft.smoothOptions,
      stampConfig: draft.stampConfig,
    });
    router.push('/edit');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {draft && (
          <Pressable onPress={handleResumeDraft}>
            <Card style={styles.draftCard}>
              <Text style={styles.draftLabel}>이어서 만들기</Text>
              <Text style={styles.draftMeta}>
                {(draft.run.distanceMeters / 1000).toFixed(2)}km · {draft.run.date.slice(0, 10)}
              </Text>
            </Card>
          </Pressable>
        )}

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
              numColumns={2}
              columnWrapperStyle={styles.row}
              contentContainerStyle={styles.list}
              renderItem={({ item }) => (
                <Pressable style={styles.cell} onPress={() => router.push(`/result/${item.id}`)}>
                  <Card style={styles.resultCard}>
                    <View style={styles.thumbBox}>
                      <RouteThumbnail
                        points={item.track.coordinates}
                        transform={item.transform}
                        smoothOptions={item.smoothOptions}
                        run={item.run}
                        stampConfig={item.stampConfig}
                        size={150}
                      />
                    </View>
                    <Text style={styles.resultDistance}>{(item.distanceMeters / 1000).toFixed(2)}km</Text>
                    <Text style={styles.resultDate}>{item.runDate.slice(0, 10)}</Text>
                  </Card>
                </Pressable>
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
  draftCard: { borderWidth: 1, borderColor: Colors.accent, gap: 4 },
  draftLabel: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 14, color: Colors.accent },
  draftMeta: { fontFamily: 'JetBrainsMono_500Medium', fontSize: 11, color: Colors.textMuted },
  emptyBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontFamily: 'SpaceGrotesk_500Medium', fontSize: 15, color: Colors.textMuted },
  list: { gap: Spacing.sm },
  row: { gap: Spacing.sm },
  cell: { flex: 1 },
  resultCard: { padding: Spacing.xs, gap: 4 },
  thumbBox: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: Radius.chip,
    overflow: 'hidden',
    backgroundColor: Colors.bg,
  },
  resultDistance: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 15, color: Colors.text, paddingHorizontal: 4 },
  resultDate: { fontFamily: 'JetBrainsMono_500Medium', fontSize: 10, color: Colors.textMuted, paddingHorizontal: 4 },
  devLink: {
    marginTop: 'auto',
    fontFamily: 'JetBrainsMono_500Medium',
    color: Colors.textMuted,
    fontSize: 11,
    textAlign: 'center',
  },
});
