import { Link, router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RouteThumbnail } from '@/components/route-thumbnail';
import { ThemedButton } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { hasConnectedOnce, markConnectedOnce } from '@/lib/connection-store';
import { getDraft, type Draft } from '@/lib/draft-store';
import { listResults, type SavedResult } from '@/lib/results-store';
import { useCreationFlow } from '@/state/creation-flow';

// 홈과 보관함 FRD §1: 홈은 결과물 목록이다.
// §1-1 화면 구성(위→아래): 이어서 만들기(§3, 있을 때만) → 새로 만들기(항상) →
// 결과물 목록(있으면) → 쇼케이스(§4, 여유 시라 v0는 생략)
//
// 디자인: "3안" 시안 S1 — "메추리 / ARCHIVE · N" 헤더 + 최근 결과물 큰 카드(하단
// 오버레이 + ▶) + "내가 만든 것" 2열 그리드. 시안의 하단 탭(보관함/가져오기)은
// 2026-08-25 결정("하단 탭을 쓰지 않는다")으로 빠지고, "새로 만들기"가 그 자리를 맡는다.

export default function HomeScreen() {
  const [results, setResults] = useState<SavedResult[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [checkedConnection, setCheckedConnection] = useState(false);
  const { loadDraft } = useCreationFlow();

  // connect.tsx(시안 S0): 앱을 한 번도 연결 안 해본 첫 실행에서만 보여준다.
  // useFocusEffect가 아니라 마운트 시 한 번만 — 연결 뒤엔 홈으로 돌아올 때마다
  // 다시 검사할 필요가 없다.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const connected = await hasConnectedOnce();
      if (cancelled) return;
      if (connected) {
        setCheckedConnection(true);
        return;
      }
      // 이 플래그가 생기기 전부터 이미 쓰던 사람(만든 결과물이 있음)에게는
      // 이제 와서 첫 실행 화면을 보여주지 않는다 — 조용히 "연결됨"으로 채운다.
      const existing = await listResults();
      if (cancelled) return;
      if (existing.length > 0) {
        await markConnectedOnce();
        if (!cancelled) setCheckedConnection(true);
        return;
      }
      router.replace('/connect');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

  // 연결 여부를 확인하는 동안(또는 /connect로 리다이렉트하는 동안)은 홈 내용이
  // 잠깐 비쳤다 사라지는 걸 막는다.
  if (!checkedConnection) {
    return <SafeAreaView style={styles.safeArea} />;
  }

  const [hero, ...rest] = results;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <FlatList
        data={rest}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={rest.length > 0 ? styles.row : undefined}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <View style={styles.titleRow}>
              <Text style={styles.title}>메추리</Text>
              <Text style={styles.archiveCount}>ARCHIVE · {results.length}</Text>
            </View>

            {draft && (
              <Pressable onPress={handleResumeDraft} style={styles.draftBar}>
                <View>
                  <Text style={styles.draftLabel}>이어서 만들기</Text>
                  <Text style={styles.draftMeta}>
                    {(draft.run.distanceMeters / 1000).toFixed(2)}km · {draft.run.date.slice(0, 10)}
                  </Text>
                </View>
                <Text style={styles.draftChevron}>→</Text>
              </Pressable>
            )}

            {hero ? (
              <Pressable style={styles.heroCard} onPress={() => router.push(`/result/${hero.id}`)}>
                <RouteThumbnail
                  points={hero.track.coordinates}
                  transform={hero.transform}
                  smoothOptions={hero.smoothOptions}
                  run={hero.run}
                  stampConfig={hero.stampConfig}
                  size={HERO_SIZE}
                />
                <View style={styles.heroOverlay}>
                  <View>
                    <Text style={styles.heroDistance}>
                      {(hero.distanceMeters / 1000).toFixed(2)}
                      <Text style={styles.heroUnit}> km</Text>
                    </Text>
                    <Text style={styles.heroDate}>{hero.runDate.slice(0, 10)}</Text>
                  </View>
                  <View style={styles.playButton}>
                    <Text style={styles.playIcon}>▶</Text>
                  </View>
                </View>
              </Pressable>
            ) : (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyTitle}>아직 만든 결과물이 없어요</Text>
                <Text style={styles.emptySub}>가져온 러닝 기록 하나만 있으면 됩니다.</Text>
              </View>
            )}

            <ThemedButton title="새로 만들기" onPress={() => router.push('/record-selection')} />

            {rest.length > 0 && (
              <View style={styles.sectionRow}>
                <Text style={styles.sectionLabel}>내가 만든 것</Text>
                <Text style={styles.sectionLabelEn}>MY DRAWINGS</Text>
              </View>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <Pressable style={styles.cell} onPress={() => router.push(`/result/${item.id}`)}>
            <View style={styles.gridThumb}>
              <RouteThumbnail
                points={item.track.coordinates}
                transform={item.transform}
                smoothOptions={item.smoothOptions}
                run={item.run}
                stampConfig={item.stampConfig}
                size={GRID_SIZE}
              />
              <Text style={styles.gridLabel}>{(item.distanceMeters / 1000).toFixed(2)} km</Text>
            </View>
          </Pressable>
        )}
        ListFooterComponent={
          <Link href="/dev-test" style={styles.devLink}>
            개발용 확인 화면
          </Link>
        }
      />
    </SafeAreaView>
  );
}

