import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, StyleSheet, Text, View } from 'react-native';
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
// §2-3·common-rules §6: 대기 표시 타이밍 — 0.3초 뒤 스피너, 한 번 뜨면 0.5초는 유지,
// 2초 넘기면 진행률+취소로 바뀐다. §2-4·F1·F2: 취소·실패 둘 다 편집 화면으로 돌아오고
// 편집값은 유지된다(초안은 edit.tsx가 계속 저장해둔 그대로).
//
// 이 화면은 iOS 네이티브 전용이다(렌더러·미디어 저장 둘 다 네이티브 모듈).
// 웹은 로컬 확인용일 뿐이라 여기서는 크래시 대신 안내만 보여준다.
// 디자인: "1a 야간 네온"

const UI_SHOW_DELAY = 300;
const UI_MIN_HOLD = 500;
const UI_PROGRESS_DELAY = 2000;

type UiPhase = 'hidden' | 'spinner' | 'progress';

export default function ShareScreen() {
  const { draft, reset } = useCreationFlow();
  const [uiPhase, setUiPhase] = useState<UiPhase>('hidden');
  const [progress, setProgress] = useState(0);
  const [outputPath, setOutputPath] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const shownAtRef = useRef<number | null>(null);
  const cancelledRef = useRef(false);

  // common-rules §6 타이밍: 0.3초에 표시, 2초에 진행률·취소로 전환.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const showTimer = setTimeout(() => {
      setUiPhase('spinner');
      shownAtRef.current = Date.now();
    }, UI_SHOW_DELAY);
    const progressTimer = setTimeout(() => setUiPhase('progress'), UI_PROGRESS_DELAY);
    return () => {
      clearTimeout(showTimer);
      clearTimeout(progressTimer);
    };
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const subscription = RouteRenderer.addListener('onRenderProgress', (event) => {
      setProgress(event.progress);
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return; // 렌더러가 네이티브 전용이라 웹에서는 시도 자체를 안 함

    const { selectedRun, track, backgroundImagePath } = draft;
    if (!selectedRun || !track || !backgroundImagePath) {
      Alert.alert('편집 정보를 찾을 수 없어요', '처음부터 다시 해주세요.', [
        { text: '확인', onPress: () => router.replace('/') },
      ]);
      return;
    }

    // 한 번 표시된 대기 표시는 최소 0.5초는 유지한다(common-rules §6) — 인코딩이
    // 그보다 먼저 끝나도 화면 전환은 그만큼 늦춘다. 아예 안 떴으면(0.3초 전에 끝남)
    // 바로 전환한다.
    const finishAfterMinHold = (fn: () => void) => {
      const shownAt = shownAtRef.current;
      const remaining = shownAt ? Math.max(0, UI_MIN_HOLD - (Date.now() - shownAt)) : 0;
      setTimeout(fn, remaining);
    };

    const resultId = `${selectedRun.id}-${Date.now()}`;

    RouteRenderer.renderClip({
      points: track.coordinates.map((c) => ({ latitude: c.latitude, longitude: c.longitude })),
      backgroundImagePath,
      outputFileName: `mechuri-${resultId}`,
      preset: draft.preset,
      transform: draft.transform,
      smooth: draft.smoothOptions.smooth,
      corner: draft.smoothOptions.corner,
      stampMode: draft.stampConfig.mode,
      stampItems: draft.stampConfig.enabled,
      stampX: draft.stampConfig.position.x,
      stampY: draft.stampConfig.position.y,
      distanceMeters: selectedRun.distanceMeters,
      durationSeconds: selectedRun.durationSeconds,
      averagePaceSecPerKm: selectedRun.averagePaceSecPerKm,
      averageHeartRate: selectedRun.averageHeartRate ?? null,
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
          smoothOptions: draft.smoothOptions,
          stampConfig: draft.stampConfig,
          backgroundImagePath,
          outputPath: result.outputPath,
          createdAt: new Date().toISOString(),
        });
        await clearDraft();
        finishAfterMinHold(() => setOutputPath(result.outputPath));
      })
      .catch(() => {
        if (cancelledRef.current) {
          // F2: 취소하면 편집 화면으로 돌아오고 편집값은 그대로다. 사용자가 직접
          // 멈춘 거라 설명이 필요 없다.
          router.back();
          return;
        }
        // F1·F3: 실패도 편집 화면으로 돌아오고 편집값은 그대로다. 무엇이 안 됐는지
        // 알리고, "다음"을 다시 누르는 게 재시도 경로다.
        Alert.alert('결과물을 만들지 못했어요', '다시 시도해주세요.', [
          { text: '확인', onPress: () => router.back() },
        ]);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCancel = () => {
    cancelledRef.current = true;
    RouteRenderer.cancelRender();
  };

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

  if (!outputPath) {
    if (uiPhase === 'hidden') return <SafeAreaView style={styles.center} />;

    if (uiPhase === 'spinner') {
      return (
        <SafeAreaView style={styles.center}>
          <ActivityIndicator color={Colors.accent} />
          <Text style={styles.notice}>결과물 만드는 중...</Text>
        </SafeAreaView>
      );
    }

    // uiPhase === 'progress'
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.progressText}>{Math.round(progress * 100)}%</Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
        </View>
        <ThemedButton title="취소" variant="outline" onPress={handleCancel} style={styles.cancelButton} />
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
  progressText: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 32, color: Colors.text },
  progressTrack: {
    width: '80%',
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.bgCard,
    overflow: 'hidden',
  },
  progressFill: { height: 6, backgroundColor: Colors.accent },
  cancelButton: { marginTop: Spacing.lg, minWidth: 140 },
});
