import * as Location from 'expo-location';
import { router } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useEffect, useRef, useState } from 'react';
import { useSharedValue } from 'react-native-reanimated';
import {
  Alert,
  Image,
  Keyboard,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type PanResponderGestureState,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { CroppedBackgroundVideo } from '@/components/background-video';
import {
  computeCaptionHitRect,
  computeFitTransform,
  computeStampHitRects,
  IDENTITY_TRANSFORM,
  RoutePreview,
  STAMP_LAYOUTS,
  type CanvasRect,
  type RoutePreset,
  type RouteTransform,
  type StampConfig,
  type StampItem,
  type StampLayout,
} from '@/components/route-preview';
import { ScreenHeader } from '@/components/screen-header';
import { Slider } from '@/components/slider';
import { ThemedButton } from '@/components/ui';
import { VerticalSlider } from '@/components/vertical-slider';
import { DEFAULT_BACKGROUNDS, type DefaultBackground } from '@/constants/default-backgrounds';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { isVideoBackground, persistDefaultBackground } from '@/lib/background-storage';
import { CAPTION_MAX_LINES, captionLines, limitCaptionInput } from '@/lib/caption-layout';
import { saveDraft } from '@/lib/draft-store';
import { isCaptionOnlyChange, pushHistory, type EditSnapshot } from '@/lib/edit-history';
import { fitPortraitPreview } from '@/lib/preview-layout';
import type { SmoothOptions } from '@/lib/route-smoothing';
import { captionPlacement, withCaptionPlacement } from '@/lib/stamp-caption';
import {
  formatDistanceKm,
  formatDuration,
  formatHeartRate,
  formatPace,
  formatStampDate,
} from '@/lib/stamp-format';
import { rememberStampLayout } from '@/lib/stamp-preference';
import { useCreationFlow } from '@/state/creation-flow';

// FRD: docs/specs/frd/result-editing.md (2026-10-04 스토리형 편집 개정)
// §1 화면 구조: 평소에는 화면 전체가 결과물이고, 오른쪽 도구를 누를 때만 시트가 올라온다.
// §4-1 손댄 것을 만진다: 문구 > 러닝 데이터 > 경로 그림 순으로 잡는다.
// §4-3 되돌리기와 초기화, §7-2 끌어서 숨기기. 구현 노트: docs/product/features/story-editor-stage1.md

// 시안 S6 "넣을 것" 순서. 칩에는 실제 값도 함께 보여준다(stampChipLabel).
const STAMP_ITEMS: StampItem[] = ['distance', 'time', 'pace', 'date', 'place', 'heartRate'];

const PRESETS: { id: RoutePreset; label: string }[] = [
  { id: 'default-drawing', label: '기본 경로 그림' },
  { id: 'light-runner', label: '불빛 러너' },
  { id: 'segment-lighting', label: '구간 점등' },
];

type Tool = 'background' | 'route' | 'stamp' | 'caption';
// 1단계는 넷만 둔다. 그리기·내 스타일은 3단계에서 만들 때 버튼도 같이 넣는다.
const TOOLS: { id: Tool; label: string; symbol: SymbolViewProps['name'] }[] = [
  { id: 'background', label: '배경', symbol: 'photo' },
  { id: 'route', label: '경로', symbol: 'scribble' },
  { id: 'stamp', label: '러닝 데이터', symbol: 'number' },
  { id: 'caption', label: '문구', symbol: 'textformat' },
];

type DragTarget = 'route' | 'stamp' | 'caption';
// 크기 슬라이더 범위(%). 1/3배~3배로 대칭이라 기본 크기(100%)가 슬라이더 가운데에 온다.
// 러닝 데이터·문구는 핀치도 같은 범위다. 경로 그림은 FRD가 상한을 두지 않아(§4-4) 핀치로는
// 더 키울 수 있다.
const SIZE_MIN = 100 / 3;
const SIZE_MAX = 300;

// §2 미리보기: 평소에 반복 재생한다. 2026-09-02에는 반복 재생 중 조작이 느려서 멈춰 두고
// 재생 버튼을 눌러야 그렸다. 실기기에서 다시 느려지면 false로 두고 재생 버튼을 되살린다.
const LOOP_PREVIEW = true;

// §7-2 숨기기 자리. 러닝 데이터를 끄는 동안 화면 아래에 나타난다.
const HIDE_ZONE = 60;
const BOTTOM_BAR_HEIGHT = 64;

function touchDistance(t1: { pageX: number; pageY: number }, t2: { pageX: number; pageY: number }) {
  return Math.hypot(t2.pageX - t1.pageX, t2.pageY - t1.pageY);
}

function touchAngleDeg(t1: { pageX: number; pageY: number }, t2: { pageX: number; pageY: number }) {
  return (Math.atan2(t2.pageY - t1.pageY, t2.pageX - t1.pageX) * 180) / Math.PI;
}

const contains = (rect: CanvasRect, x: number, y: number) =>
  x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
const clampScale = (value: number) => Math.min(SIZE_MAX / 100, Math.max(SIZE_MIN / 100, value));

export default function EditScreen() {
  const {
    draft,
    setPreset: commitPreset,
    setTransform: commitTransform,
    setSmoothOptions: commitSmoothOptions,
    setStampConfig: commitStampConfig,
    setBackground,
    loadDraft,
    resetTransform,
  } = useCreationFlow();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();

  const [tool, setTool] = useState<Tool | null>(null);
  const toolRef = useRef<Tool | null>(null);
  const [stampTab, setStampTab] = useState<'layout' | 'items'>('layout');
  const [captionLimited, setCaptionLimited] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [sheetHeight, setSheetHeight] = useState(0);
  const [applyingBackground, setApplyingBackground] = useState<string | null>(null);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => setKeyboardHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);

  const [transform, setTransformState] = useState<RouteTransform>(draft.transform);
  const transformRef = useRef(transform);
  const updateTransform = (t: RouteTransform) => {
    transformRef.current = t;
    setTransformState(t);
  };

  // §5: 직선(smooth)·코너(corner) 두 축을 경로 시트에 함께 보여준다.
  const [smoothOptions, setSmoothOptionsState] = useState<SmoothOptions>(draft.smoothOptions);
  const smoothOptionsRef = useRef(smoothOptions);
  const updateSmoothOptions = (opts: SmoothOptions) => {
    smoothOptionsRef.current = opts;
    setSmoothOptionsState(opts);
  };
  // applySmoothing(route-smoothing.ts)은 원본 GPS 점 전체에 매번 다시 돈다 — 실기기
  // 피드백(2026-09): 슬라이더를 끄는 raw 터치 이벤트마다 불려서 버벅였다. 최신값은 ref에
  // 바로 반영하고 실제 재계산(state 갱신 → useMemo)은 화면 프레임당 한 번으로 묶는다.
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

  // §7: 러닝 데이터 묶음과 문구. 문구는 따로 움직인다(lib/stamp-caption.ts). 옛 저장분은
  // 들어올 때 문구 자리를 지금 자리로 고정해, 러닝 데이터를 옮겨도 문구가 따라가지 않게 한다.
  const [stampConfig, setStampConfigState] = useState<StampConfig>(() => withCaptionPlacement(draft.stampConfig));
  const stampConfigRef = useRef(stampConfig);
  const updateStampConfig = (c: StampConfig) => {
    stampConfigRef.current = c;
    setStampConfigState(c);
  };
  const commitStamp = (next: StampConfig) => {
    updateStampConfig(next);
    commitStampConfig(next);
  };
  const handleStampItemToggle = (item: StampItem) => {
    const current = stampConfigRef.current;
    commitStamp({ ...current, enabled: { ...current.enabled, [item]: !current.enabled[item] } });
  };
  const handleCaptionChange = (text: string) => {
    const constrained = limitCaptionInput(text, stampConfigRef.current.caption ?? '', stampConfigRef.current);
    setCaptionLimited(constrained.limited);
    commitStamp({ ...stampConfigRef.current, caption: constrained.text });
  };
  const handleLayoutSelect = (layout: StampLayout) => {
    rememberStampLayout(layout);
    commitStamp({ ...stampConfigRef.current, layout });
  };
  // §7: 화면에서 러닝 데이터를 탭하면 다음 프리셋으로. 마지막 다음은 처음이다.
  const cycleStampLayout = () => {
    const index = STAMP_LAYOUTS.findIndex((l) => l.id === (stampConfigRef.current.layout ?? 'row'));
    handleLayoutSelect(STAMP_LAYOUTS[(index + 1) % STAMP_LAYOUTS.length].id);
  };
  // §4-3 초기화: 되돌리는 단위는 그 도구의 대상뿐이다. 켠 항목·프리셋·문구는 그대로 둔다.
  const handleStampReset = () => {
    commitStamp({ ...stampConfigRef.current, position: { x: 0, y: 0 }, scale: 1 });
  };
  const handleRouteReset = () => {
    updateTransform(IDENTITY_TRANSFORM);
    resetTransform();
  };

  // §4-3 되돌리기. 초안이 바뀔 때마다(값을 확정할 때마다) 바뀌기 전 모습을 한 단계로 쌓는다.
  const [history, setHistory] = useState<EditSnapshot[]>([]);
  const lastSnapshotRef = useRef<EditSnapshot | null>(null);
  // 되돌리기 자체와 장소 이름 채우기처럼 사용자가 한 편집이 아닌 변화는 쌓지 않는다.
  const skipHistoryRef = useRef(false);
  // 문구 시트를 연 동안 글자 입력은 한 단계로 묶는다. 한 글자마다 쌓이면 되돌리기가 의미 없다.
  const captionSessionRef = useRef<'closed' | 'open' | 'pushed'>('closed');
  useEffect(() => {
    const current: EditSnapshot = {
      backgroundImagePath: draft.backgroundImagePath,
      backgroundPhoto: draft.backgroundPhoto,
      preset: draft.preset,
      transform: draft.transform,
      smoothOptions: draft.smoothOptions,
      stampConfig: draft.stampConfig,
    };
    const previous = lastSnapshotRef.current;
    lastSnapshotRef.current = current;
    if (!previous) return;
    if (skipHistoryRef.current) {
      skipHistoryRef.current = false;
      return;
    }
    if (isCaptionOnlyChange(previous, current)) {
      if (captionSessionRef.current === 'pushed') return;
      if (captionSessionRef.current === 'open') captionSessionRef.current = 'pushed';
    } else if (captionSessionRef.current === 'pushed') {
      // 입력 사이에 문구를 옮기는 등 다른 편집을 했으면, 그 뒤의 입력은 새 단계로 쌓는다.
      captionSessionRef.current = 'open';
    }
    setHistory((h) => pushHistory(h, previous));
  }, [draft.backgroundImagePath, draft.backgroundPhoto, draft.preset, draft.transform, draft.smoothOptions, draft.stampConfig]);

  // '장소' 러닝 데이터 값 — 트랙 좌표(가운데 점)를 역지오코딩해 한 번 채운다. 실패하면 비워 둔다.
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
        skipHistoryRef.current = true;
        commitStamp({ ...stampConfigRef.current, placeName: name });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // 트랙이 바뀔 때만 한 번 — commit/update는 안정적이지 않아 넣으면 매 편집마다 재지오코딩된다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.track]);

  const [isInteracting, setIsInteracting] = useState(false);
  // 끄는 중인 대상. 손가락이 실제로 움직였을 때만 정한다. 탭할 때 점선이 깜빡이지 않게 한다.
  const [dragging, setDragging] = useState<DragTarget | null>(null);
  const [overHideZone, setOverHideZone] = useState(false);
  const overHideZoneRef = useRef(false);

  // 실기기 피드백(2026-09-02): "경로 이동이 뚝뚝 끊긴다" — 끄는 동안은 React state가 아니라
  // SharedValue에 바로 쓰고(RoutePreview가 UI 스레드에서 읽는다) 손을 뗄 때만 커밋한다.
  const baseTransform = useRef<RouteTransform>(transform);
  const transformXShared = useSharedValue(transform.x);
  const transformYShared = useSharedValue(transform.y);
  const transformScaleShared = useSharedValue(transform.scale);
  const transformRotationShared = useSharedValue(transform.rotationDeg);
  useEffect(() => {
    transformXShared.value = transform.x;
    transformYShared.value = transform.y;
    transformScaleShared.value = transform.scale;
    transformRotationShared.value = transform.rotationDeg;
  }, [transform, transformXShared, transformYShared, transformScaleShared, transformRotationShared]);
  // 러닝 데이터와 문구도 같은 방식이다. 드래그와 저장 후 표시가 같은 절대 위치를 쓴다.
  const baseStampPosition = useRef(stampConfig.position);
  const baseStampScale = useRef(stampConfig.scale ?? 1);
  const stampPositionX = useSharedValue(stampConfig.position.x);
  const stampPositionY = useSharedValue(stampConfig.position.y);
  useEffect(() => {
    stampPositionX.set(stampConfig.position.x);
    stampPositionY.set(stampConfig.position.y);
  }, [stampConfig.position, stampPositionX, stampPositionY]);
  const initialCaption = captionPlacement(stampConfig);
  const baseCaptionPosition = useRef(initialCaption.offset);
  const baseCaptionScale = useRef(initialCaption.scale);
  const captionPositionX = useSharedValue(initialCaption.offset.x);
  const captionPositionY = useSharedValue(initialCaption.offset.y);
  const captionOffset = captionPlacement(stampConfig).offset;
  useEffect(() => {
    captionPositionX.set(captionOffset.x);
    captionPositionY.set(captionOffset.y);
  }, [captionOffset, captionPositionX, captionPositionY]);

  const gestureStart = useRef<{ distance: number; angle: number } | null>(null);
  // 실기기 피드백(2026-09-02): 핀치 중 손가락 이동마다 state를 바꾸면 RoutePreview가 매번
  // 다시 렌더된다. 다듬기 슬라이더와 같은 방식(ref 즉시, state는 프레임당 한 번)으로 묶는다.
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
    stampConfigRef.current = next;
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
  const finishStampGesture = () => {
    flushPendingStampConfig();
    commitStamp({ ...stampConfigRef.current, position: { x: stampPositionX.value, y: stampPositionY.value } });
  };
  const finishCaptionGesture = () => {
    flushPendingStampConfig();
    commitStamp({ ...stampConfigRef.current, captionOffset: { x: captionPositionX.value, y: captionPositionY.value } });
  };
  // §7-2: 숨기기 자리에 놓으면 숨긴다. 숨기기 전 자리는 그대로 둔다. 다시 열면 그 자리로 돌아온다.
  const hideStamp = () => {
    flushPendingStampConfig();
    const position = baseStampPosition.current;
    stampPositionX.set(position.x);
    stampPositionY.set(position.y);
    commitStamp({ ...stampConfigRef.current, position, hidden: true });
  };

  // panResponder는 첫 렌더에서 한 번 만들어져 클로저가 고정되므로 바뀌는 값은 ref로 읽는다.
  const selectedRunRef = useRef(draft.selectedRun);
  useEffect(() => { selectedRunRef.current = draft.selectedRun; }, [draft.selectedRun]);
  const [previewSize, setPreviewSize] = useState({ width: 0, height: 0 });
  const previewSizeRef = useRef(previewSize);
  const gestureFitScaleRef = useRef(1);
  const dragTargetRef = useRef<DragTarget>('route');
  const gestureMovedRef = useRef(false);

  // §4-1: 겹친 곳은 문구 > 러닝 데이터 > 경로 그림 순으로 잡는다. 글자가 아닌 곳은 전부 경로 그림이다.
  const hitTarget = (canvasX: number, canvasY: number): DragTarget => {
    const run = selectedRunRef.current;
    const config = stampConfigRef.current;
    if (!run) return 'route';
    const caption = computeCaptionHitRect(run, config);
    if (caption && contains(caption, canvasX, canvasY)) return 'caption';
    if (!config.hidden && computeStampHitRects(run, config).some((rect) => contains(rect, canvasX, canvasY))) return 'stamp';
    return 'route';
  };

  // 숨기기 자리의 화면 좌표. 시트가 열려 있으면 시트 위에 놓는다.
  const hideZoneBottom = tool ? sheetHeight + keyboardHeight + 12 : insets.bottom + BOTTOM_BAR_HEIGHT + 8;
  const hideZoneCenterRef = useRef({ x: 0, y: 0 });
  useEffect(() => {
    hideZoneCenterRef.current = { x: window.width / 2, y: window.height - hideZoneBottom - HIDE_ZONE / 2 };
  }, [window.width, window.height, hideZoneBottom]);
  const isOverHideZone = (touch: { pageX: number; pageY: number }) => {
    const center = hideZoneCenterRef.current;
    return Math.hypot(touch.pageX - center.x, touch.pageY - center.y) < HIDE_ZONE;
  };

  const openTool = (next: Tool) => {
    if (next !== 'caption') Keyboard.dismiss();
    flushPendingSmooth();
    flushPendingStampConfig();
    // §7-2: 숨긴 러닝 데이터는 러닝 데이터 도구를 다시 열면 돌아온다.
    if (next === 'stamp' && stampConfigRef.current.hidden) commitStamp({ ...stampConfigRef.current, hidden: false });
    captionSessionRef.current = next === 'caption' ? 'open' : 'closed';
    toolRef.current = next;
    setTool(next);
  };
  const closeTool = () => {
    Keyboard.dismiss();
    captionSessionRef.current = 'closed';
    toolRef.current = null;
    setTool(null);
  };
  const handleTap = (target: DragTarget) => {
    if (target === 'caption') openTool('caption');
    else if (target === 'stamp') cycleStampLayout();
    else if (toolRef.current) closeTool();
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt: GestureResponderEvent) => {
        setIsInteracting(true);
        const { fitScale, offsetX, offsetY } = computeFitTransform(
          previewSizeRef.current.width, previewSizeRef.current.height, 'contain');
        gestureFitScaleRef.current = fitScale;
        const touch = evt.nativeEvent.touches[0] ?? evt.nativeEvent;
        const target = hitTarget((touch.locationX - offsetX) / fitScale, (touch.locationY - offsetY) / fitScale);
        dragTargetRef.current = target;
        gestureMovedRef.current = evt.nativeEvent.touches.length > 1;

        const config = stampConfigRef.current;
        if (target === 'stamp') {
          baseStampPosition.current = config.position;
          baseStampScale.current = config.scale ?? 1;
          stampPositionX.set(config.position.x);
          stampPositionY.set(config.position.y);
        } else if (target === 'caption') {
          const caption = captionPlacement(config);
          baseCaptionPosition.current = caption.offset;
          baseCaptionScale.current = caption.scale;
          captionPositionX.set(caption.offset.x);
          captionPositionY.set(caption.offset.y);
        } else {
          baseTransform.current = transformRef.current;
          transformXShared.value = baseTransform.current.x;
          transformYShared.value = baseTransform.current.y;
          transformScaleShared.value = baseTransform.current.scale;
          transformRotationShared.value = baseTransform.current.rotationDeg;
        }
        const touches = evt.nativeEvent.touches;
        gestureStart.current = touches.length === 2
          ? { distance: touchDistance(touches[0], touches[1]), angle: touchAngleDeg(touches[0], touches[1]) }
          : null;
        if (gestureMovedRef.current) setDragging(target);
      },
      onPanResponderMove: (evt: GestureResponderEvent, gestureState: PanResponderGestureState) => {
        const touches = evt.nativeEvent.touches;
        if (!gestureMovedRef.current && (touches.length > 1 || Math.abs(gestureState.dx) >= 6 || Math.abs(gestureState.dy) >= 6)) {
          gestureMovedRef.current = true;
          setDragging(dragTargetRef.current);
        }
        if (!gestureMovedRef.current) return;
        const target = dragTargetRef.current;
        const fitScale = gestureFitScaleRef.current;
        if (touches.length === 2 && !gestureStart.current) {
          gestureStart.current = { distance: touchDistance(touches[0], touches[1]), angle: touchAngleDeg(touches[0], touches[1]) };
        }
        const scaleDelta = touches.length === 2 && gestureStart.current
          ? touchDistance(touches[0], touches[1]) / (gestureStart.current.distance || 1) : 1;

        if (target === 'stamp' || target === 'caption') {
          const isStamp = target === 'stamp';
          const base = isStamp ? baseStampPosition.current : baseCaptionPosition.current;
          (isStamp ? stampPositionX : captionPositionX).set(base.x + gestureState.dx / fitScale);
          (isStamp ? stampPositionY : captionPositionY).set(base.y + gestureState.dy / fitScale);
          if (touches.length === 2) {
            const config = stampConfigRef.current;
            scheduleStampConfigUpdate(isStamp
              ? { ...config, scale: clampScale(baseStampScale.current * scaleDelta) }
              : { ...config, captionScale: clampScale(baseCaptionScale.current * scaleDelta) });
          } else if (isStamp && touches[0]) {
            const over = isOverHideZone(touches[0]);
            if (over !== overHideZoneRef.current) {
              overHideZoneRef.current = over;
              setOverHideZone(over);
            }
          }
          return;
        }
        // dx/dy는 뷰 픽셀, transform.x/y는 캔버스 좌표라 fitScale로 나눠야 미리보기와 커밋 위치가 맞는다.
        transformXShared.value = baseTransform.current.x + gestureState.dx / fitScale;
        transformYShared.value = baseTransform.current.y + gestureState.dy / fitScale;
        if (touches.length === 2 && gestureStart.current) {
          transformScaleShared.value = Math.max(0.3, baseTransform.current.scale * scaleDelta);
          transformRotationShared.value = baseTransform.current.rotationDeg
            + touchAngleDeg(touches[0], touches[1]) - gestureStart.current.angle;
        }
      },
      onPanResponderRelease: () => {
        const wasPinching = gestureStart.current !== null;
        const over = overHideZoneRef.current;
        endGesture();
        const target = dragTargetRef.current;
        if (!gestureMovedRef.current && !wasPinching) {
          handleTap(target);
          return;
        }
        commitGesture(target, over);
      },
      onPanResponderTerminate: () => {
        endGesture();
        if (gestureMovedRef.current) commitGesture(dragTargetRef.current, false);
      },
    })
  ).current;

  function endGesture() {
    setIsInteracting(false);
    setDragging(null);
    gestureStart.current = null;
    overHideZoneRef.current = false;
    setOverHideZone(false);
  }
  function commitGesture(target: DragTarget, overHide: boolean) {
    if (target === 'stamp') {
      if (overHide) hideStamp();
      else finishStampGesture();
    } else if (target === 'caption') {
      finishCaptionGesture();
    } else {
      const finalTransform: RouteTransform = {
        x: transformXShared.value,
        y: transformYShared.value,
        scale: transformScaleShared.value,
        rotationDeg: transformRotationShared.value,
      };
      updateTransform(finalTransform);
      commitTransform(finalTransform);
    }
  }

  // §4-2: 시트를 열면 왼쪽에 크기 슬라이더가 나온다. 핀치와 같은 값을 쓴다.
  const sizeTarget: DragTarget | null = tool === 'route' || tool === 'stamp' || tool === 'caption' ? tool : null;
  const [sizeDraft, setSizeDraft] = useState<number | null>(null);
  const committedSize = sizeTarget === 'route' ? Math.round(transform.scale * 100)
    : sizeTarget === 'stamp' ? Math.round((stampConfig.scale ?? 1) * 100)
      : Math.round(captionPlacement(stampConfig).scale * 100);
  const handleSizeChange = (percent: number) => {
    if (!sizeTarget) return;
    if (sizeDraft === null) setIsInteracting(true);
    setSizeDraft(percent);
    const scale = percent / 100;
    if (sizeTarget === 'route') transformScaleShared.value = scale;
    else scheduleStampConfigUpdate(sizeTarget === 'stamp'
      ? { ...stampConfigRef.current, scale } : { ...stampConfigRef.current, captionScale: scale });
  };
  const handleSizeCommit = (percent: number) => {
    setIsInteracting(false);
    setSizeDraft(null);
    const scale = percent / 100;
    if (sizeTarget === 'route') {
      const next = { ...transformRef.current, scale };
      updateTransform(next);
      commitTransform(next);
    } else if (sizeTarget) {
      flushPendingStampConfig();
      commitStamp(sizeTarget === 'stamp' ? { ...stampConfigRef.current, scale } : { ...stampConfigRef.current, captionScale: scale });
    }
  };

  // 홈과 보관함 FRD §3-1: "이어서 만들기"에 올라오는 건 마지막으로 편집한 것. 값이 바뀔 때마다
  // 초안을 저장한다. 완성되면 share.tsx에서 지운다. 그래서 나가기는 확인 없이 홈으로 간다(§1).
  useEffect(() => {
    if (!draft.selectedRun || !draft.track || !draft.backgroundImagePath) return;
    saveDraft({
      run: draft.selectedRun,
      track: draft.track,
      backgroundImagePath: draft.backgroundImagePath,
      backgroundPhoto: draft.backgroundPhoto,
      preset: draft.preset,
      transform: draft.transform,
      smoothOptions: draft.smoothOptions,
      stampConfig: draft.stampConfig,
    });
  }, [
    draft.selectedRun,
    draft.track,
    draft.backgroundImagePath,
    draft.backgroundPhoto,
    draft.preset,
    draft.transform,
    draft.smoothOptions,
    draft.stampConfig,
  ]);

  const commitAll = () => {
    Keyboard.dismiss();
    flushPendingSmooth();
    flushPendingStampConfig();
    commitTransform(transformRef.current);
    commitSmoothOptions(smoothOptionsRef.current);
    commitStampConfig(stampConfigRef.current);
  };
  const handleDone = () => {
    commitAll();
    router.push('/share');
  };
  const handleClose = () => {
    commitAll();
    if (router.canDismiss()) router.dismissAll();
    else router.replace('/');
  };
  const handleUndo = () => {
    const previous = history[history.length - 1];
    if (!previous) return;
    Keyboard.dismiss();
    flushPendingSmooth();
    flushPendingStampConfig();
    skipHistoryRef.current = true;
    setHistory((h) => h.slice(0, -1));
    updateTransform(previous.transform);
    updateSmoothOptions(previous.smoothOptions);
    updateStampConfig(withCaptionPlacement(previous.stampConfig));
    loadDraft(previous);
  };

  const handlePresetSelect = (preset: RoutePreset) => commitPreset(preset);

  const applyDefaultBackground = async (background: DefaultBackground) => {
    if (applyingBackground) return;
    setApplyingBackground(background.id);
    try {
      setBackground(await persistDefaultBackground(background), undefined);
    } catch {
      Alert.alert('배경을 바꾸지 못했어요', '다시 시도해 주세요.');
    } finally {
      setApplyingBackground(null);
    }
  };
  // §1: 갤러리·카메라는 배경 선택 화면에서 구도를 잡고 돌아온다.
  const openBackgroundPicker = (pick: 'gallery' | 'camera') => {
    closeTool();
    router.push({ pathname: '/background-selection', params: { returnTo: 'edit', pick } });
  };

  const handlePreviewLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    const next = fitPortraitPreview(width, height);
    previewSizeRef.current = next;
    setPreviewSize(next);
  };

  if (!draft.track || !draft.backgroundImagePath || !draft.selectedRun) {
    return (
      <SafeAreaView style={styles.root}>
        <ScreenHeader title="편집" />
        <View style={styles.center}>
          <Text style={styles.hint}>기록이나 배경이 아직 안 골라졌어요.</Text>
          <ThemedButton title="처음으로" onPress={() => router.replace('/')} />
        </View>
      </SafeAreaView>
    );
  }

  const run = draft.selectedRun;
  const captionLineCount = captionLines(stampConfig.caption ?? '', stampConfig).length;
  const stampItems = STAMP_ITEMS.filter((item) => item !== 'heartRate' || run.averageHeartRate !== undefined);
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
  const showChrome = dragging === null;
  const selectionFor = (target: DragTarget) => dragging ? dragging === target : tool === target;
  const sizeLabel = sizeTarget === 'route' ? '경로 그림 크기' : sizeTarget === 'stamp' ? '러닝 데이터 크기' : '문구 크기';
  const resetChip = (label: string, onPress: () => void) => (
    <Pressable onPress={onPress} style={styles.resetButton} accessibilityRole="button" accessibilityLabel={label}>
      {({ pressed }) => (
        <View style={[styles.resetChip, pressed && styles.resetChipPressed]}>
          <SymbolView name="arrow.counterclockwise" size={11} tintColor={Colors.textMuted} />
          <Text style={styles.resetText}>초기화</Text>
        </View>
      )}
    </Pressable>
  );

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <View style={styles.stage} onLayout={handlePreviewLayout}>
          {previewSize.width > 0 && (
            <View style={[styles.previewFrame, previewSize]}>
              {isVideoBackground(draft.backgroundPhoto)
                ? <CroppedBackgroundVideo video={draft.backgroundPhoto} width={previewSize.width} height={previewSize.height} />
                : <Image source={{ uri: draft.backgroundImagePath }} style={StyleSheet.absoluteFill} resizeMode="cover" />}
              <View {...panResponder.panHandlers} style={StyleSheet.absoluteFill}
                accessibilityLabel="결과물 미리보기. 끌어서 옮기고 두 손가락으로 크기를 바꿔요">
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
                    isInteracting={isInteracting}
                    viewWidth={previewSize.width}
                    viewHeight={previewSize.height}
                    fit="contain"
                    drawingSelected={selectionFor('route')}
                    stampSelected={selectionFor('stamp') && !stampConfig.hidden}
                    captionSelected={selectionFor('caption')}
                    playing={LOOP_PREVIEW}
                    stampPositionShared={{ x: stampPositionX, y: stampPositionY }}
                    captionPositionShared={{ x: captionPositionX, y: captionPositionY }}
                  />
                </View>
              </View>

              {showChrome && <View style={styles.topLeft} pointerEvents="box-none">
                <Pressable onPress={handleClose} style={styles.roundButton} accessibilityRole="button" accessibilityLabel="편집 나가기">
                  <SymbolView name="xmark" size={15} tintColor={Colors.text} />
                </Pressable>
                <Pressable onPress={handleUndo} disabled={history.length === 0}
                  style={[styles.roundButton, history.length === 0 && styles.disabled]}
                  accessibilityRole="button" accessibilityLabel="되돌리기" accessibilityState={{ disabled: history.length === 0 }}>
                  <SymbolView name="arrow.uturn.backward" size={15} tintColor={Colors.text} />
                </Pressable>
              </View>}

              {showChrome && <View style={styles.toolRail} pointerEvents="box-none">
                {TOOLS.map((t) => {
                  const on = tool === t.id;
                  return (
                    <Pressable key={t.id} onPress={() => on ? closeTool() : openTool(t.id)} style={styles.toolButton}
                      accessibilityRole="button" accessibilityLabel={t.label} accessibilityState={{ selected: on }}>
                      <Text style={styles.toolLabel}>{t.label}</Text>
                      <View style={[styles.toolIcon, on && styles.toolIconOn]}>
                        <SymbolView name={t.symbol} size={16} tintColor={on ? Colors.accentText : Colors.text} />
                      </View>
                    </Pressable>
                  );
                })}
              </View>}

              {sizeTarget && <View style={styles.sizeSlider}>
                <VerticalSlider value={sizeDraft ?? committedSize}
                  minimumValue={SIZE_MIN} maximumValue={SIZE_MAX}
                  accessibilityLabel={sizeLabel} onChange={handleSizeChange} onSlidingComplete={handleSizeCommit} />
              </View>}
            </View>
          )}
        </View>
        <View style={styles.bottomBar}>
          <Pressable onPress={handleDone} style={styles.doneButton} accessibilityRole="button" accessibilityLabel="편집 완료하고 공유로">
            <Text style={styles.doneText}>완료</Text>
          </Pressable>
        </View>
      </SafeAreaView>

      {dragging === 'stamp' && <View pointerEvents="none"
        style={[styles.hideZone, overHideZone && styles.hideZoneOn, { bottom: hideZoneBottom, left: window.width / 2 - HIDE_ZONE / 2 }]}
        accessibilityLabel="여기에 놓으면 러닝 데이터를 숨겨요">
        <SymbolView name="eye.slash" size={20} tintColor={overHideZone ? Colors.accentText : Colors.text} />
      </View>}

      {tool && <View style={[styles.sheet, { bottom: keyboardHeight, paddingBottom: keyboardHeight > 0 ? Spacing.sm : insets.bottom + Spacing.sm }]}
        onLayout={(e) => setSheetHeight(e.nativeEvent.layout.height)}>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>{TOOLS.find((t) => t.id === tool)?.label}</Text>
          <View style={styles.sheetHeaderRight}>
            {tool === 'route' && resetChip('경로 초기화', handleRouteReset)}
            {tool === 'stamp' && resetChip('러닝 데이터 초기화', handleStampReset)}
            <Pressable onPress={closeTool} hitSlop={12} accessibilityRole="button" accessibilityLabel={`${TOOLS.find((t) => t.id === tool)?.label} 닫기`}>
              <Text style={styles.sheetDone}>완료</Text>
            </Pressable>
          </View>
        </View>

        {tool === 'background' && <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.backgroundRow}>
            {DEFAULT_BACKGROUNDS.map((bg) => {
              const on = !draft.backgroundPhoto && !!draft.backgroundImagePath?.endsWith(`/${bg.id}.jpg`);
              return (
                <Pressable key={bg.id} onPress={() => { void applyDefaultBackground(bg); }} disabled={!!applyingBackground}
                  style={[styles.backgroundSwatch, on && styles.backgroundSwatchOn]}
                  accessibilityRole="button" accessibilityLabel={`기본 배경 ${bg.label}`} accessibilityState={{ selected: on }}>
                  <Image source={bg.source} style={styles.backgroundImage} />
                  <Text style={styles.backgroundLabel}>{applyingBackground === bg.id ? '바꾸는 중' : bg.label}</Text>
                </Pressable>
              );
            })}
            <Pressable onPress={() => openBackgroundPicker('gallery')} style={[styles.backgroundSwatch, styles.backgroundSource]}
              accessibilityRole="button" accessibilityLabel="갤러리에서 고르기">
              <SymbolView name="photo.on.rectangle" size={20} tintColor={Colors.text} />
              <Text style={styles.backgroundLabel}>갤러리</Text>
            </Pressable>
            <Pressable onPress={() => openBackgroundPicker('camera')} style={[styles.backgroundSwatch, styles.backgroundSource]}
              accessibilityRole="button" accessibilityLabel="사진 찍기">
              <SymbolView name="camera" size={20} tintColor={Colors.text} />
              <Text style={styles.backgroundLabel}>사진 찍기</Text>
            </Pressable>
          </ScrollView>
          <Text style={styles.note}>갤러리와 사진 찍기는 구도를 잡는 화면으로 이동해요.</Text>
        </>}

        {tool === 'route' && <>
          <Text style={styles.hint}>경로를 끌어서 옮기고, 두 손가락으로 키우거나 돌려요.</Text>
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
              <Slider value={smoothOptions.smooth} accessibilityLabel="직선 다듬기" onChange={(v) => handleSmoothAxisChange('smooth', v)} onSlidingComplete={handleSmoothCommit} />
            </View>
            <Text style={styles.sliderValue}>{smoothOptions.smooth === 0 ? '없음' : `${smoothOptions.smooth} %`}</Text>
          </View>
          <View style={styles.sliderRow}>
            <Text style={styles.sliderLabel}>코너</Text>
            <View style={styles.sliderTrack}>
              <Slider value={smoothOptions.corner} accessibilityLabel="코너 다듬기" onChange={(v) => handleSmoothAxisChange('corner', v)} onSlidingComplete={handleSmoothCommit} />
            </View>
            <Text style={styles.sliderValue}>{smoothOptions.corner === 0 ? '각지게' : `${smoothOptions.corner} %`}</Text>
          </View>
        </>}

        {tool === 'stamp' && <>
          <View style={styles.tabs}>
            {([{ id: 'layout', label: '프리셋' }, { id: 'items', label: '항목' }] as const).map((tab) => (
              <Pressable key={tab.id} onPress={() => setStampTab(tab.id)} style={styles.tab}
                accessibilityRole="tab" accessibilityState={{ selected: stampTab === tab.id }}>
                <Text style={stampTab === tab.id ? styles.tabTextOn : styles.tabText}>{tab.label}</Text>
              </Pressable>
            ))}
          </View>
          {stampTab === 'layout' ? (
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
          ) : (
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
          <Text style={styles.hint}>화면에서 끌어서 옮기고, 탭하면 프리셋이 바뀌어요. 아래 동그라미로 끌면 숨겨요.</Text>
        </>}

        {tool === 'caption' && <>
          <TextInput value={stampConfig.caption ?? ''} onChangeText={handleCaptionChange} autoFocus
            placeholder="예) 비 오는 날의 한강" placeholderTextColor={Colors.textMuted}
            accessibilityLabel="문구, 미리보기 기준 최대 3줄" style={styles.captionInput}
            multiline submitBehavior="newline" textAlignVertical="top" />
          <Text accessibilityLiveRegion="polite" style={styles.note}>
            {captionLineCount > CAPTION_MAX_LINES ? '크기를 바꿔서 3줄을 넘었어요. 새 입력은 3줄 안에서 할 수 있어요.'
              : captionLimited ? '최대 3줄까지 쓸 수 있어요. 문구를 줄이거나 크기를 줄여 주세요.'
                : `${captionLineCount}/${CAPTION_MAX_LINES}줄 · 화면에서 끌어서 옮겨요`}
          </Text>
        </>}
      </View>}
    </View>
  );
}