const HERO_SIZE = 330;
const GRID_SIZE = 168;

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.bg },
  list: { paddingHorizontal: 24, paddingBottom: 40, gap: Spacing.sm },
  headerBlock: { gap: Spacing.md, paddingTop: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  title: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 26, color: Colors.text, letterSpacing: -0.6 },
  archiveCount: {
    fontFamily: 'JetBrainsMono_500Medium',
    fontSize: 10,
    letterSpacing: 1.4,
    color: Colors.textMuted,
  },
  draftBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: Colors.accent,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  draftLabel: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 13.5, color: Colors.accent },
  draftMeta: { fontFamily: 'JetBrainsMono_500Medium', fontSize: 10, color: Colors.textMuted, marginTop: 3 },
  draftChevron: { color: Colors.accent, fontSize: 15 },
  heroCard: {
    height: HERO_SIZE,
    borderRadius: Radius.card,
    overflow: 'hidden',
    backgroundColor: Colors.bgCard,
    alignItems: 'center',
  },
  heroOverlay: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 18,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  heroDistance: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 34, color: Colors.text, letterSpacing: -1.2 },
  heroUnit: { fontFamily: 'SpaceGrotesk_500Medium', fontSize: 15, color: Colors.textMuted, letterSpacing: 0 },
  heroDate: {
    fontFamily: 'JetBrainsMono_500Medium',
    fontSize: 10,
    letterSpacing: 1,
    color: Colors.textMuted,
    marginTop: 2,
  },
  playButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIcon: { color: Colors.accentText, fontSize: 12, marginLeft: 2 },
  emptyBox: {
    height: HERO_SIZE,
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  emptyTitle: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 16, color: Colors.text },
  emptySub: { fontFamily: 'SpaceGrotesk_500Medium', fontSize: 12, color: Colors.textMuted },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  sectionLabel: {
    fontFamily: 'JetBrainsMono_500Medium',
    fontSize: 10,
    letterSpacing: 1.4,
    color: Colors.textMuted,
  },
  sectionLabelEn: {
    fontFamily: 'JetBrainsMono_500Medium',
    fontSize: 10,
    letterSpacing: 1.4,
    color: Colors.textMuted,
  },
  row: { gap: Spacing.sm },
  cell: { flex: 1 },
  gridThumb: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: Colors.bgCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridLabel: {
    position: 'absolute',
    left: 12,
    bottom: 10,
    fontFamily: 'JetBrainsMono_500Medium',
    fontSize: 10,
    color: Colors.text,
  },
  devLink: {
    marginTop: Spacing.xl,
    fontFamily: 'JetBrainsMono_500Medium',
    color: Colors.textMuted,
    fontSize: 11,
    textAlign: 'center',
  },
});
