import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RouteThumbnail } from '@/components/route-thumbnail';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedButton } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
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

const CARD_SIZE = 300;

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
    // §4-3: 필요한 건 "사진 쓰기"(add-only)뿐. 전체 접근을 요청하면 iOS가
    // NSPhotoLibraryUsageDescription을 요구하는데 app.json은 add-only 문구
    // (NSPhotoLibraryAddUsageDescription)만 넣어서, 요청이 조용히 실패했다.
    // writeOnly로 요청해 plist와 맞춘다.
    const { status } = await MediaLibrary.requestPermissionsAsync(true);
    if (status !== 'granted') {
      setSaveStatus('사진 저장 권한이 필요해요. 설정에서 허용해주세요.');
      return;
    }
    try {
      await MediaLibrary.saveToLibraryAsync(outputPath);
      setSaveStatus('기기에 저장했어요');
    } catch (error) {
      console.warn('saveToLibraryAsync failed', error);
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

    // uiPhase === 'progress' — "3안" 시안 S8a 인코딩 중.
    const pct = Math.round(progress * 100);
    const encTrack = draft.track;
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader title="내보내기" onBack={null} />
        <View style={styles.doneBody}>
          <View style={styles.encCard}>
            {encTrack && draft.selectedRun && draft.backgroundImagePath && (
              <>
                <Image
                  source={{ uri: draft.backgroundImagePath }}
                  style={StyleSheet.absoluteFill}
                  resizeMode="cover"
                />
                <RouteThumbnail
                  points={encTrack.coordinates}
                  transform={draft.transform}
                  smoothOptions={draft.smoothOptions}
                  run={draft.selectedRun}
                  stampConfig={draft.stampConfig}
                  size={CARD_SIZE}
                />
              </>
            )}
            <View style={styles.encOverlay}>
              <Text style={styles.encPct}>{pct}%</Text>
              <Text style={styles.encLabel}>영상으로 만드는 중</Text>
            </View>
          </View>

          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${pct}%` }]} />
          </View>
          <Text style={styles.encSpec}>12초 · 1080×1920</Text>

          <ThemedButton title="취소" variant="outline" onPress={handleCancel} style={styles.cancelButton} />
          <Text style={styles.notice}>
            이 화면을 벗어나도 인코딩은 계속됩니다. 끝나면 보관함에 완성으로 들어옵니다.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // §2-2: 여기까지 왔으면 인코딩이 끝났고, 편집 정보(트랙·배경·기록)는 다 있다.
  // "3안" 전체 화면 시안(theme.ts 참고)의 S8b 공유 카드 — 배경 위에 완주 시점의
  // 경로·각인을 얹고, 그 아래 거리·날짜를 둔다. 보관함 상세(result/[id].tsx)와 같은
  // 구성이라 "완성됐고 이게 보관함에 이렇게 남는다"가 한눈에 읽힌다.
  const { selectedRun, track, backgroundImagePath } = draft;
  if (!selectedRun || !track || !backgroundImagePath) {
    return <SafeAreaView style={styles.center} />;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScreenHeader title="완성!" onBack={null} />
      <View style={styles.doneBody}>
        <View style={styles.card}>
          <Image source={{ uri: backgroundImagePath }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          <RouteThumbnail
            points={track.coordinates}
            transform={draft.transform}
            smoothOptions={draft.smoothOptions}
            run={selectedRun}
            stampConfig={draft.stampConfig}
            size={CARD_SIZE}
          />
          <Text style={styles.cardTag}>메추리 · {selectedRun.date.slice(0, 10)}</Text>
        </View>
        <Text style={styles.distance}>
          {(selectedRun.distanceMeters / 1000).toFixed(2)}
          <Text style={styles.distanceUnit}> km</Text>
        </Text>

        <View style={styles.actionColumn}>
          <ThemedButton title="기기에 저장" onPress={handleSaveToPhotos} />
          {saveStatus && <Text style={styles.notice}>{saveStatus}</Text>}
          <ThemedButton title="홈으로" variant="outline" onPress={handleDone} />
          {/* §3 인스타그램 스토리 공유는 인스타 네이티브 브릿지(4단계) 이후. */}
          <Text style={styles.notice}>
            공유하지 않고 나가도 보관함에 완성된 결과물로 남습니다.{'\n'}
            인스타그램 스토리 공유는 4단계(인스타 브릿지)에서 붙습니다.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.bg },
  center: {
    flex: 1,
    backgroundColor: Colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  doneBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
  },
  title: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 22, color: Colors.text },
  card: {
    width: CARD_SIZE,
    height: CARD_SIZE,
    borderRadius: Radius.card,
    overflow: 'hidden',
    backgroundColor: Colors.bgCard,
    alignItems: 'center',
  },
  cardTag: {
    position: 'absolute',
    top: 14,
    left: 16,
    fontFamily: 'JetBrainsMono_500Medium',
    fontSize: 10,
    letterSpacing: 1.6,
    color: Colors.accent,
  },
  distance: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 34,
    color: Colors.text,
    letterSpacing: -1.2,
    marginTop: Spacing.sm,
  },
  distanceUnit: { fontFamily: 'SpaceGrotesk_500Medium', fontSize: 15, color: Colors.textMuted, letterSpacing: 0 },
  notice: { fontFamily: 'JetBrainsMono_500Medium', color: Colors.textMuted, fontSize: 11, textAlign: 'center', lineHeight: 17 },
  actionColumn: { alignSelf: 'stretch', gap: Spacing.sm, marginTop: Spacing.md },
  encCard: {
    width: CARD_SIZE,
    height: CARD_SIZE,
    borderRadius: Radius.card,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bgCard,
    alignItems: 'center',
  },
  encOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(11,13,16,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  encPct: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 40, color: Colors.accent, letterSpacing: -1.6 },
  encLabel: {
    fontFamily: 'JetBrainsMono_500Medium',
    fontSize: 10.5,
    letterSpacing: 1.2,
    color: Colors.textMuted,
  },
  encSpec: { fontFamily: 'JetBrainsMono_500Medium', fontSize: 10, color: Colors.textMuted, alignSelf: 'flex-start' },
  progressTrack: {
    alignSelf: 'stretch',
    height: 3,
    backgroundColor: Colors.border,
    overflow: 'hidden',
  },
  progressFill: { height: 3, backgroundColor: Colors.accent },
  cancelButton: { marginTop: Spacing.md, alignSelf: 'stretch' },
});
