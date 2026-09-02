import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useSharedValue } from 'react-native-reanimated';
import {
  Animated,
  Image,
  Keyboard,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type GestureResponderEvent,
  type KeyboardEvent,
  type LayoutChangeEvent,
  type PanResponderGestureState,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  computeFitTransform,
  computeStampBounds,
  CYCLE_SECONDS,
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
  // 실기기 피드백(2026-09-02): "재생 중엔 경로·각인 조작이 계속 느리다" — 재생과
  // 편집이 동시에 안 겹치도록, 기본은 정지(완성된 모습)로 두고 재생 버튼을 눌러야만
  // 그려지는 과정을 보여준다. 한 번 누르면 한 사이클(그리기+정지 유지, CYCLE_SECONDS)
  // 만 재생하고 자동으로 다시 정지 상태로 돌아온다 — RoutePreview 내부에서 정확히
  // 재는 대신 여기서 타이머로 넉넉히(+0.3초) 맞춘다. 몇 ms 어긋나도 티가 안 나는
  // 용도라 이 정도 근사로 충분하고, RoutePreview 쪽에 별도 콜백을 안 늘려도 된다.
  const [isPlaying, setIsPlaying] = useState(false);
  useEffect(() => {
    if (!isPlaying) return;
    const t = setTimeout(() => setIsPlaying(false), (CYCLE_SECONDS + 0.3) * 1000);
    return () => clearTimeout(t);
  }, [isPlaying]);
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
  // 실기기 피드백(2026-09-02): "경로 이동이 뚝뚝 끊긴다" — 예전엔 끌기·핀치 중에
  // 매 터치 이벤트마다 updateTransform(React state)을 불러서 RoutePreview 전체가
  // 다시 렌더됐다(그 렌더 자체·Skia로의 새 값 전달 왕복이 비용). 이제 이 네
  // SharedValue에 직접 쓴다 — RoutePreview가 Skia Group transform을 이 값들의
  // .value만 읽어 만들게 해뒀으므로(transformShared), 리렌더 없이 네이티브
  // 쪽에서만 갱신된다(불빛 러너 진행률과 같은 경로). 손을 뗄 때만 이 값들을
  // transform(state)에 한 번 커밋한다.
  const transformXShared = useSharedValue(transform.x);
  const transformYShared = useSharedValue(transform.y);
  const transformScaleShared = useSharedValue(transform.scale);
  const transformRotationShared = useSharedValue(transform.rotationDeg);
  // transform(state)이 드래그가 아닌 다른 경로(초기화 버튼 등)로 바뀔 때도 이
  // SharedValue들을 같이 맞춰 둔다 — 안 그러면 다음 드래그가 옛 값에서 이어진다.
  useEffect(() => {
    transformXShared.value = transform.x;
    transformYShared.value = transform.y;
    transformScaleShared.value = transform.scale;
    transformRotationShared.value = transform.rotationDeg;
  }, [transform, transformXShared, transformYShared, transformScaleShared, transformRotationShared]);
  const baseStampPosition = useRef(stampConfig.position);
  const baseStampScale = useRef(stampConfig.scale ?? 1);
  // 실기기 피드백(2026-09-02): 각인을 한 손가락으로 끌 때(위치만 바뀌는 경우)도
  // stampConfig(React state) RAF 스로틀만으로는 여전히 렉이 있었다 — 이 클래식
  // Animated.Value 두 개(useNativeDriver:true)에 직접 .setValue()를 불러서
  // 진짜로 리렌더 없이 네이티브 쪽에서 위치만 움직인다(바텀시트 드래그와 같은
  // 방식). 두 손가락(핀치 크기 조정)은 계속 RAF 스로틀 경로를 쓴다 — 크기까지
  // 이 값으로 감당하려면 폰트 재계산과 별개로 다뤄야 해서 복잡도가 커지고,
  // 핀치는 위치 드래그보다 훨씬 짧고 드문 제스처라 우선순위가 낮다.
  const stampDragX = useRef(new Animated.Value(0)).current;
  const stampDragY = useRef(new Animated.Value(0)).current;
  const gestureStart = useRef<{ distance: number; angle: number } | null>(null);
  // 실기기 피드백(2026-09-02): 각인을 끌 때 손가락 이동마다(raw 터치 이벤트, 화면
  // 프레임보다 훨씬 잦다) updateStampConfig를 그대로 부르면 RoutePreview가 매번
  // 다시 렌더되며 stampLayoutDescriptors(포맷팅 함수들 + 8개 레이아웃 분기 계산)를
  // 다시 돈다 — smoothOptions 슬라이더 때와 같은 종류의 버벅임. 같은 방식(ref에
  // 최신값 반영은 즉시, 실제 state 반영은 화면 프레임당 한 번)으로 묶는다.
  const pendingStampConfigRef = useRef<StampConfig | null>(null);
  const stampConfigRafRef = useRef<number | null>(null);
  const flushPendingStampConfig = () => {
    if (stampConfigRafRef.current !== null) {
      cancelAnimationFrame(stampConfigRafRef.current);
      stampConfigRafRef.current = null;
    }
    if (pendingStampConfigRef.current) {
      updateStampConfig(pendingStampConfigRef.current);
      pendingStampConfigRef.current = null;
    }
  };
  const scheduleStampConfigUpdate = (next: StampConfig) => {
    pendingStampConfigRef.current = next;
    if (stampConfigRafRef.current === null) {
      stampConfigRafRef.current = requestAnimationFrame(() => {
        stampConfigRafRef.current = null;
        if (pendingStampConfigRef.current) {
          updateStampConfig(pendingStampConfigRef.current);
          pendingStampConfigRef.current = null;
        }
      });
    }
  };
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
  // 이번 제스처(grant~release) 동안의 fitScale — 뷰 픽셀 dx/dy를 캔버스 좌표로
  // 바꿀 때 쓴다(아래 move·release). grant에서 한 번만 계산해 담아 둔다.
  const gestureFitScaleRef = useRef(1);

  const panResponder = useRef(
    PanResponder.create({
      // 미리보기 영역 안에서 시작한 터치만 잡는다 — 이 responder는 previewArea
      // 경계에 딱 맞는 뷰 하나에만 붙어 있어서(§ 아래 JSX), 그 바깥 터치(바텀시트,
      // 헤더 등)는애초에 이 콜백 자체가 안 불린다.
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt: GestureResponderEvent) => {
        setIsInteracting(true);

        // 뷰 픽셀 ↔ 캔버스 좌표 변환에 쓰는 fitScale — 히트테스트뿐 아니라 이번
        // 제스처 동안의 모든 dx/dy 변환(아래 move·release)에서 재사용한다.
        // previewSize·showSafeGuide는 드래그 도중 안 바뀌므로 grant에서 한 번만
        // 계산해 ref에 담아 두면 충분하다(매 move마다 다시 계산할 필요 없음).
        const { fitScale, offsetX, offsetY } = computeFitTransform(
          previewSizeRef.current.width,
          previewSizeRef.current.height,
          showSafeGuideRef.current ? 'cover' : 'cover-safe',
          SHEET_EXPANDED_HEIGHT + insets.bottom
        );
        gestureFitScaleRef.current = fitScale;

        // 탭 지점(뷰 픽셀) → 캔버스 좌표로 역변환해 각인 영역 히트테스트.
        const run = selectedRunRef.current;
        const bounds = run ? computeStampBounds(run, stampConfigRef.current) : null;
        let isStamp = false;
        if (bounds) {
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
          // 방어적 초기화 — 정상적으로는 이전 드래그의 release에서 이미
          // 0으로 돌아가 있지만, 제스처가 중간에 끊기는 등의 경우를 대비한다.
          stampDragX.setValue(0);
          stampDragY.setValue(0);
        } else {
          baseTransform.current = transformRef.current;
          // 방어적 동기화 — 보통은 위 useEffect가 이미 맞춰 놨겠지만, 만에 하나
          // 어긋나 있어도 이번 드래그는 항상 최신 커밋 값에서 시작하게 한다.
          transformXShared.value = baseTransform.current.x;
          transformYShared.value = baseTransform.current.y;
          transformScaleShared.value = baseTransform.current.scale;
          transformRotationShared.value = baseTransform.current.rotationDeg;
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
              // 한 손가락 드래그 중 두 번째 손가락이 닿아 핀치로 넘어가는 순간 —
              // 그 지점부터는 위치도 stampConfig(RAF 스로틀) 쪽이 다시 맡으므로,
              // 네이티브 오프셋(stampDragX/Y)은 지금 값만큼 남아있으면 이중으로
              // 더해져 튄다. 0으로 되돌린다.
              stampDragX.setValue(0);
              stampDragY.setValue(0);
            }
            const newDistance = touchDistance(touches[0], touches[1]);
            const scaleDelta = newDistance / (gestureStart.current.distance || 1);
            // 한 손가락 release 커밋과 같은 이유로 dx/dy(뷰 픽셀)를 fitScale로
            // 나눠 캔버스 좌표로 바꾼다 — 안 그러면 핀치 중 위치도 짧게 움직인다.
            scheduleStampConfigUpdate({
              ...stampConfigRef.current,
              position: {
                x: baseStampPosition.current.x + gestureState.dx / gestureFitScaleRef.current,
                y: baseStampPosition.current.y + gestureState.dy / gestureFitScaleRef.current,
              },
              scale: Math.min(3, Math.max(0.5, baseStampScale.current * scaleDelta)),
            });
          } else {
            // 한 손가락 드래그 — stampConfig(React state)를 안 건드리고 이
            // Animated.Value에 직접 쓴다. RoutePreview가 각인 Svg 전체를 이
            // 값만큼 오프셋하므로(stampDragOffset) 리렌더 없이 네이티브 쪽에서
            // 움직인다.
            stampDragX.setValue(gestureState.dx);
            stampDragY.setValue(gestureState.dy);
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
          // 각인과 같은 이유(위 grant 주석) — dx/dy는 뷰 픽셀, transform.x/y는
          // 캔버스 좌표(Skia Group transform이 fitScale 적용 "전" 단계에서 이
          // 값을 쓴다)라 fitScale로 나눠야 미리보기와 커밋 위치가 일치한다.
          transformXShared.value = baseTransform.current.x + gestureState.dx / gestureFitScaleRef.current;
          transformYShared.value = baseTransform.current.y + gestureState.dy / gestureFitScaleRef.current;
          transformScaleShared.value = Math.max(0.3, baseTransform.current.scale * scaleDelta);
          transformRotationShared.value = baseTransform.current.rotationDeg + rotationDelta;
        } else {
          transformXShared.value = baseTransform.current.x + gestureState.dx / gestureFitScaleRef.current;
          transformYShared.value = baseTransform.current.y + gestureState.dy / gestureFitScaleRef.current;
        }
      },
      onPanResponderRelease: (_evt, gestureState) => {
        setIsInteracting(false);
        setStampTargeted(false);
        // gestureStart가 non-null이면 이 제스처 동안 핀치(두 손가락)로 넘어간
        // 적이 있었다는 뜻 — 아래 reset 전에 먼저 읽어 둔다.
        const wasStampPinching = gestureStart.current !== null;
        gestureStart.current = null;
        if (editTargetRef.current === 'stamp') {
          if (wasStampPinching) {
            // 핀치(위치+크기) 경로 — scheduleStampConfigUpdate가 이미 최신값을
            // stampConfigRef에 반영해 두고 있다. 마지막으로 예약된(아직 화면엔 안
            // 반영된) 값까지 확실히 반영한 다음 커밋 — 안 그러면 손을 뗀 마지막
            // 프레임 분의 미세한 변화가 씹힐 수 있다.
            flushPendingStampConfig();
            commitStampConfig(stampConfigRef.current);
          } else {
            // 한 손가락 드래그 — stampConfig(state)는 이번 드래그 동안 안
            // 건드렸다(stampDragX/Y로만 네이티브에서 움직였다). 최종 위치를 여기서
            // 계산해 커밋하고, 오프셋은 0으로 되돌린다(안 그러면 다음 렌더에서
            // 실제 위치 + 남은 오프셋이 겹쳐 보인다).
            //
            // 실기기 피드백(2026-09-02): "놓은 자리에 정확히 안 놓인다" — 드래그
            // 중 미리보기는 gestureState.dx/dy(뷰 픽셀)를 그대로 오프셋으로 썼는데,
            // stampConfig.position은 캔버스 좌표(1080x1920)라 단위가 다르다. 뷰
            // 픽셀을 그대로 더하면 화면이 캔버스보다 작은 만큼(fitScale<1) 실제
            // 캔버스 상 이동량보다 훨씬 작게 반영돼 미리보기보다 짧게 움직인
            // 자리에 놓였다 — 탭 히트테스트(위 grant)와 같은 fitScale(이번 제스처
            // 시작 시점에 계산해 둔 값)로 나눠 캔버스 좌표로 변환해야 미리보기와
            // 정확히 같은 자리에 커밋된다.
            const finalPosition = {
              x: baseStampPosition.current.x + gestureState.dx / gestureFitScaleRef.current,
              y: baseStampPosition.current.y + gestureState.dy / gestureFitScaleRef.current,
            };
            const next = { ...stampConfigRef.current, position: finalPosition };
            updateStampConfig(next);
            commitStampConfig(next);
            // 실기기 피드백(2026-09-02): "놓고 나서 원래 자리로 갔다가 다시 놓은
            // 자리로 이동한다" — updateStampConfig(React state)는 렌더를 거쳐야
            // 새 position이 각인 Svg에 실제로 반영되는데, 바로 다음 줄에서 오프셋을
            // 0으로 되돌리면(Animated.Value, 네이티브로 즉시 반영) 그게 더 빠르다.
            // 그 사이 한두 프레임 동안 "오프셋 0 + 아직 안 바뀐 옛 position" =
            // 드래그 시작 전 자리로 보였다가, 그다음 프레임에 새 position이 반영돼
            // 다시 최종 자리로 튀어 보인다. 오프셋 리셋을 다음 프레임 이후로
            // 미뤄서(requestAnimationFrame 두 번 — 한 번만으로는 커밋이 실제
            // 페인트까지 안 끝난 기기가 있을 수 있어 여유를 둠) state 쪽 렌더가
            // 먼저 자리 잡은 뒤에 오프셋을 지운다.
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                stampDragX.setValue(0);
                stampDragY.setValue(0);
              });
            });
          }
        } else {
          // 드래그 중엔 transform(state)을 안 건드렸다 — SharedValue에 마지막으로
          // 쓰인 값(위 onPanResponderMove)이 곧 최종값이니 그걸 그대로 커밋한다.
          const finalTransform: RouteTransform = {
            x: transformXShared.value,
            y: transformYShared.value,
            scale: transformScaleShared.value,
            rotationDeg: transformRotationShared.value,
          };
          updateTransform(finalTransform);
          commitTransform(finalTransform);
        }
        // 실기기 피드백(2026-09-02): 바텀시트 바깥(미리보기) 아무 데나 누르면
        // 시트를 접어달라는 요청 — 실제로 끌거나 확대·회전한 게 아니라 그냥
        // 짧게 탭한 경우에만(움직인 거리가 거의 0) 반응한다. 이 responder는
        // previewArea에만 붙어 있어서(§ 아래 JSX) "시트 바깥"의 뜻 그대로다.
        const isTap = Math.abs(gestureState.dx) < 6 && Math.abs(gestureState.dy) < 6;
        if (isTap && sheetExpandedRef.current) {
          animateSheetTo(false);
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
  // 실기기 피드백(2026-09-02): "손잡이만 남기고 살짝 접기"로는 편집 화면을
  // 제대로 볼 수 없다 — 아예 화면 밖으로 완전히 숨겼다가 버튼으로 다시 부를 수
  // 있게 해달라는 요청. sheetExpanded는 그 "완전히 숨겨졌나"를 JSX(숨김 버튼
  // 표시 여부)에서 읽으려고 ref와 같이 둔 state 버전이다.
  const [sheetExpanded, setSheetExpanded] = useState(true);
  const sheetTranslateY = useRef(new Animated.Value(0)).current;
  const sheetDragStart = useRef(0);
  // 실기기 피드백(2026-09-02): 각인 시트의 "한 줄 문구" 입력창에 키보드가 뜨면
  // 입력창을 그대로 가려서 뭘 쓰는지 안 보였다 — 키보드 높이만큼 시트를 더
  // 밀어 올린다(끌기로 접고 펴는 sheetTranslateY와는 별개 축, 최종 위치는
  // 두 값을 합쳐서 계산). keyboardWillShow/Hide(iOS 전용)는 키보드 자체
  // 애니메이션 시작 전에 미리 알려줘서, 같은 duration으로 동시에 움직이면
  // 자연스럽게 같이 올라가는 느낌이 난다. keyboardDidShow/Hide는 키보드가
  // 다 뜬 다음에야 불려서 한 박자 늦게 따라가는 느낌이 났을 것이다.
  const keyboardOffset = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const animateKeyboard = (e: KeyboardEvent, toValue: number) => {
      Animated.timing(keyboardOffset, {
        toValue,
        duration: e.duration || 250,
        useNativeDriver: true,
      }).start();
    };
    const showSub = Keyboard.addListener('keyboardWillShow', (e) => animateKeyboard(e, e.endCoordinates.height));
    const hideSub = Keyboard.addListener('keyboardWillHide', (e) => animateKeyboard(e, 0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [keyboardOffset]);
  // 시트를 끌 때도 미리보기 애니메이션을 멈춘다 — 안 멈추면 계속 도는 Skia 글로우
  // 렌더링(RAF)과 시트 드래그의 JS 스레드 작업이 같이 돌면서 드래그가 버벅였다.
  const [isSheetDragging, setIsSheetDragging] = useState(false);
  // 접었을 때 시트 전체(손잡이 포함)가 화면 밖으로 완전히 나가도록 내린다 —
  // 예전엔 손잡이만 남기고 살짝 접었는데(SHEET_PEEK_HEIGHT), 그래도 편집
  // 화면을 가린다는 피드백으로 아예 다 감추는 쪽으로 바꿨다. 시트의 실제
  // 렌더 높이는 내용(각인 프리셋 8개가 줄바꿈되는 등)에 따라 달라져서
  // SHEET_EXPANDED_HEIGHT는 못 믿는다 — 화면에서 이 시트보다 확실히 클
  // 값(여기서는 previewArea 높이 전체 + 여유)만큼 내려서 내용이 얼마나
  // 길어지든 항상 화면 밖으로 나가게 한다. insets는 화면이 떠 있는 동안 안
  // 바뀌므로 여기서 한 번만 읽어도 안전하다(sheetPanResponder도 useRef라
  // 마운트 시점 클로저를 쓴다).
  const sheetCollapseDistance = Math.max(SHEET_EXPANDED_HEIGHT, previewSize.height) + insets.bottom + 60;

  const animateSheetTo = (expanded: boolean) => {
    sheetExpandedRef.current = expanded;
    setSheetExpanded(expanded);
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
    // 실기기 피드백(2026-09-02): 재생이 기본 정지로 바뀐 뒤로, 프리셋을 눌러도
    // 뭐가 달라지는지(불빛이 달리는지, 구간이 켜지는지) 안 보인다 — 프리셋을
    // 고르는 그 순간만큼은 한 번 자동으로 재생해서 보여준다(누르면 한
    // 사이클 후 자동으로 다시 정지, 위 isPlaying 타이머와 동일).
    setIsPlaying(true);
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

  // 끌기로 접고 펴는 위치(sheetTranslateY, 아래로 갈수록 +)에서 키보드가 뜬
  // 만큼(keyboardOffset)을 뺀다 — 두 값이 각자 애니메이션되다가 최종
  // translateY에서 합쳐진다.
  const sheetY = Animated.subtract(sheetTranslateY, keyboardOffset);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ScreenHeader
        title="편집"
        right={
          // 배경 선택 화면과 같은 이유(2026-09-02) — Text onPress 대신 Pressable
          // hitSlop으로 탭 영역을 넓힌다.
          <Pressable onPress={handleNext} hitSlop={12}>
            <Text style={styles.headerAction}>완료</Text>
          </Pressable>
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
                transformShared={{
                  x: transformXShared,
                  y: transformYShared,
                  scale: transformScaleShared,
                  rotationDeg: transformRotationShared,
                }}
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
                playing={isPlaying}
                stampDragOffset={{ x: stampDragX, y: stampDragY }}
              />
            </View>
            {/* §7-1: 인스타 스토리에서 안 가려지는 영역 미리 보기. 기본 숨김, 눌러서 확인. */}
            <Pressable
              onPress={() => setShowSafeGuide((v) => !v)}
              style={[styles.guideToggle, showSafeGuide && styles.guideToggleOn]}>
              <Text style={showSafeGuide ? styles.guideToggleTextOn : styles.guideToggleText}>인스타 스토리 영역</Text>
            </Pressable>
            {/* 실기기 피드백(2026-09-02): 재생 중엔 편집 조작이 느려진다 — 기본은
                정지(완성된 모습)로 두고, 재생 과정 자체를 보고 싶을 때만 눌러서
                본다(한 사이클 후 자동으로 다시 정지). panResponder 위에 겹치는
                형제 Pressable이라(guideToggle과 같은 자리) 탭이 그쪽으로 새지
                않는다. */}
            <Pressable
              onPress={() => setIsPlaying((v) => !v)}
              style={[styles.playToggle, { bottom: 8 + insets.bottom }, isPlaying && styles.playToggleOn]}>
              <Text style={styles.playToggleIcon}>{isPlaying ? '❚❚' : '▶'}</Text>
            </Pressable>
            <Text style={[styles.cardHint, { bottom: 14 + insets.bottom }]}>
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
            { paddingBottom: insets.bottom + 12, transform: [{ translateY: sheetY }] },
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
            { paddingBottom: insets.bottom + 12, transform: [{ translateY: sheetY }] },
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

      {/* 실기기 피드백(2026-09-02): 시트를 접어도 손잡이가 편집 화면을 가린다는
          지적 — 접힌 동안(sheetExpanded===false)은 시트를 화면 밖으로 완전히
          숨기고, 이 버튼 하나만 남겨 다시 부를 수 있게 한다. */}
      {!sheetExpanded && (
        <Pressable
          onPress={() => animateSheetTo(true)}
          style={[styles.sheetReopenButton, { bottom: 16 + insets.bottom }]}>
          <Text style={styles.sheetReopenText}>편집 도구 열기</Text>
        </Pressable>
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
  // 시트를 완전히 숨겼을 때만 뜨는 버튼 — 화면 맨 아래 가운데.
  sheetReopenButton: {
    position: 'absolute',
    bottom: 16,
    alignSelf: 'center',
    height: 40,
    justifyContent: 'center',
    paddingHorizontal: 18,
    borderRadius: 20,
    backgroundColor: Colors.accent,
  },
  sheetReopenText: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 12, color: Colors.accentText },
  cardHint: {
    position: 'absolute',
    left: 16,
    bottom: 14,
    fontFamily: 'JetBrainsMono_500Medium',
    fontSize: 9.5,
    letterSpacing: 1,
    color: Colors.textMuted,
  },
  // 재생/정지 토글 — cardHint(왼쪽 아래)와 짝을 이루는 오른쪽 아래 자리.
  playToggle: {
    position: 'absolute',
    right: 16,
    bottom: 8,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(11,13,16,0.55)',
    borderWidth: 1,
    borderColor: Colors.borderStrong,
  },
  playToggleOn: { borderColor: Colors.accent, backgroundColor: CHIP_ON_BG },
  playToggleIcon: { fontSize: 12, color: Colors.text },
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
