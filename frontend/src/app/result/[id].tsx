import { router, useLocalSearchParams } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RouteThumbnail } from '@/components/route-thumbnail';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedButton } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { deleteResult, getResult, type SavedResult } from '@/lib/results-store';
import { useCreationFlow } from '@/state/creation-flow';

// FRD: docs/specs/frd/home-and-library.md §2-2
// "보기 / 공유 / 다시 편집 / 같은 기록으로 새로 만들기 / 삭제"
// 보기는 v0는 정지 이미지(썸네일 크게)로 대신한다 — 영상 재생 라이브러리는 아직 안 붙임.

export default function ResultDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { loadDraft } = useCreationFlow();
  const [result, setResult] = useState<SavedResult | null | undefined>(undefined);

  useEffect(() => {
    if (!id) return;
    getResult(id).then(setResult);
  }, [id]);

  const handleReEdit = async () => {
    if (!result) return;
    // 실기기 피드백(2026-09-03): "다시 편집 → 결과물을 만들지 못했어요" — 예전에
    // 만든 결과물의 backgroundImagePath가 그 사이 앱이 재설치되거나(새 dev-client
    // 빌드 등) 저장공간 부족으로 iOS가 캐시를 정리해서 더 이상 못 찾는 경우가
    // 있다(background-selection.tsx가 이제 documentDirectory에 복사해 두지만,
    // 이 fix 이전에 만들어진 결과물은 여전히 옛 경로를 들고 있다). 편집을 다
    // 해놓고 마지막(공유 화면) 단계에서야 실패하면 그동안의 편집이 헛수고가
    // 되니, 시작하기 전에 미리 확인해서 배경만 다시 고르게 안내한다 — 나머지
    // 편집값(프리셋·변형·다듬기·각인)은 그대로 유지.
    const bgInfo = await FileSystem.getInfoAsync(result.backgroundImagePath);
    if (!bgInfo.exists) {
      Alert.alert('배경 이미지를 다시 골라야 해요', '이전에 쓴 배경 사진을 더 이상 찾을 수 없어요. 배경만 다시 골라주세요 — 나머지 편집 내용은 그대로 유지됩니다.', [
        {
          text: '확인',
          onPress: () => {
            loadDraft({
              selectedRun: result.run,
              track: result.track,
              preset: result.preset,
              transform: result.transform,
              smoothOptions: result.smoothOptions,
              stampConfig: result.stampConfig,
            });
            router.push('/background-selection');
          },
        },
      ]);
      return;
    }
    // §2-2: "다시 편집"은 그때의 편집값 그대로 연다.
    loadDraft({
      selectedRun: result.run,
      track: result.track,
      backgroundImagePath: result.backgroundImagePath,
      preset: result.preset,
      transform: result.transform,
      smoothOptions: result.smoothOptions,
      stampConfig: result.stampConfig,
    });
    router.push('/edit');
  };

  const handleMakeAnother = () => {
    if (!result) return;
    // §2-2: "같은 기록으로 새로 만들기"는 렌더러 초기값에서 시작한다(result-editing §8).
    // 배경은 다시 고를 수 있게 배경 선택부터.
    loadDraft({ selectedRun: result.run, track: result.track });
    router.push('/background-selection');
  };

  const handleDelete = () => {
    if (!result) return;
    Alert.alert('결과물을 삭제할까요?', '되돌릴 수 없어요.', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          await deleteResult(result.id);
          router.replace('/');
        },
      },
    ]);
  };

  if (result === undefined) return <SafeAreaView style={styles.safeArea} />;
  if (result === null) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader title="결과물" />
        <View style={styles.center}>
          <Text style={styles.notice}>결과물을 찾을 수 없어요.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScreenHeader title="결과물" />
      <View style={styles.container}>
        <View style={styles.previewBox}>
          <RouteThumbnail
            points={result.track.coordinates}
            transform={result.transform}
            smoothOptions={result.smoothOptions}
            run={result.run}
            stampConfig={result.stampConfig}
            size={270}
          />
        </View>
        <Text style={styles.distance}>{(result.distanceMeters / 1000).toFixed(2)}km</Text>
        <Text style={styles.meta}>{result.runDate.slice(0, 10)}</Text>

        <View style={styles.actionColumn}>
          <ThemedButton title="다시 편집" onPress={handleReEdit} />
          <ThemedButton title="같은 기록으로 새로 만들기" variant="outline" onPress={handleMakeAnother} />
          <ThemedButton title="삭제" variant="outline" onPress={handleDelete} />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center' },
  container: { flex: 1, alignItems: 'center', padding: Spacing.lg, gap: Spacing.sm },
  previewBox: {
    width: 270,
    height: 270,
    borderRadius: Radius.card,
    overflow: 'hidden',
    backgroundColor: Colors.bgCard,
  },
  distance: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 26, color: Colors.text, marginTop: Spacing.sm },
  meta: { fontFamily: 'JetBrainsMono_500Medium', fontSize: 12, color: Colors.textMuted },
  notice: { fontFamily: 'JetBrainsMono_500Medium', color: Colors.textMuted, fontSize: 12 },
  actionColumn: { alignSelf: 'stretch', gap: Spacing.sm, marginTop: Spacing.lg },
});
