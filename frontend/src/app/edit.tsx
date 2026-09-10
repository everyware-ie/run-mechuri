import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useSharedValue } from 'react-native-reanimated';
import {
  Animated,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  LayoutAnimation,
  Platform,
  ScrollView,
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
import { SafeAreaView } from 'react-native-safe-area-context';

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
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { saveDraft } from '@/lib/draft-store';
import { fitPortraitPreview } from '@/lib/preview-layout';
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
// 2026-09-10: 도구가 캔버스를 가리지 않도록 위아래로 배치한다.
// 도구를 접으면 남은 영역에 9:16 전체 미리보기가 더 크게 들어간다.

// 시안 S6 "넣을 것" 순서. 칩에는 실제 값도 함께 보여준다(stampChipLabel).
const STAMP_ITEMS: StampItem[] = ['distance', 'time', 'pace', 'date', 'place', 'heartRate'];

const PRESETS: { id: RoutePreset; label: string }[] = [
  { id: 'default-drawing', label: '기본 드로잉' },
  { id: 'light-runner', label: '불빛 러너' },
  { id: 'segment-lighting', label: '구간 점등' },
];

const TOOL_PANEL_HEIGHT = 252;

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

  // 도구 탭과 별개로 캔버스를 직접 탭해 조작 대상을 고른다.
  const [stampSheetOpen, setStampSheetOpen] = useState(false);
  const [stampTab, setStampTab] = useState<'layout' | 'items' | 'caption'>('layout');
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
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

  const [transform, setTransformState] = useState<RouteTransform>(draft.transform);
  const transformRef = useRef(transform);
  const updateTransform = (t: RouteTransform) => {
    transformRef.current = t;
    setTransformState(t);
  };

  // §5: 직선(smooth)·코너(corner) 두 축을 드로잉 도구에 함께 보여준다.
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
        // 전체 미리보기와 동일한 contain 변환을 사용해 탭과 이동량을 맞춘다.
        const { fitScale, offsetX, offsetY } = computeFitTransform(
          previewSizeRef.current.width,
          previewSizeRef.current.height,
          'contain'
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

  const sheetExpandedRef = useRef(true);
  const [sheetExpanded, setSheetExpanded] = useState(true);
  const [isSheetDragging, setIsSheetDragging] = useState(false);

  const animateSheetTo = (expanded: boolean) => {
    Keyboard.dismiss();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    sheetExpandedRef.current = expanded;
    setSheetExpanded(expanded);
  };

  // 손잡이만 드래그를 받아 슬라이더 및 항목 스크롤과 경합하지 않는다.
  const sheetPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_evt, gestureState) => Math.abs(gestureState.dy) > 2,
      onPanResponderGrant: () => setIsSheetDragging(true),
      onPanResponderRelease: (_evt, gestureState) => {
        setIsSheetDragging(false);
        if (gestureState.dy > 40) animateSheetTo(false);
      },
      onPanResponderTerminate: () => setIsSheetDragging(false),
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
    const next = fitPortraitPreview(width, height);
    previewSizeRef.current = next;
    setPreviewSize(next);
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
    <KeyboardAvoidingView style={styles.safeArea} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader
          title="편집"
          right={
            <Pressable onPress={handleNext} hitSlop={12} accessibilityRole="button">
              <Text style={styles.headerAction}>완료</Text>
            </Pressable>
          }
        />

        <View style={styles.previewToolbar}>
          <View style={styles.playControls}>
            <Pressable
              onPress={() => setIsPlaying((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel={isPlaying ? '미리보기 정지' : '미리보기 재생'}
              style={[styles.playToggle, isPlaying && styles.playToggleOn]}>
              <Text style={styles.playToggleIcon}>{isPlaying ? '❚❚' : '▶'}</Text>
            </Pressable>
            <Text style={styles.cardHint}>
              {stampTargeted ? '끌기 · 각인 위치 / 두 손가락 · 크기' : '끌기 · 이동 / 두 손가락 · 확대·회전'}
            </Text>
          </View>
          <Pressable
            onPress={() => setShowSafeGuide((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ selected: showSafeGuide }}
            style={[styles.guideToggle, showSafeGuide && styles.guideToggleOn]}>
            <Text style={showSafeGuide ? styles.guideToggleTextOn : styles.guideToggleText}>스토리 영역</Text>
          </Pressable>
        </View>

        <View style={styles.previewArea} onLayout={handlePreviewLayout}>
          {previewSize.width > 0 && (
            <View style={[styles.previewFrame, previewSize]}>
              <Image source={{ uri: draft.backgroundImagePath }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              <View {...panResponder.panHandlers} style={[StyleSheet.absoluteFill, isInteracting && styles.previewActive]}>
                <View pointerEvents="none" style={StyleSheet.absoluteFill}>
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
                    fit="contain"
                    stampSelected={stampTargeted}
                    playing={isPlaying}
                    stampDragOffset={{ x: stampDragX, y: stampDragY }}
                  />
                </View>
              </View>
            </View>
          )}
        </View>

        {sheetExpanded ? (
          <View style={[styles.sheet, { height: keyboardVisible ? 176 : TOOL_PANEL_HEIGHT }]}>
            <View {...sheetPanResponder.panHandlers} style={styles.sheetHandleArea}>
              <View style={styles.sheetHandleBar} />
            </View>
            <View style={styles.toolHeader}>
              <View style={styles.toolTabs}>
                {([false, true] as const).map((isStamp) => (
                  <Pressable
                    key={String(isStamp)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: stampSheetOpen === isStamp }}
                    onPress={() => { Keyboard.dismiss(); setStampSheetOpen(isStamp); }}
                    style={[styles.toolTab, stampSheetOpen === isStamp && styles.toolTabOn]}>
                    <Text style={stampSheetOpen === isStamp ? styles.toolTabTextOn : styles.toolTabText}>
                      {isStamp ? '각인' : '드로잉'}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Pressable onPress={() => animateSheetTo(false)} style={styles.closeTool} accessibilityRole="button">
                <Text style={styles.headerAction}>접기</Text>
              </Pressable>
            </View>

            {!stampSheetOpen ? (
              <View style={styles.sheetContent}>
                <View style={styles.presetRow}>
                  {PRESETS.map((p) => (
                    <Pressable key={p.id} onPress={() => handlePresetSelect(p.id)}
                      accessibilityRole="button" accessibilityState={{ selected: draft.preset === p.id }}
                      style={[styles.presetChip, draft.preset === p.id && styles.presetChipOn]}>
                      <Text style={draft.preset === p.id ? styles.presetChipTextOn : styles.presetChipText}>{p.label}</Text>
                    </Pressable>
                  ))}
                </View>
                <View style={styles.sliderRow}>
                  <Text style={styles.sliderLabel}>직선</Text>
                  <View style={styles.sliderTrack}>
                    <Slider value={smoothOptions.smooth} onChange={(v) => handleSmoothAxisChange('smooth', v)} onSlidingComplete={handleSmoothCommit} />
                  </View>
                  <Text style={styles.sliderValue}>{smoothLabel(smoothOptions.smooth)}</Text>
                </View>
                <View style={styles.sliderRow}>
                  <Text style={styles.sliderLabel}>코너</Text>
                  <View style={styles.sliderTrack}>
                    <Slider value={smoothOptions.corner} onChange={(v) => handleSmoothAxisChange('corner', v)} onSlidingComplete={handleSmoothCommit} />
                  </View>
                  <Text style={styles.sliderValue}>{cornerLabel(smoothOptions.corner)}</Text>
                </View>
                <View style={styles.outlineRow}>
                  <Pressable style={styles.outlineBtn} onPress={() => router.push('/background-selection')} accessibilityRole="button">
                    <Text style={styles.outlineBtnText}>배경 바꾸기</Text>
                  </Pressable>
                  <Pressable style={styles.outlineBtn} onPress={handleReset} accessibilityRole="button">
                    <Text style={styles.outlineBtnMuted}>드로잉 초기화</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <View style={styles.stampContent}>
                <View style={styles.stampTabs}>
                  {([{ id: 'layout', label: '프리셋' }, { id: 'items', label: '넣을 것' }, { id: 'caption', label: '문구' }] as const).map((tab) => (
                    <Pressable key={tab.id} onPress={() => { Keyboard.dismiss(); setStampTab(tab.id); }}
                      accessibilityRole="tab" accessibilityState={{ selected: stampTab === tab.id }}
                      style={styles.stampTab}>
                      <Text style={stampTab === tab.id ? styles.headerAction : styles.toolTabText}>{tab.label}</Text>
                    </Pressable>
                  ))}
                </View>
                <ScrollView key={stampTab} style={styles.stampScroll} contentContainerStyle={styles.stampScrollContent}
                  keyboardShouldPersistTaps="handled">
                  {stampTab === 'layout' && (
                    <View style={styles.layoutChipRow}>
                      {STAMP_LAYOUTS.map((l) => {
                        const on = (stampConfig.layout ?? 'row') === l.id;
                        return (
                          <Pressable key={l.id} onPress={() => handleLayoutSelect(l.id)}
                            accessibilityRole="button" accessibilityState={{ selected: on }}
                            style={[styles.layoutChip, on && styles.presetChipOn]}>
                            <Text style={on ? styles.presetChipTextOn : styles.presetChipText}>{l.label}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  )}
                  {stampTab === 'items' && (
                    <View style={styles.chipRowWrap}>
                      {stampItems.map((item) => {
                        const on = stampConfig.enabled?.[item] ?? false;
                        return (
                          <Pressable key={item} onPress={() => handleStampItemToggle(item)}
                            accessibilityRole="button" accessibilityState={{ selected: on }}
                            style={[styles.itemChip, on && styles.itemChipOn]}>
                            <Text style={on ? styles.itemChipTextOn : styles.itemChipText}>{stampChipLabel(item)}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  )}
                  {stampTab === 'caption' && (
                    <View style={styles.captionGroup}>
                      <Text style={styles.sectionLabel}>한 줄 문구</Text>
                      <TextInput value={stampConfig.caption ?? ''} onChangeText={handleCaptionChange}
                        placeholder="예) 비 오는 날의 한강" placeholderTextColor={Colors.textMuted}
                        accessibilityLabel="각인 한 줄 문구" maxLength={40} style={styles.captionInput}
                        returnKeyType="done" onSubmitEditing={Keyboard.dismiss} />
                      <Text style={styles.note}>입력한 문구가 미리보기에 바로 반영됩니다.</Text>
                    </View>
                  )}
                </ScrollView>
              </View>
            )}
          </View>
        ) : (
          <View style={styles.reopenBar}>
            <Pressable onPress={() => animateSheetTo(true)} style={styles.sheetReopenButton} accessibilityRole="button">
              <Text style={styles.sheetReopenText}>편집 도구 열기</Text>
            </Pressable>
          </View>
        )}
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const CHIP_ON_BG = 'rgba(255,90,43,0.12)';

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  headerAction: { fontFamily: Fonts.sans, fontSize: 12, color: Colors.accent },
  previewToolbar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 4 },
  playControls: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  previewArea: { flex: 1, minHeight: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bg },
  previewFrame: { backgroundColor: Colors.bgCard, overflow: 'hidden', borderRadius: 12 },
  previewActive: { outlineWidth: 1, outlineColor: Colors.accent },
  guideToggle: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 18, borderWidth: 1, borderColor: Colors.borderStrong },
  guideToggleOn: { borderColor: Colors.accent, backgroundColor: CHIP_ON_BG },
  guideToggleText: { fontFamily: Fonts.sans, fontSize: 10, color: Colors.textMuted },
  guideToggleTextOn: { fontFamily: Fonts.sans, fontSize: 10, color: Colors.accent },
  reopenBar: { alignItems: 'center', paddingVertical: 8 },
  sheetReopenButton: { height: 40, justifyContent: 'center', paddingHorizontal: 18, borderRadius: 20, backgroundColor: Colors.accent },
  sheetReopenText: { fontFamily: Fonts.sansBold, fontSize: 12, color: Colors.accentText },
  cardHint: { flex: 1, fontFamily: Fonts.sans, fontSize: 10, lineHeight: 15, color: Colors.textMuted },
  playToggle: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.borderStrong },
  playToggleOn: { borderColor: Colors.accent, backgroundColor: CHIP_ON_BG },
  playToggleIcon: { fontSize: 12, color: Colors.text },
  sectionLabel: { fontFamily: Fonts.sans, fontSize: 11, color: Colors.textMuted },
  presetRow: { flexDirection: 'row', gap: 8 },
  chipRowWrap: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  captionGroup: { gap: 8 },
  captionInput: { fontFamily: Fonts.sans, fontSize: 15, color: Colors.text, borderBottomWidth: 1, borderBottomColor: Colors.borderStrong, paddingVertical: 8 },
  presetChip: { flex: 1, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.border },
  presetChipOn: { backgroundColor: Colors.accent },
  presetChipText: { fontFamily: Fonts.sans, fontSize: 12, color: Colors.textMuted },
  presetChipTextOn: { fontFamily: Fonts.sans, fontSize: 12, color: Colors.accentText },
  layoutChipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  layoutChip: { minHeight: 40, paddingHorizontal: 16, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.border },
  sliderRow: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 36 },
  sliderLabel: { width: 30, fontFamily: Fonts.sans, fontSize: 12, color: Colors.textMuted },
  sliderTrack: { flex: 1 },
  sliderValue: { width: 46, textAlign: 'right', fontFamily: Fonts.sans, fontSize: 12, color: Colors.accent },
  itemChip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 19, borderWidth: 1, borderColor: Colors.borderStrong },
  itemChipOn: { borderColor: Colors.accent, backgroundColor: CHIP_ON_BG },
  itemChipText: { fontFamily: Fonts.sans, fontSize: 12, color: Colors.textMuted },
  itemChipTextOn: { fontFamily: Fonts.sansBold, fontSize: 12, color: Colors.accent },
  outlineRow: { flexDirection: 'row', gap: 8 },
  outlineBtn: { flex: 1, height: 36, borderRadius: 18, borderWidth: 1, borderColor: Colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  outlineBtnText: { fontFamily: Fonts.sans, fontSize: 12, color: Colors.text },
  outlineBtnMuted: { fontFamily: Fonts.sans, fontSize: 12, color: Colors.textMuted },
  note: { fontFamily: Fonts.sans, fontSize: 11, lineHeight: 17, color: Colors.textMuted },
  hint: { fontFamily: Fonts.sans, color: Colors.textMuted, fontSize: 11 },
  sheet: { flexShrink: 0, backgroundColor: Colors.bgCard, borderTopLeftRadius: Radius.pill, borderTopRightRadius: Radius.pill, borderTopWidth: 1, borderColor: Colors.border },
  sheetHandleArea: { alignItems: 'center', paddingTop: 8, paddingBottom: 4 },
  sheetHandleBar: { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.borderStrong },
  toolHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 8 },
  toolTabs: { flexDirection: 'row', gap: 16 },
  toolTab: { minHeight: 36, justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  toolTabOn: { borderBottomColor: Colors.accent },
  toolTabText: { fontFamily: Fonts.sans, fontSize: 12, color: Colors.textMuted },
  toolTabTextOn: { fontFamily: Fonts.sansBold, fontSize: 12, color: Colors.text },
  closeTool: { minHeight: 36, justifyContent: 'center', paddingLeft: 16 },
  sheetContent: { paddingHorizontal: 20, gap: 8 },
  stampContent: { flex: 1 },
  stampTabs: { flexDirection: 'row', paddingHorizontal: 20, gap: 24 },
  stampTab: { minHeight: 32, justifyContent: 'center' },
  stampScroll: { flex: 1 },
  stampScrollContent: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
});