const CHIP_ON_BG = 'rgba(255,90,43,0.12)';
// 결과물 위에 얹는 버튼. 밝은 배경에서도 보이게 반투명 어두운 바탕을 깐다.
const OVERLAY_BG = 'rgba(11,13,16,0.55)';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  stage: { flex: 1, minHeight: 0, alignItems: 'center', justifyContent: 'center' },
  previewFrame: { backgroundColor: Colors.bgCard, overflow: 'hidden', borderRadius: 16 },
  topLeft: { position: 'absolute', top: 10, left: 10, flexDirection: 'row', gap: 8 },
  roundButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: OVERLAY_BG },
  disabled: { opacity: 0.4 },
  toolRail: { position: 'absolute', top: 10, right: 10, gap: 10, alignItems: 'flex-end' },
  toolButton: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  toolLabel: {
    fontFamily: Fonts.sansBold, fontSize: 12, color: Colors.text,
    textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 4, textShadowOffset: { width: 0, height: 0 },
  },
  toolIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: OVERLAY_BG },
  toolIconOn: { backgroundColor: Colors.accent },
  sizeSlider: { position: 'absolute', left: 4, top: '26%', height: '40%' },
  bottomBar: { height: BOTTOM_BAR_HEIGHT, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', paddingHorizontal: 20 },
  doneButton: { minHeight: 44, minWidth: 120, paddingHorizontal: 24, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.accent, borderRadius: 22 },
  doneText: { fontFamily: Fonts.sansBold, fontSize: 14, color: Colors.accentText },
  hideZone: {
    position: 'absolute', width: HIDE_ZONE, height: HIDE_ZONE, borderRadius: HIDE_ZONE / 2,
    alignItems: 'center', justifyContent: 'center', backgroundColor: OVERLAY_BG, borderWidth: 1, borderColor: Colors.borderStrong,
  },
  hideZoneOn: { backgroundColor: Colors.accent, borderColor: Colors.accent, transform: [{ scale: 1.15 }] },
  sheet: {
    position: 'absolute', left: 0, right: 0, paddingHorizontal: 20, paddingTop: 12, gap: 10,
    backgroundColor: Colors.bgCard, borderTopLeftRadius: Radius.pill, borderTopRightRadius: Radius.pill,
    borderTopWidth: 1, borderColor: Colors.border,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 32 },
  sheetHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sheetTitle: { fontFamily: Fonts.sansBold, fontSize: 14, color: Colors.text },
  sheetDone: { fontFamily: Fonts.sansBold, fontSize: 13, color: Colors.accent },
  hint: { fontFamily: Fonts.sans, fontSize: 11, lineHeight: 16, color: Colors.textMuted },
  note: { fontFamily: Fonts.sans, fontSize: 11, lineHeight: 17, color: Colors.textMuted },
  resetButton: { minHeight: 44, justifyContent: 'center' },
  resetChip: { minHeight: 28, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 14, borderWidth: 1, borderColor: Colors.borderStrong },
  resetChipPressed: { backgroundColor: Colors.border },
  resetText: { fontFamily: Fonts.sans, fontSize: 11, color: Colors.textMuted },
  presetRow: { flexDirection: 'row', gap: 8 },
  presetChip: { flex: 1, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.border },
  presetChipOn: { backgroundColor: Colors.accent },
  presetChipText: { fontFamily: Fonts.sans, fontSize: 12, color: Colors.textMuted },
  presetChipTextOn: { fontFamily: Fonts.sans, fontSize: 12, color: Colors.accentText },
  sliderRow: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 36 },
  sliderLabel: { width: 30, fontFamily: Fonts.sans, fontSize: 12, color: Colors.textMuted },
  sliderTrack: { flex: 1 },
  sliderValue: { width: 46, textAlign: 'right', fontFamily: Fonts.sans, fontSize: 12, color: Colors.accent },
  tabs: { flexDirection: 'row', gap: 24 },
  tab: { minHeight: 32, justifyContent: 'center' },
  tabText: { fontFamily: Fonts.sans, fontSize: 12, color: Colors.textMuted },
  tabTextOn: { fontFamily: Fonts.sansBold, fontSize: 12, color: Colors.accent },
  layoutChipRow: { flexDirection: 'row', columnGap: '2%', rowGap: 6, flexWrap: 'wrap' },
  layoutChip: { width: '32%', minHeight: 40, paddingHorizontal: 4, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.border },
  chipRowWrap: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  itemChip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: Radius.chip, borderWidth: 1, borderColor: Colors.borderStrong },
  itemChipOn: { borderColor: Colors.accent, backgroundColor: CHIP_ON_BG },
  itemChipText: { fontFamily: Fonts.sans, fontSize: 12, color: Colors.textMuted },
  itemChipTextOn: { fontFamily: Fonts.sansBold, fontSize: 12, color: Colors.accent },
  captionInput: { minHeight: 64, maxHeight: 104, lineHeight: 22, fontFamily: Fonts.sans, fontSize: 15, color: Colors.text, borderBottomWidth: 1, borderBottomColor: Colors.borderStrong, paddingVertical: 8 },
  backgroundRow: { gap: 10, paddingVertical: 2 },
  backgroundSwatch: { width: 64, height: 112, borderRadius: 12, overflow: 'hidden', borderWidth: 2, borderColor: 'transparent', backgroundColor: Colors.border },
  backgroundSwatchOn: { borderColor: Colors.accent },
  backgroundImage: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
  backgroundSource: { alignItems: 'center', justifyContent: 'center', gap: 6 },
  backgroundLabel: {
    position: 'absolute', bottom: 6, left: 0, right: 0, textAlign: 'center',
    fontFamily: Fonts.sans, fontSize: 10, color: Colors.text,
    textShadowColor: 'rgba(0,0,0,0.7)', textShadowRadius: 3, textShadowOffset: { width: 0, height: 0 },
  },
});
