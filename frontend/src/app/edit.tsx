import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Image,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type PanResponderGestureState,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  computeFitTransform,
  computeStampBounds,
  IDENTITY_TRANSFORM,
  RoutePreview,
  STAMP_LAYOUTS,
  type RoutePreset,
  type RouteTransform,
  type StampConfig,
  type StampItem,
  type StampLayout,
} from '@/components/route-preview';
import { ScreenHeader } from '@/components/screen-header';
import { Slider } from '@/components/slider';
import { ThemedButton } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { saveDraft } from '@/lib/draft-store';
import type { SmoothOptions } from '@/lib/route-smoothing';
import {
  formatDistanceKm,
  formatDuration,
  formatHeartRate,
  formatPace,
  formatStampDate,
} from '@/lib/stamp-format';
import { useCreationFlow } from '@/state/creation-flow';

// FRD: docs/specs/frd/result-editing.md
// 프리셋 선택(§3), 드로잉 크기·위치·회전 제스처+초기화(§4), 미리보기 재생 규칙(§2-1),
// 다듬기 세기(§5), 각인 편집(§7)까지 구현. 속도·색은 여전히 여유 시라 이후(목업 구현 3/6).
//
// 2026-09: 미리보기를 화면 전체로 키우고 아래 컨트롤은 드래그로 접었다 펼 수 있는
// 바텀시트로 뺐다(실기기 피드백 — 작은 카드 안에 눌려 있던 걸 크게 보고 싶다는 것,
// 그리고 그 카드가 ScrollView 안에 있어서 드래그 제스처가 스크롤과 경합하던 문제도
// 이 구조에선 아예 없어진다 — 미리보기 영역을 감싸는 스크롤 컨테이너가 없다).

// 시안 S6 "넣을 것" 순서. 칩에는 실제 값도 함께 보여준다(stampChipLabel).
const STAMP_ITEMS: StampItem[] = ['distance', 'time', 'pace', 'date', 'place', 'heartRate'];

const PRESETS: { id: RoutePreset; label: string }[] = [
  { id: 'default-drawing', label: '기본 드로잉' },
  { id: 'light-runner', label: '불빛 러너' },
  { id: 'segment-lighting', label: '구간 점등' },
];

const SHEET_EXPANDED_HEIGHT = 372;
const SHEET_PEEK_HEIGHT = 44;

function touchDistance(t1: { pageX: number; pageY: number }, t2: { pageX: number; pageY: number }) {
  return Math.hypot(t2.pageX - t1.pageX, t2.pageY - t1.pageY);
}

function touchAngleDeg(t1: { pageX: number; pageY: number }, t2: { pageX: number; pageY: number }) {
  return (Math.atan2(t2.pageY - t1.pageY, t2.pageX - t1.pageX) * 180) / Math.PI;
}

