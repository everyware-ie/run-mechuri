import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedButton } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { clearDraft } from '@/lib/draft-store';
import { addResult } from '@/lib/results-store';
import { useCreationFlow } from '@/state/creation-flow';

import RouteRenderer from '../../modules/route-renderer/src/RouteRendererModule';

// FRD: docs/specs/frd/export-and-share.md
// v0 스코프: 인스타 공유(§3)는 4단계(인스타 브릿지) 이후. 지금은 §4 기기 저장까지만.
// §2-2: 공유 화면에 들어온 시점이 아니라, 인코딩이 실제로 끝난 시점에만 완성으로 친다
// (S8 리뷰에서 나온 그 모호함을 여기서는 처음부터 이렇게 설계함).
//
// 이 화면은 iOS 네이티브 전용이다(렌더러·미디어 저장 둘 다 네이티브 모듈).
// 웹은 로컬 확인용일 뿐이라 여기서는 크래시 대신 안내만 보여준다.
// 디자인: "1a 야간 네온"

type RenderState = 'rendering' | 'done' | 'error';

export default function ShareScreen() {
  const { draft, reset } = useCreationFlow();
  const [state, setState] = useState<RenderState>('rendering');
  const [outputPath, setOutputPath] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  useEffect(() => {
    if (Platform.OS === 'web') return; // 렌더러가 네이티브 전용이라 웹에서는 시도 자체를 안 함

    const { selectedRun, track, backgroundImagePath } = draft;
    if (!selectedRun || !track || !backgroundImagePath) {
      setState('error');
      return;
    }

    const resultId = `${selectedRun.id}-${Date.now()}`;

    RouteRenderer.renderClip({
      points: track.coordinates.map((c) => ({ latitude: c.latitude, longitude: c.longitude })),
      backgroundImagePath,
      outputFileName: `mechuri-${resultId}`,
      preset: draft.preset,
      transform: draft.transform,
    })
      .then(async (result) => {
        // 완성 시점 = 인코딩 완료 시점. 여기서만 보관함에 추가하고, 초안은 지운다
        // (홈과 보관함 FRD §2-3: 다시 편집·같은 기록으로 새로 만들기가 되려면
        // 트랙·배경 참조·편집값을 다 들고 있어야 한다).
        await addResult({
          id: resultId,
          run: selectedRun,
          runDate: selectedRun.date,
          distanceMeters: selectedRun.distanceMeters,
          track,
          preset: draft.preset,
          transform: draft.transform,
          backgroundImagePath,
          outputPath: result.outputPath,
          createdAt: new Date().toISOString(),
        });
        await clearDraft();
        setOutputPath(result.outputPath);
        setState('done');
      })
      .catch(() => setState('error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSaveToPhotos = async () => {
    if (!outputPath) return;
    // 동적 import: expo-media-library는 웹 지원 자체가 없어서, 정적 import로 두면
    // 웹 번들이 로드되는 순간(호출 전인데도) 크래시한다. 실제로 누를 때만 불러온다.
    const MediaLibrary = await import('expo-media-library');
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') {
      setSaveStatus('사진 저장 권한이 거부됐어요. 인스타 공유는 4단계에서 붙습니다.');
      return;
    }
    try {
      await MediaLibrary.saveToLibraryAsync(outputPath);
      setSaveStatus('기기에 저장했어요');
    } catch {
      setSaveStatus('저장에 실패했어요');
    }
  };

  const handleDone = () => {
    reset();
    router.replace('/');
  };

  if (Platform.OS === 'web') {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.title}>이 화면은 iOS 전용이에요</Text>
        <Text style={styles.notice}>렌더링·저장 둘 다 네이티브 모듈이라 웹에서는 확인 안 돼요.</Text>
        <ThemedButton title="홈으로" onPress={handleDone} />
      </SafeAreaView>
    );
  }

  if (state === 'rendering') {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={Colors.accent} />
        <Text style={styles.notice}>결과물 만드는 중...</Text>
      </SafeAreaView>
    );
  }

  if (state === 'error') {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.title}>결과물을 만들지 못했어요</Text>
        <ThemedButton title="처음으로" onPress={handleDone} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.center}>
      <Text style={styles.title}>완성!</Text>
      <Text style={styles.path}>{outputPath}</Text>
      <View style={styles.actionColumn}>
        <ThemedButton title="기기에 저장" onPress={handleSaveToPhotos} />
        {saveStatus && <Text style={styles.notice}>{saveStatus}</Text>}
        <Text style={styles.notice}>인스타그램 공유는 4단계(인스타 브릿지)에서 붙습니다.</Text>
        <ThemedButton title="홈으로" variant="outline" onPress={handleDone} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: Colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  title: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 22, color: Colors.text },
  path: {
    fontFamily: 'JetBrainsMono_500Medium',
    fontSize: 11,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  notice: { fontFamily: 'JetBrainsMono_500Medium', color: Colors.textMuted, fontSize: 11, textAlign: 'center' },
  actionColumn: { alignSelf: 'stretch', gap: Spacing.sm, marginTop: Spacing.md },
});