export default function EditScreen() {
  const {
    draft,
    setPreset: commitPreset,
    setTransform: commitTransform,
    setSmoothOptions: commitSmoothOptions,
    setStampConfig: commitStampConfig,
    resetTransform,
  } = useCreationFlow();

  // §4-1: 편집 대상은 각인 시트가 열려 있는 동안만 '각인'(끌어서 위치 이동), 그 외엔 '드로잉'.
  // "3안" 시안 S7에는 드로잉/각인 토글이 없다 — [각인] 버튼이 시트(S6)를 연다.
  const [stampSheetOpen, setStampSheetOpen] = useState(false);
  // §7-1 안전 영역 가이드 — 실기기 피드백(2026-09): 항상 떠 있으면 거슬린다는
  // 지적으로 기본 숨김·버튼으로 토글하는 방식으로 바꿨다.
  const [showSafeGuide, setShowSafeGuide] = useState(false);
  const insets = useSafeAreaInsets();

  const [transform, setTransformState] = useState<RouteTransform>(draft.transform);
  const transformRef = useRef(transform);
  const updateTransform = (t: RouteTransform) => {
    transformRef.current = t;
    setTransformState(t);
  };

  // §5: 기본은 한 축("다듬기 세기"). 고급 설정을 열면 직선(smooth)·코너(corner)를 따로 만진다.
  const [smoothOptions, setSmoothOptionsState] = useState<SmoothOptions>(draft.smoothOptions);
  const smoothOptionsRef = useRef(smoothOptions);
  const updateSmoothOptions = (opts: SmoothOptions) => {
    smoothOptionsRef.current = opts;
    setSmoothOptionsState(opts);
  };
  // applySmoothing(route-smoothing.ts)은 이동평균 + RDP 단순화 + 모서리 라운딩을
  // 원본 GPS 점 전체에 매번 다시 돌린다 — 실기기 피드백(2026-09): 슬라이더를 끄는
  // 동안 이게 손가락이 움직이는 raw 터치 이벤트마다(프레임보다 훨씬 잦게) 그대로
  // 불려서 버벅였다. 최신값은 ref에 바로 반영해 시각적 반응은 즉시 유지하되, 실제
  // 무거운 재계산(state 갱신 → useMemo)은 화면 프레임당 한 번으로 묶는다.
  const pendingSmoothRef = useRef<SmoothOptions | null>(null);
  const smoothRafRef = useRef<number | null>(null);
  const flushPendingSmooth = () => {
    if (smoothRafRef.current !== null) {
      cancelAnimationFrame(smoothRafRef.current);
      smoothRafRef.current = null;
    }
    if (pendingSmoothRef.current) {
      updateSmoothOptions(pendingSmoothRef.current);
      pendingSmoothRef.current = null;
    }
  };
  const handleSmoothAxisChange = (axis: 'smooth' | 'corner', value: number) => {
    pendingSmoothRef.current = { ...smoothOptionsRef.current, [axis]: value };
    if (smoothRafRef.current === null) {
      smoothRafRef.current = requestAnimationFrame(() => {
        smoothRafRef.current = null;
        if (pendingSmoothRef.current) {
          updateSmoothOptions(pendingSmoothRef.current);
          pendingSmoothRef.current = null;
        }
      });
    }
  };
  const handleSmoothCommit = () => {
    flushPendingSmooth();
    commitSmoothOptions(smoothOptionsRef.current);
  };

  // §7: 각인 넷은 하나의 묶음 — 위치·크기 하나씩만 갖는다(2026-09-02: 원래 §4-2는
  // "크기·회전 없음, 끌기만 반응"이었는데, 화면에서 직접 탭해 고르는 김에 크기
  // 조정도 요청받아 scale을 추가했다 — 회전은 그대로 없음).
  const [stampConfig, setStampConfigState] = useState<StampConfig>(draft.stampConfig);
  const stampConfigRef = useRef(stampConfig);
  const updateStampConfig = (c: StampConfig) => {
    stampConfigRef.current = c;
    setStampConfigState(c);
  };
  const handleStampItemToggle = (item: StampItem) => {
    const next = { ...stampConfigRef.current, enabled: { ...stampConfigRef.current.enabled, [item]: !stampConfigRef.current.enabled[item] } };
    updateStampConfig(next);
    commitStampConfig(next);
  };
  // 시안 S6 "한 줄 문구".
  const handleCaptionChange = (text: string) => {
    const next = { ...stampConfigRef.current, caption: text };
    updateStampConfig(next);
    commitStampConfig(next);
  };
  const handleLayoutSelect = (layout: StampLayout) => {
    const next = { ...stampConfigRef.current, layout };
    updateStampConfig(next);
    commitStampConfig(next);
  };

  // '장소' 각인 값 — 트랙 좌표(가운데 점)를 역지오코딩해 한 번 채운다. 실패하면
  // 그냥 비워 둔다(칩은 "장소"로만 보이고, 켜도 아무것도 안 그린다).
  useEffect(() => {
    if ((stampConfigRef.current.placeName ?? '').length > 0) return;
    const coords = draft.track?.coordinates;
    if (!coords || coords.length === 0) return;
    const mid = coords[Math.floor(coords.length / 2)];
    let cancelled = false;
    Location.reverseGeocodeAsync({ latitude: mid.latitude, longitude: mid.longitude })
      .then((res) => {
        if (cancelled) return;
        const p = res[0];
        const name = p?.district || p?.city || p?.subregion || p?.name || '';
        if (!name) return;
        const next = { ...stampConfigRef.current, placeName: name };
        updateStampConfig(next);
        commitStampConfig(next);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // 트랙이 바뀔 때만 한 번 — commit/update는 안정적이지 않아 넣으면 매 편집마다 재지오코딩된다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.track]);

  const [isInteracting, setIsInteracting] = useState(false);
  const baseTransform = useRef<RouteTransform>(transform);
  const baseStampPosition = useRef(stampConfig.position);
  const baseStampScale = useRef(stampConfig.scale ?? 1);
  const gestureStart = useRef<{ distance: number; angle: number } | null>(null);
  // draft.selectedRun은 이 화면에 들어오기 전에 이미 정해져 안 바뀌지만, panResponder는
  // useRef라 첫 렌더 클로저를 그대로 들고 있으므로(아래) ref로 최신값을 보장한다.
  const selectedRunRef = useRef(draft.selectedRun);
  selectedRunRef.current = draft.selectedRun;
  // previewArea의 실측 크기 — 아래 panResponder 클로저 안에서 각인 탭 히트테스트에 쓴다.
  const [previewSize, setPreviewSize] = useState({ width: 0, height: 0 });
  const previewSizeRef = useRef(previewSize);
  // 가이드가 켜져 있는 동안은 미리보기 fit이 'cover'로 바뀐다(아래 JSX) — 히트테스트도
  // 같은 fit을 써야 탭 좌표가 어긋나지 않는다.
  const showSafeGuideRef = useRef(showSafeGuide);
  showSafeGuideRef.current = showSafeGuide;

  // 실기기 피드백(2026-09-02): "각인 시트가 열려 있을 때만 각인을 옮길 수 있다"는
  // 기존 규칙 대신, 드로잉처럼 화면을 직접 탭한 지점으로 대상을 고른다 — §4-1이
  // 원래 요구하던 "화면에서 직접 탭해서도 고를 수 있게 한다"를 만족시킨다. 탭
  // 지점이 각인의 대략적 영역(computeStampBounds, route-preview.tsx) 안이면 그
  // 제스처는 각인을, 아니면 경로를 움직인다. 렌더 중에 읽지 않고 제스처 핸들러
  // 안에서만 읽으므로 ref로 둔다. stampTargeted는 "지금 각인을 쥐고 있다"는 걸
  // RoutePreview의 선택 점선 박스에 전달하는 용도라 state로 따로 둔다.
  const editTargetRef = useRef<'drawing' | 'stamp'>('drawing');
  const [stampTargeted, setStampTargeted] = useState(false);

  const panResponder = useRef(
    PanResponder.create({
      // 미리보기 영역 안에서 시작한 터치만 잡는다 — 이 responder는 previewArea
      // 경계에 딱 맞는 뷰 하나에만 붙어 있어서(§ 아래 JSX), 그 바깥 터치(바텀시트,
      // 헤더 등)는애초에 이 콜백 자체가 안 불린다.
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt: GestureResponderEvent) => {
        setIsInteracting(true);

        // 탭 지점(뷰 픽셀) → 캔버스 좌표로 역변환해 각인 영역 히트테스트.
        // RoutePreview가 실제로 쓰는 것과 같은 fit·bottomInset이어야 좌표가 어긋나지
        // 않는다(아래 JSX의 RoutePreview 호출과 값이 같아야 함).
        const run = selectedRunRef.current;
        const bounds = run ? computeStampBounds(run, stampConfigRef.current) : null;
        let isStamp = false;
        if (bounds) {
          const { fitScale, offsetX, offsetY } = computeFitTransform(
            previewSizeRef.current.width,
            previewSizeRef.current.height,
            showSafeGuideRef.current ? 'cover' : 'cover-safe',
            SHEET_EXPANDED_HEIGHT + insets.bottom
          );
          const touch = evt.nativeEvent.touches[0] ?? evt.nativeEvent;
          const canvasX = (touch.locationX - offsetX) / fitScale;
          const canvasY = (touch.locationY - offsetY) / fitScale;
          isStamp =
            canvasX >= bounds.x &&
            canvasX <= bounds.x + bounds.width &&
            canvasY >= bounds.y &&
            canvasY <= bounds.y + bounds.height;
        }
        editTargetRef.current = isStamp ? 'stamp' : 'drawing';
        setStampTargeted(isStamp);

        const touches = evt.nativeEvent.touches;
        if (isStamp) {
          baseStampPosition.current = stampConfigRef.current.position;
          baseStampScale.current = stampConfigRef.current.scale ?? 1;
        } else {
          baseTransform.current = transformRef.current;
        }
        if (touches.length === 2) {
          gestureStart.current = {
            distance: touchDistance(touches[0], touches[1]),
            angle: touchAngleDeg(touches[0], touches[1]),
          };
        } else {
          gestureStart.current = null;
        }
      },
      onPanResponderMove: (evt: GestureResponderEvent, gestureState: PanResponderGestureState) => {
        const touches = evt.nativeEvent.touches;
        if (editTargetRef.current === 'stamp') {
          // 각인은 끌기(위치) + 두 손가락 핀치(크기)만 반응한다 — 회전은 없음.
          if (touches.length === 2) {
            if (!gestureStart.current) {
              gestureStart.current = {
                distance: touchDistance(touches[0], touches[1]),
                angle: touchAngleDeg(touches[0], touches[1]),
              };
            }
            const newDistance = touchDistance(touches[0], touches[1]);
            const scaleDelta = newDistance / (gestureStart.current.distance || 1);
            updateStampConfig({
              ...stampConfigRef.current,
              position: {
                x: baseStampPosition.current.x + gestureState.dx,
                y: baseStampPosition.current.y + gestureState.dy,
              },
              scale: Math.min(3, Math.max(0.5, baseStampScale.current * scaleDelta)),
            });
          } else {
            updateStampConfig({
              ...stampConfigRef.current,
              position: {
                x: baseStampPosition.current.x + gestureState.dx,
                y: baseStampPosition.current.y + gestureState.dy,
              },
            });
          }
          return;
        }
        if (touches.length === 2) {
          if (!gestureStart.current) {
            gestureStart.current = {
              distance: touchDistance(touches[0], touches[1]),
              angle: touchAngleDeg(touches[0], touches[1]),
            };
          }
          const newDistance = touchDistance(touches[0], touches[1]);
          const newAngle = touchAngleDeg(touches[0], touches[1]);
          const scaleDelta = newDistance / (gestureStart.current.distance || 1);
          const rotationDelta = newAngle - gestureStart.current.angle;
          updateTransform({
            x: baseTransform.current.x + gestureState.dx,
            y: baseTransform.current.y + gestureState.dy,
            scale: Math.max(0.3, baseTransform.current.scale * scaleDelta),
            rotationDeg: baseTransform.current.rotationDeg + rotationDelta,
          });
        } else {
          updateTransform({
            ...baseTransform.current,
            x: baseTransform.current.x + gestureState.dx,
            y: baseTransform.current.y + gestureState.dy,
          });
        }
      },
      onPanResponderRelease: () => {
        setIsInteracting(false);
        setStampTargeted(false);
        gestureStart.current = null;
        if (editTargetRef.current === 'stamp') {
          commitStampConfig(stampConfigRef.current);
        } else {
          commitTransform(transformRef.current);
        }
      },
    })
  ).current;

  // 아래 컨트롤 패널(바텀시트) — 손잡이를 드래그해서 접었다 펼 수 있다. 접으면
  // 미리보기가 화면 거의 전체로 보인다. 손잡이 영역에만 반응해서 슬라이더·버튼
  // 터치와 겹치지 않는다.
  // PanResponder는 useRef로 한 번만 만들어져서 그 콜백들이 첫 렌더의 클로저를
  // 계속 들고 있다 — useState로 두면 갱신이 반영 안 되는 stale closure가 되므로 ref로 둔다.
  const sheetExpandedRef = useRef(true);
  const sheetTranslateY = useRef(new Animated.Value(0)).current;
  const sheetDragStart = useRef(0);
  // 시트를 끌 때도 미리보기 애니메이션을 멈춘다 — 안 멈추면 계속 도는 Skia 글로우
  // 렌더링(RAF)과 시트 드래그의 JS 스레드 작업이 같이 돌면서 드래그가 버벅였다.
  const [isSheetDragging, setIsSheetDragging] = useState(false);
  // 실기기 피드백(2026-09): 다 내렸을 때 손잡이가 홈 인디케이터 스와이프 제스처
  // 영역이랑 겹쳐서 잡기 힘들었다 — 접힌 상태에서 그만큼(insets.bottom)은 더 안
  // 내려가게 한다. insets는 화면이 떠 있는 동안 안 바뀌므로 여기서 한 번만
  // 읽어도 안전하다(sheetPanResponder도 useRef라 마운트 시점 클로저를 쓴다).
  const sheetCollapseDistance = SHEET_EXPANDED_HEIGHT - SHEET_PEEK_HEIGHT - insets.bottom;

  const animateSheetTo = (expanded: boolean) => {
    sheetExpandedRef.current = expanded;
    Animated.spring(sheetTranslateY, {
      toValue: expanded ? 0 : sheetCollapseDistance,
      useNativeDriver: true,
      bounciness: 4,
    }).start();
  };

  const sheetPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_evt, gestureState) => Math.abs(gestureState.dy) > 2,
      onPanResponderGrant: () => {
        setIsSheetDragging(true);
        sheetTranslateY.stopAnimation((value) => {
          sheetDragStart.current = value;
        });
      },
      onPanResponderMove: (_evt, gestureState) => {
        const next = sheetDragStart.current + gestureState.dy;
        sheetTranslateY.setValue(Math.max(0, Math.min(sheetCollapseDistance, next)));
      },
      onPanResponderRelease: (_evt, gestureState) => {
        setIsSheetDragging(false);
        // 40px 이상 내리면 접고, 40px 이상 올리면 펼치고, 그 사이는 원래 상태로 되돌린다.
        const dy = gestureState.dy;
        if (dy > 40) animateSheetTo(false);
        else if (dy < -40) animateSheetTo(true);
        else animateSheetTo(sheetExpandedRef.current);
      },
    })
  ).current;

  // 홈과 보관함 FRD §3-1: "이어서 만들기"에 올라오는 건 마지막으로 편집한 것.
  // 이 화면에 들어와 있는 것 자체가 "지금 이걸 만지고 있다"는 뜻이라, 진입 시점과
  // 프리셋·변형값이 바뀔 때마다 초안을 저장해둔다. 완성되면 share.tsx에서 지운다.
  useEffect(() => {
    if (!draft.selectedRun || !draft.track || !draft.backgroundImagePath) return;
    saveDraft({
      run: draft.selectedRun,
      track: draft.track,
      backgroundImagePath: draft.backgroundImagePath,
      preset: draft.preset,
      transform: draft.transform,
      smoothOptions: draft.smoothOptions,
      stampConfig: draft.stampConfig,
    });
  }, [
    draft.selectedRun,
    draft.track,
    draft.backgroundImagePath,
    draft.preset,
    draft.transform,
    draft.smoothOptions,
    draft.stampConfig,
  ]);

  const handleReset = () => {
    // §4-3: 되돌리는 단위는 드로잉 조작뿐. 프리셋·각인은 그대로 둔다.
    updateTransform(IDENTITY_TRANSFORM);
    resetTransform();
  };

  const handlePresetSelect = (preset: RoutePreset) => {
    commitPreset(preset);
  };

  const handleNext = () => {
    router.push('/share');
  };

  const handlePreviewLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    previewSizeRef.current = { width, height };
    setPreviewSize({ width, height });
  };

  const smoothLabel = (v: number) => (v === 0 ? '없음' : `${v} %`);
  const cornerLabel = (v: number) => (v === 0 ? '각지게' : `${v} %`);

  if (!draft.track || !draft.backgroundImagePath || !draft.selectedRun) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader title="편집" />
        <View style={styles.center}>
          <Text style={styles.hint}>기록이나 배경이 아직 안 골라졌어요.</Text>
          <ThemedButton title="처음으로" onPress={() => router.replace('/')} />
        </View>
      </SafeAreaView>
    );
  }

  const run = draft.selectedRun;
  const stampItems = STAMP_ITEMS.filter(
    (item) => item !== 'heartRate' || run.averageHeartRate !== undefined
  );
  // 시안 S6: 칩에 항목명 + 실제 값을 함께 보여준다.
  const stampChipLabel = (item: StampItem): string => {
    switch (item) {
      case 'distance':
        return `거리 ${formatDistanceKm(run.distanceMeters)}`;
      case 'time':
        return `시간 ${formatDuration(run.durationSeconds)}`;
      case 'pace':
        return `페이스 ${formatPace(run.averagePaceSecPerKm).replace('/km', '')}`;
      case 'date':
        return `날짜 ${formatStampDate(run.date)}`;
      case 'place':
        return stampConfig.placeName ? `장소 ${stampConfig.placeName}` : '장소';
      case 'heartRate':
        return `심박 ${run.averageHeartRate ? formatHeartRate(run.averageHeartRate) : ''}`;
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ScreenHeader
        title="편집"
        right={
          <Text onPress={handleNext} style={styles.headerAction}>
            완료
          </Text>
        }
      />

      {/* 미리보기 — 화면에서 헤더·바텀시트를 뺀 나머지 전부를 차지한다. 이 뷰 자체가
          제스처 캡처 영역의 경계라, 시트나 헤더로 터치가 새 나갈 일이 없다. */}
      <View style={styles.previewArea} onLayout={handlePreviewLayout}>
        {previewSize.width > 0 && (
          <>
            <Image source={{ uri: draft.backgroundImagePath }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            <View {...panResponder.panHandlers} style={[StyleSheet.absoluteFill, isInteracting && styles.previewActive]}>
              <RoutePreview
                points={draft.track.coordinates}
                preset={draft.preset}
                transform={transform}
                smoothOptions={smoothOptions}
                run={draft.selectedRun}
                stampConfig={stampConfig}
                showSafeAreaGuide={showSafeGuide}
                isInteracting={isInteracting || isSheetDragging}
                viewWidth={previewSize.width}
                viewHeight={previewSize.height}
                // 실기기 피드백(2026-09-02): 가이드(SafeAreaGuide)는 캔버스 전체
                // 기준으로 인스타 UI가 덮는 위·아래 자리(아바타·답장창 모양)까지
                // 보여주는 건데, cover-safe는 애초에 그 부분을 화면 밖으로
                // 잘라내 버려서 가이드를 켜도 경계선만 화면 끝에 걸치고 아바타·
                // 답장창 모양은 아예 안 보였다("이상하게 나온다"의 원인). 가이드를
                // 볼 때만 캔버스 전체가 다 보이는 'cover'로 잠깐 바꿔서, 인스타
                // UI가 실제로 어디를 덮는지 제대로 비교할 수 있게 한다.
                fit={showSafeGuide ? 'cover' : 'cover-safe'}
                // previewArea가 flex:1이라 바텀시트(펼친 상태 기준, 접으면 더
                // 보이니 안전한 쪽으로) 만큼까지 포함해서 높이가 잡힌다 — 그만큼
                // 빼야 각인이 시트 뒤로 밀려 들어가지 않는다. cover-safe에서만 쓰임.
                bottomInset={SHEET_EXPANDED_HEIGHT + insets.bottom}
                stampSelected={stampTargeted}
              />
            </View>
            {/* §7-1: 인스타 스토리에서 안 가려지는 영역 미리 보기. 기본 숨김, 눌러서 확인. */}
            <Pressable
              onPress={() => setShowSafeGuide((v) => !v)}
              style={[styles.guideToggle, showSafeGuide && styles.guideToggleOn]}>
              <Text style={showSafeGuide ? styles.guideToggleTextOn : styles.guideToggleText}>인스타 스토리 영역</Text>
            </Pressable>
            <Text style={styles.cardHint}>
              {stampTargeted ? '끌기 · 각인 위치 / 두 손가락 · 각인 크기' : '끌기 · 이동 / 두 손가락 · 확대·회전'}
            </Text>
          </>
        )}
      </View>

      {/* 컨트롤 바텀시트 — 손잡이를 위아래로 끌면 접고 펼 수 있다. */}
      {!stampSheetOpen && (
        <Animated.View
          style={[
            styles.sheet,
            { paddingBottom: insets.bottom + 12, transform: [{ translateY: sheetTranslateY }] },
          ]}>
          <View {...sheetPanResponder.panHandlers} style={styles.sheetHandleArea}>
            <View style={styles.sheetHandleBar} />
          </View>

          <View style={styles.sheetContent}>
            {/* §3 프리셋 */}
            <Text style={styles.sectionLabel}>프리셋 · PRESET</Text>
            <View style={styles.presetRow}>
              {PRESETS.map((p) => {
                const on = draft.preset === p.id;
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => handlePresetSelect(p.id)}
                    style={[styles.presetChip, on && styles.presetChipOn]}>
                    <Text style={on ? styles.presetChipTextOn : styles.presetChipText}>{p.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            {/* §5: 결과를 보면서 조절한다. 시안 S7대로 직선·코너 두 축을 바로 노출한다
                (FRD §5의 "기본은 한 축"과 다름 — 확인 노트에 기록). 슬라이더 범위 자체가
                안전 구간이라(route-rendering §3-2) 경고·차단 UI는 없다. */}
            <View style={styles.sliderHead}>
              <Text style={styles.sectionLabel}>직접 다듬기 · SMOOTH</Text>
              <Text style={styles.sliderValue}>{smoothLabel(smoothOptions.smooth)}</Text>
            </View>
            <Slider
              value={smoothOptions.smooth}
              onChange={(v) => handleSmoothAxisChange('smooth', v)}
              onSlidingComplete={handleSmoothCommit}
            />

            <View style={styles.sliderHead}>
              <Text style={styles.sectionLabel}>코너 반경 · CORNER</Text>
              <Text style={styles.sliderValue}>{cornerLabel(smoothOptions.corner)}</Text>
            </View>
            <Slider
              value={smoothOptions.corner}
              onChange={(v) => handleSmoothAxisChange('corner', v)}
              onSlidingComplete={handleSmoothCommit}
            />

            <View style={styles.outlineRow}>
              <Pressable style={styles.outlineBtn} onPress={() => setStampSheetOpen(true)}>
                <Text style={styles.outlineBtnText}>각인</Text>
              </Pressable>
              <Pressable style={styles.outlineBtn} onPress={() => router.push('/background-selection')}>
                <Text style={styles.outlineBtnText}>배경 바꾸기</Text>
              </Pressable>
              <Pressable style={styles.outlineBtn} onPress={handleReset}>
                <Text style={styles.outlineBtnMuted}>초기화</Text>
              </Pressable>
            </View>

            <Text style={styles.note}>
              적용 버튼이 없습니다. 초기화는 드로잉 조작만 되돌리고 프리셋·각인은 남습니다.
            </Text>
          </View>
        </Animated.View>
      )}

      {/* §7 각인 시트(S6) — 프리셋·넣을 것·한 줄 문구 등 "값"을 고르는 곳. 위치·크기는
          이제 이 시트를 열지 않아도 미리보기에서 각인을 직접 탭해 바꿀 수 있다(위
          panResponder의 히트테스트, editTarget='stamp') — 이 시트는 텍스트 값 편집
          전용으로 역할이 좁혀졌다. 컨트롤 바텀시트와 자리를 다투지 않도록, 열려
          있는 동안엔 그 시트를 안 그린다(위).
          실기기 피드백(2026-09-02): 예전엔 이 시트가 손잡이 없는 고정 View라 접을
          수 없었다 — "화면의 반을 차지해서 각인 프리셋을 눌러도 바뀌는 게 안 보인다"는
          불만의 원인. 컨트롤 시트와 똑같이 sheetTranslateY/sheetPanResponder를 그대로
          공유해 끌어서 접을 수 있게 했다(두 시트가 동시에 그려지지 않으니 상태를
          공유해도 안전하다). 내용도 sheetContent로 감싸 프리셋 시트와 같은
          padding·gap 리듬을 쓴다 — 이전엔 항목들이 감싸는 뷰 없이 나란히 있어서
          "글씨가 다닥다닥 붙어있다"는 불만이 있었다. */}
      {stampSheetOpen && (
        <Animated.View
          style={[
            styles.sheet,
            { paddingBottom: insets.bottom + 12, transform: [{ translateY: sheetTranslateY }] },
          ]}>
          <View {...sheetPanResponder.panHandlers} style={styles.sheetHandleArea}>
            <View style={styles.sheetHandleBar} />
          </View>

          <View style={styles.sheetContent}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>각인</Text>
              <Text onPress={() => setStampSheetOpen(false)} style={styles.headerAction}>
                완료
              </Text>
            </View>

            {/* "배치"라는 이름 아래 묻혀 있던 걸 드로잉 프리셋과 같은 라벨 패턴으로 —
                실기기 피드백(2026-09): 이건 단순 위치 배치가 아니라 각인을 어떤 스타일로
                표현할지 고르는 프리셋이다. StampLayout이 확장 가능한 유니온이라
                나중에 항목이 늘어도 이 자리(칩 목록)만 늘리면 된다. */}
            <Text style={styles.sectionLabel}>각인 프리셋 · PRESET</Text>
            {/* 실물 사진 참고(2026-09-02)로 프리셋이 2개→6개로 늘어서, flex:1로 한
                줄에 욱여넣던 presetChip 대신 내용만큼만 너비를 차지하고 줄바꿈되는
                칩으로 바꿨다("넣을 것" 칩과 같은 패턴). */}
            <View style={styles.layoutChipRow}>
              {STAMP_LAYOUTS.map((l) => {
                const on = (stampConfig.layout ?? 'row') === l.id;
                return (
                  <Pressable
                    key={l.id}
                    onPress={() => handleLayoutSelect(l.id)}
                    style={[styles.layoutChip, on && styles.presetChipOn]}>
                    <Text style={on ? styles.presetChipTextOn : styles.presetChipText}>{l.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.sectionLabel}>넣을 것</Text>
            <View style={styles.chipRowWrap}>
              {stampItems.map((item) => {
                const on = stampConfig.enabled?.[item] ?? false;
                return (
                  <Pressable
                    key={item}
                    onPress={() => handleStampItemToggle(item)}
                    style={[styles.itemChip, on && styles.itemChipOn]}>
                    <Text style={on ? styles.itemChipTextOn : styles.itemChipText}>{stampChipLabel(item)}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.sectionLabel}>한 줄 문구</Text>
            <TextInput
              value={stampConfig.caption ?? ''}
              onChangeText={handleCaptionChange}
              placeholder="예) 비 오는 날의 한강"
              placeholderTextColor={Colors.textMuted}
              maxLength={40}
              style={styles.captionInput}
            />

            <Text style={styles.note}>끌어서 접으면 미리보기를 보면서 고를 수 있어요.</Text>
          </View>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

const CHIP_ON_BG = 'rgba(255,90,43,0.12)';

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.bg },
  center: {
    flex: 1,
    backgroundColor: Colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  headerAction: { fontFamily: 'JetBrainsMono_500Medium', fontSize: 12, color: Colors.accent },
  previewArea: { flex: 1, backgroundColor: Colors.bgCard, overflow: 'hidden' },
  // 조작 중임을 눈으로도 알 수 있게 — "터치 경계가 명확하지 않다"는 피드백 대응.
  previewActive: { borderWidth: 2, borderColor: Colors.accent },
  guideToggle: {
    position: 'absolute',
    top: 14,
    alignSelf: 'center',
    height: 32,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    backgroundColor: 'rgba(11,13,16,0.55)',
  },
  guideToggleOn: { borderColor: Colors.accent, backgroundColor: CHIP_ON_BG },
  guideToggleText: { fontFamily: 'JetBrainsMono_500Medium', fontSize: 10, color: Colors.textMuted },
  guideToggleTextOn: { fontFamily: 'JetBrainsMono_500Medium', fontSize: 10, color: Colors.accent },
  cardHint: {
    position: 'absolute',
    left: 16,
    bottom: 14,
    fontFamily: 'JetBrainsMono_500Medium',
    fontSize: 9.5,
    letterSpacing: 1,
    color: Colors.textMuted,
  },
  sectionLabel: {
    fontFamily: 'JetBrainsMono_500Medium',
    fontSize: 10,
    letterSpacing: 1.4,
    color: Colors.textMuted,
  },
  presetRow: { flexDirection: 'row', gap: 8 },
  chipRow: { flexDirection: 'row', gap: 8 },
  chipRowWrap: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  captionInput: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 15,
    color: Colors.text,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderStrong,
    paddingVertical: 8,
  },
  presetChip: {
    flex: 1,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.border,
  },
  presetChipOn: { backgroundColor: Colors.accent },
  presetChipText: { fontFamily: 'SpaceGrotesk_500Medium', fontSize: 12, color: Colors.textMuted },
  presetChipTextOn: { fontFamily: 'SpaceGrotesk_500Medium', fontSize: 12, color: Colors.accentText },
  // 각인 프리셋(6개, 2026-09-02)용 — presetChip과 달리 flex:1로 한 줄에 욱여넣지
  // 않고 내용만큼만 차지하며 줄바꿈된다.
  layoutChipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  layoutChip: {
    height: 40,
    paddingHorizontal: 18,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.border,
  },
  sliderHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 8,
  },
  sliderValue: { fontFamily: 'JetBrainsMono_500Medium', fontSize: 12, color: Colors.accent },
  itemChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
  },
  itemChipOn: { borderColor: Colors.accent, backgroundColor: CHIP_ON_BG },
  itemChipText: { fontFamily: 'SpaceGrotesk_500Medium', fontSize: 12, color: Colors.textMuted },
  itemChipTextOn: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 12, color: Colors.accent },
  outlineRow: { flexDirection: 'row', gap: 8, marginTop: 18 },
  outlineBtn: {
    flex: 1,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlineBtnText: { fontFamily: 'SpaceGrotesk_500Medium', fontSize: 12, color: Colors.text },
  outlineBtnMuted: { fontFamily: 'SpaceGrotesk_500Medium', fontSize: 12, color: Colors.textMuted },
  note: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 11,
    lineHeight: 17,
    color: Colors.textMuted,
    marginTop: 6,
  },
  hint: { fontFamily: 'JetBrainsMono_500Medium', color: Colors.textMuted, fontSize: 11 },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.bgCard,
    borderTopLeftRadius: Radius.pill,
    borderTopRightRadius: Radius.pill,
    borderTopWidth: 1,
    borderColor: Colors.border,
  },
  sheetHandleArea: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  sheetHandleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.borderStrong,
  },
  sheetContent: { paddingHorizontal: 24, gap: 12 },
  // 각인 시트에서 sheetContent(패딩·gap 포함)의 첫 자식으로 쓴다 — 가로 패딩·위
  // 여백은 부모(sheetContent·sheetHandleArea)가 이미 주므로 여기서는 두지 않는다.
  sheetHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sheetTitle: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 17, color: Colors.text },
});
