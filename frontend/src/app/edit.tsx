import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSharedValue } from 'react-native-reanimated';
import {
  Alert,
  Animated,
  Image,
  Keyboard,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type PanResponderGestureState,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { CroppedBackgroundVideo } from '@/components/background-video';
import { CaptionEditor } from '@/components/caption-editor';
import {
  computeCaptionHitRects,
  computeFitTransform,
  computeRouteLocalBounds,
  computeStampHitRects,
  IDENTITY_TRANSFORM,
  migrateLegacyCaption,
  RoutePreview,
  STAMP_LAYOUTS,
  type CanvasRect,
  type CaptionItem,
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
import { limitFreeCaptionInput } from '@/lib/caption-layout';
import { saveDraft } from '@/lib/draft-store';
import { dragTargetFor, dropZoneFor, selectedTarget, tapActionFor, type EditTarget, type SheetTarget, type TextHit } from '@/lib/edit-gesture';
import { pushHistory, type EditSnapshot } from '@/lib/edit-history';
import { fitPortraitPreview } from '@/lib/preview-layout';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '@/lib/route-projection';
import type { SmoothOptions } from '@/lib/route-smoothing';
import { captionItems, newCaptionId } from '@/lib/stamp-caption';
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

type Tool = 'background' | 'route' | 'stamp';
// 1단계는 넷만 둔다. 그리기·내 스타일은 3단계에서 만들 때 버튼도 같이 넣는다. 문구는 시트 없이
// 화면에서 바로 쓴다(§7).
const TOOLS: { id: Tool | 'caption'; label: string; symbol: SymbolViewProps['name'] }[] = [
  { id: 'background', label: '배경', symbol: 'photo' },
  { id: 'route', label: '경로', symbol: 'scribble' },
  { id: 'stamp', label: '러닝 데이터', symbol: 'number' },
  { id: 'caption', label: '문구', symbol: 'textformat' },
];

type DragTarget = EditTarget;
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
  const [keyboardHeight, setKeyboardHeight] = useState(0);
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
    setIsInteracting(false);
    flushPendingSmooth();
    commitSmoothOptions(smoothOptionsRef.current);
  };
  // §2-1: 슬라이더를 잡고 있는 동안은 미리보기를 멈춘다. 다듬기는 선 모양 차이라 멈춰야 보인다.
  const handleSlidingStart = () => setIsInteracting(true);

  // §7: 러닝 데이터 묶음과 자유 문구(lib/stamp-caption.ts). 옛 저장분은 들어올 때 프리셋 안에 있던
  // 문구를 원래 자리·크기 근처의 자유 문구로 바꾼다(migrateLegacyCaption).
  const [stampConfig, setStampConfigState] = useState<StampConfig>(() => migrateLegacyCaption(draft.selectedRun, draft.stampConfig));
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
  // §7 문구: 인스타처럼 화면에서 바로 쓰고 여러 개다(components/caption-editor.tsx). 새 문구는 화면
  // 가운데에 놓인다. 다 지우고 마치면 그 문구는 빠진다.
  type EditingCaption = { id: string; text: string; scale: number; isNew: boolean; limited: boolean };
  const [editingCaption, setEditingCaption] = useState<EditingCaption | null>(null);
  const updateCaptions = (update: (items: CaptionItem[]) => CaptionItem[]) =>
    commitStamp({ ...stampConfigRef.current, captions: update(captionItems(stampConfigRef.current)) });
  const startNewCaption = () => {
    closeTool();
    setEditingCaption({ id: newCaptionId(), text: '', scale: 1, isNew: true, limited: false });
  };
  const startEditCaption = (id: string) => {
    const item = captionItems(stampConfigRef.current).find((c) => c.id === id);
    if (!item) return;
    closeTool();
    setEditingCaption({ id, text: item.text, scale: item.scale, isNew: false, limited: false });
  };
  const handleEditingText = (text: string) => setEditingCaption((prev) => {
    if (!prev) return prev;
    const constrained = limitFreeCaptionInput(text, prev.text, prev.scale);
    return { ...prev, text: constrained.text, limited: constrained.limited };
  });
  const handleEditingScale = (scale: number) => setEditingCaption((prev) => prev ? { ...prev, scale } : prev);
  const finishEditingCaption = () => {
    Keyboard.dismiss();
    const editing = editingCaption;
    setEditingCaption(null);
    if (!editing) return;
    const { id, text, scale, isNew } = editing;
    const empty = !text.trim();
    if (isNew) {
      if (!empty) updateCaptions((items) => [...items, { id, text, offset: { x: 0, y: 0 }, scale }]);
    } else {
      updateCaptions((items) => empty ? items.filter((c) => c.id !== id) : items.map((c) => c.id === id ? { ...c, text, scale } : c));
    }
  };
  const handleLayoutSelect = (layout: StampLayout) => {
    rememberStampLayout(layout);
    commitStamp({ ...stampConfigRef.current, layout });
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
  // 되돌리기 자체와 장소 이름 채우기처럼 사용자가 한 편집이 아닌 변화는 쌓지 않는다. 문구는 다 쓰고
  // 마칠 때 한 번에 들어가므로 한 단계가 된다.
  const skipHistoryRef = useRef(false);
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
    setHistory((h) => pushHistory(h, previous));
  }, [draft.backgroundImagePath, draft.backgroundPhoto, draft.preset, draft.transform, draft.smoothOptions, draft.stampConfig]);

  // 옛 저장분의 문구를 자유 문구로 바꾼 것(위 migrateLegacyCaption)을 초안에도 바로 반영해 두되
  // 되돌리기 단계로는 쌓지 않는다. 쌓이면 첫 되돌리기가 문구를 프리셋 안으로 되돌린다.
  useEffect(() => {
    // 문구 목록이 이미 있으면 바꿀 것이 없다. 옛 저장분과 개발 중 쓰던 문구 하나짜리 형식만 바꾼다.
    if (draft.stampConfig.captions) return;
    skipHistoryRef.current = true;
    commitStampConfig(stampConfigRef.current);
    // 들어올 때 한 번만.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  // 끌고 있는 문구 하나의 자리. 끌기 시작할 때 그 문구의 자리로 맞춘다.
  const baseCaptionPosition = useRef({ x: 0, y: 0 });
  const baseCaptionScale = useRef(1);
  const captionPositionX = useSharedValue(0);
  const captionPositionY = useSharedValue(0);

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
  const finishCaptionGesture = (id: string) => {
    flushPendingStampConfig();
    const offset = { x: captionPositionX.value, y: captionPositionY.value };
    updateCaptions((items) => items.map((c) => c.id === id ? { ...c, offset } : c));
  };
  // §7-2: 숨기거나 지운 직후 잠깐 되돌리기 안내를 띄운다. 실수해도 바로 되돌릴 수 있게 한다.
  const [undoToast, setUndoToast] = useState<string | null>(null);
  const undoToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showUndoToast = (message: string) => {
    if (undoToastTimerRef.current) clearTimeout(undoToastTimerRef.current);
    setUndoToast(message);
    undoToastTimerRef.current = setTimeout(() => setUndoToast(null), 3500);
  };
  useEffect(() => () => { if (undoToastTimerRef.current) clearTimeout(undoToastTimerRef.current); }, []);
  // §7-2: 문구는 아래 휴지통에 놓으면 지운다.
  const deleteCaption = (id: string) => {
    flushPendingStampConfig();
    updateCaptions((items) => items.filter((c) => c.id !== id));
    showUndoToast('문구를 지웠어요');
  };
  // §7-2: 숨기기 자리에 놓으면 숨긴다. 숨기기 전 자리는 그대로 둔다. 다시 열면 그 자리로 돌아온다.
  const hideStamp = () => {
    flushPendingStampConfig();
    const position = baseStampPosition.current;
    stampPositionX.set(position.x);
    stampPositionY.set(position.y);
    commitStamp({ ...stampConfigRef.current, position, hidden: true });
    showUndoToast('러닝 데이터를 숨겼어요');
  };

  // panResponder는 첫 렌더에서 한 번 만들어져 클로저가 고정되므로 바뀌는 값은 ref로 읽는다.
  const selectedRunRef = useRef(draft.selectedRun);
  useEffect(() => { selectedRunRef.current = draft.selectedRun; }, [draft.selectedRun]);
  const [previewSize, setPreviewSize] = useState({ width: 0, height: 0 });
  const previewSizeRef = useRef(previewSize);
  const gestureFitScaleRef = useRef(1);
  const dragTargetRef = useRef<DragTarget | null>(null);
  const gestureMovedRef = useRef(false);

  // §4-1: 손가락이 닿은 글자. 겹친 곳은 문구가 러닝 데이터보다 위다. 무엇을 움직이고 탭하면 무엇을
  // 할지는 lib/edit-gesture.ts가 정한다.
  const textHitAt = (canvasX: number, canvasY: number): TextHit => {
    const run = selectedRunRef.current;
    const config = stampConfigRef.current;
    if (!run) return null;
    // 나중에 넣은 문구가 위에 그려지므로 뒤에서부터 본다.
    const captions = computeCaptionHitRects(run, config);
    for (let i = captions.length - 1; i >= 0; i--) {
      if (contains(captions[i].rect, canvasX, canvasY)) return { kind: 'caption', id: captions[i].id };
    }
    if (!config.hidden && computeStampHitRects(run, config).some((rect) => contains(rect, canvasX, canvasY))) return { kind: 'stamp' };
    return null;
  };
  const textHitRef = useRef<TextHit>(null);

  // 경로 그림을 탭했는지. 끌기는 글자가 아닌 곳 어디서나 경로 그림을 움직이지만, 탭은 경로 그림의
  // 영역(점선 상자) 안일 때만 경로 시트를 연다. 그 밖의 빈 곳을 탭하면 열린 시트를 닫는다.
  const routeBounds = useMemo(() => computeRouteLocalBounds(draft.track?.coordinates ?? []), [draft.track]);
  const routeBoundsRef = useRef(routeBounds);
  useEffect(() => { routeBoundsRef.current = routeBounds; }, [routeBounds]);
  const tapPointRef = useRef({ x: 0, y: 0 });
  const isOnRoute = ({ x, y }: { x: number; y: number }) => {
    const bounds = routeBoundsRef.current;
    if (!bounds) return false;
    // route-preview.tsx groupTransform의 역변환: 가운데 기준으로 이동 → 회전 → 크기를 되돌린다.
    const t = transformRef.current;
    const dx = x - CANVAS_WIDTH / 2 - t.x;
    const dy = y - CANVAS_HEIGHT / 2 - t.y;
    const angle = (-t.rotationDeg * Math.PI) / 180;
    const localX = (dx * Math.cos(angle) - dy * Math.sin(angle)) / t.scale + CANVAS_WIDTH / 2;
    const localY = (dx * Math.sin(angle) + dy * Math.cos(angle)) / t.scale + CANVAS_HEIGHT / 2;
    return Math.abs(localX - bounds.cx) <= bounds.width / 2 && Math.abs(localY - bounds.cy) <= bounds.height / 2;
  };

  // §7-2 숨기기·지우기 자리는 결과물 밖, 맨 아래 띠(평소 완료 버튼 자리) 가운데에 둔다. 실기기 확인
  // (2026-10-04)에서 "위치를 움직이다가 사라지게 만드는 경우가 꽤 있을 것"이라는 지적을 받았다. 예전에는
  // 결과물 안(시트가 열려 있으면 시트 바로 위)에 나와, 아래쪽 프리셋을 옮기다 지나가기 쉬웠다. 이제
  // 손가락이 결과물 아래 띠까지 내려가야만 숨겨진다.
  const hideZoneBottom = insets.bottom + (BOTTOM_BAR_HEIGHT - HIDE_ZONE) / 2;
  const hideZoneRef = useRef({ centerX: 0, barTop: 0 });
  useEffect(() => {
    hideZoneRef.current = { centerX: window.width / 2, barTop: window.height - insets.bottom - BOTTOM_BAR_HEIGHT };
  }, [window.width, window.height, insets.bottom]);
  const isOverHideZone = (touch: { pageX: number; pageY: number }) => {
    const { centerX, barTop } = hideZoneRef.current;
    return touch.pageY >= barTop && Math.abs(touch.pageX - centerX) < HIDE_ZONE * 1.2;
  };

  // §1: 시트는 아래로 끌어서도 닫는다. 손가락을 따라 내려가다가 충분히 내리거나 빠르게 밀면 닫히고,
  // 조금만 내리면 제자리로 돌아간다. 슬라이더는 잡는 순간 응답을 가져가고 놓지 않아서 시트가
  // 끌리지 않는다. 칩처럼 누르기만 하는 것 위에서 시작한 세로 끌기는 시트가 가져온다.
  const sheetDragY = useRef(new Animated.Value(0)).current;
  const sheetHeightRef = useRef(0);
  const sheetPanResponder = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_evt, gesture) => gesture.dy > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.5,
    onPanResponderMove: (_evt, gesture) => sheetDragY.setValue(Math.max(0, gesture.dy)),
    onPanResponderRelease: (_evt, gesture) => {
      if (gesture.dy > Math.min(120, sheetHeightRef.current * 0.35) || gesture.vy > 0.9) {
        Animated.timing(sheetDragY, { toValue: sheetHeightRef.current || 400, duration: 160, useNativeDriver: true })
          .start(() => {
            closeTool();
            sheetDragY.setValue(0);
          });
      } else {
        Animated.spring(sheetDragY, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
      }
    },
    onPanResponderTerminate: () => Animated.spring(sheetDragY, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start(),
  })).current;

  // §7-2: 끄는 동안은 시트를 아래로 치워 결과물 전체를 보이게 한다. 손을 떼면 다시 올라온다.
  const sheetAway = dragging !== null && tool !== null;
  useEffect(() => {
    Animated.timing(sheetDragY, {
      toValue: sheetAway ? sheetHeightRef.current + 24 : 0,
      duration: sheetAway ? 140 : 180,
      useNativeDriver: true,
    }).start();
  }, [sheetAway, sheetDragY]);

  const openTool = (next: Tool) => {
    Keyboard.dismiss();
    flushPendingSmooth();
    flushPendingStampConfig();
    // §7-2: 숨긴 러닝 데이터는 러닝 데이터 도구를 다시 열면 돌아온다.
    if (next === 'stamp' && stampConfigRef.current.hidden) commitStamp({ ...stampConfigRef.current, hidden: false });
    toolRef.current = next;
    setTool(next);
  };
  const closeTool = () => {
    Keyboard.dismiss();
    toolRef.current = null;
    setTool(null);
  };
  // §4-1: 탭하면 그 도구가 열리며 선택된다. 실기기 확인(2026-10-04)에서 러닝 데이터를 탭하면
  // 프리셋이 넘어가던 것이 "선택이 아니라 다른 프리셋으로 바뀐다"는 지적을, 경로 그림을 탭해도
  // 아무 일이 없던 것이 "경로는 선택이 안 된다"는 지적을 받아 바꿨다.
  const handleTap = () => {
    const action = tapActionFor(textHitRef.current, isOnRoute(tapPointRef.current), toolRef.current !== null);
    if (action.kind === 'open') openTool(action.tool);
    else if (action.kind === 'editCaption') startEditCaption(action.id);
    else if (action.kind === 'close') closeTool();
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
        tapPointRef.current = { x: (touch.locationX - offsetX) / fitScale, y: (touch.locationY - offsetY) / fitScale };
        textHitRef.current = textHitAt(tapPointRef.current.x, tapPointRef.current.y);
        // 글자를 직접 짚지 않은 끌기는 선택된 대상을 움직인다(선택된 러닝 데이터를 끌다 경로가 움직이지 않게).
        // 선택된 것이 없으면 경로 그림 영역 안일 때만 경로 그림을 움직인다.
        const target = dragTargetFor(textHitRef.current, selectedTarget(toolRef.current), isOnRoute(tapPointRef.current));
        dragTargetRef.current = target;
        gestureMovedRef.current = evt.nativeEvent.touches.length > 1;

        const config = stampConfigRef.current;
        if (!target) {
          // 빈 곳. 끌어도 아무것도 움직이지 않고, 탭만 받는다.
        } else if (target.kind === 'stamp') {
          baseStampPosition.current = config.position;
          baseStampScale.current = config.scale ?? 1;
          stampPositionX.set(config.position.x);
          stampPositionY.set(config.position.y);
        } else if (target.kind === 'caption') {
          const caption = captionItems(config).find((c) => c.id === target.id);
          baseCaptionPosition.current = caption?.offset ?? { x: 0, y: 0 };
          baseCaptionScale.current = caption?.scale ?? 1;
          captionPositionX.set(baseCaptionPosition.current.x);
          captionPositionY.set(baseCaptionPosition.current.y);
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
        if (gestureMovedRef.current && target) setDragging(target);
      },
      onPanResponderMove: (evt: GestureResponderEvent, gestureState: PanResponderGestureState) => {
        const touches = evt.nativeEvent.touches;
        if (!gestureMovedRef.current && (touches.length > 1 || Math.abs(gestureState.dx) >= 6 || Math.abs(gestureState.dy) >= 6)) {
          gestureMovedRef.current = true;
          if (dragTargetRef.current) setDragging(dragTargetRef.current);
        }
        const target = dragTargetRef.current;
        if (!gestureMovedRef.current || !target) return;
        const fitScale = gestureFitScaleRef.current;
        if (touches.length === 2 && !gestureStart.current) {
          gestureStart.current = { distance: touchDistance(touches[0], touches[1]), angle: touchAngleDeg(touches[0], touches[1]) };
        }
        const scaleDelta = touches.length === 2 && gestureStart.current
          ? touchDistance(touches[0], touches[1]) / (gestureStart.current.distance || 1) : 1;

        if (target.kind === 'stamp' || target.kind === 'caption') {
          const isStamp = target.kind === 'stamp';
          const base = isStamp ? baseStampPosition.current : baseCaptionPosition.current;
          (isStamp ? stampPositionX : captionPositionX).set(base.x + gestureState.dx / fitScale);
          (isStamp ? stampPositionY : captionPositionY).set(base.y + gestureState.dy / fitScale);
          if (touches.length === 2) {
            // 두 손가락이면 크기를 바꾸려는 것이다. 숨기기 자리 위였더라도 숨기지 않는다.
            if (overHideZoneRef.current) {
              overHideZoneRef.current = false;
              setOverHideZone(false);
            }
            const config = stampConfigRef.current;
            const scale = clampScale((isStamp ? baseStampScale.current : baseCaptionScale.current) * scaleDelta);
            scheduleStampConfigUpdate(target.kind === 'caption'
              ? { ...config, captions: captionItems(config).map((c) => c.id === target.id ? { ...c, scale } : c) }
              : { ...config, scale });
          } else if (touches[0]) {
            const over = isOverHideZone(touches[0]);
            if (over !== overHideZoneRef.current) {
              overHideZoneRef.current = over;
              setOverHideZone(over);
              // 들어가는 순간 한 번 진동해 "지금 놓으면 숨겨진다"를 손으로 알린다.
              if (over) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
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
          handleTap();
          return;
        }
        if (target) commitGesture(target, over);
      },
      onPanResponderTerminate: () => {
        endGesture();
        if (gestureMovedRef.current && dragTargetRef.current) commitGesture(dragTargetRef.current, false);
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
  function commitGesture(target: DragTarget, overDropZone: boolean) {
    if (target.kind === 'stamp') {
      if (overDropZone) hideStamp();
      else finishStampGesture();
    } else if (target.kind === 'caption') {
      if (overDropZone) deleteCaption(target.id);
      else finishCaptionGesture(target.id);
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
  // 문구 크기는 문구를 쓰는 화면의 슬라이더에서 바꾼다(caption-editor.tsx).
  const sizeTarget: SheetTarget | null = selectedTarget(tool);
  const committedSize = sizeTarget === 'route' ? Math.round(transform.scale * 100) : Math.round((stampConfig.scale ?? 1) * 100);
  // 손잡이는 슬라이더가 바로 그린다. 여기서는 경로 그림이면 SharedValue만 바꿔 다시 그리지 않는다.
  const handleSizeChange = (percent: number) => {
    if (!sizeTarget) return;
    const scale = percent / 100;
    if (sizeTarget === 'route') transformScaleShared.value = scale;
    else scheduleStampConfigUpdate({ ...stampConfigRef.current, scale });
  };
  const handleSizeCommit = (percent: number) => {
    setIsInteracting(false);
    const scale = percent / 100;
    if (sizeTarget === 'route') {
      const next = { ...transformRef.current, scale };
      updateTransform(next);
      commitTransform(next);
    } else if (sizeTarget) {
      flushPendingStampConfig();
      commitStamp({ ...stampConfigRef.current, scale });
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
    // 장소 이름은 들어온 뒤 늦게 채워진다. 그 전 단계로 돌아가도 장소는 남긴다(다시 채우지 않는다).
    const placeName = stampConfigRef.current.placeName || previous.stampConfig.placeName;
    const restored = { ...previous, stampConfig: { ...previous.stampConfig, placeName } };
    updateTransform(restored.transform);
    updateSmoothOptions(restored.smoothOptions);
    updateStampConfig(migrateLegacyCaption(draft.selectedRun, restored.stampConfig));
    loadDraft(restored);
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
  const showChrome = dragging === null && !editingCaption;
  const selectionFor = (target: SheetTarget) => dragging ? dragging.kind === target : tool === target;
  const sizeLabel = sizeTarget === 'route' ? '경로 그림 크기' : '러닝 데이터 크기';
  const activeCaptionId = dragging?.kind === 'caption' ? dragging.id : null;
  const dropZone = dragging ? dropZoneFor(dragging) : null;
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
                    activeCaptionId={activeCaptionId}
                    hiddenCaptionId={editingCaption && !editingCaption.isNew ? editingCaption.id : null}
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
                    <Pressable key={t.id} onPress={() => t.id === 'caption' ? startNewCaption() : on ? closeTool() : openTool(t.id)}
                      style={styles.toolButton}
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
                <VerticalSlider value={committedSize} onSlidingStart={handleSlidingStart}
                  minimumValue={SIZE_MIN} maximumValue={SIZE_MAX}
                  accessibilityLabel={sizeLabel} onChange={handleSizeChange} onSlidingComplete={handleSizeCommit} />
              </View>}
            </View>
          )}
        </View>
        <View style={styles.bottomBar}>
          {/* 끄는 동안에는 이 자리에 숨기기·지우기 동그라미가 나온다. */}
          {dragging === null && <Pressable onPress={handleDone} style={styles.doneButton} accessibilityRole="button" accessibilityLabel="편집 완료하고 공유로">
            <Text style={styles.doneText}>완료</Text>
          </Pressable>}
        </View>
      </SafeAreaView>

      {dropZone && <View pointerEvents="none"
        style={[styles.hideZone, overHideZone && styles.hideZoneOn, { bottom: hideZoneBottom, left: window.width / 2 - HIDE_ZONE / 2 }]}
        accessibilityLabel={dropZone === 'delete' ? '여기에 놓으면 문구를 지워요' : '여기에 놓으면 러닝 데이터를 숨겨요'}>
        <SymbolView name={dropZone === 'delete' ? 'trash' : 'eye.slash'} size={20} tintColor={overHideZone ? Colors.accentText : Colors.text} />
      </View>}

      {tool && <Animated.View {...sheetPanResponder.panHandlers}
        style={[styles.sheet, { bottom: keyboardHeight, paddingBottom: keyboardHeight > 0 ? Spacing.sm : insets.bottom + Spacing.sm,
          transform: [{ translateY: sheetDragY }] }]}
        onLayout={(e) => { sheetHeightRef.current = e.nativeEvent.layout.height; }}>
        <View style={styles.sheetGrabber} accessible={false} />
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
              <Slider value={smoothOptions.smooth} accessibilityLabel="직선 다듬기" onChange={(v) => handleSmoothAxisChange('smooth', v)} onSlidingStart={handleSlidingStart} onSlidingComplete={handleSmoothCommit} />
            </View>
            <Text style={styles.sliderValue}>{smoothOptions.smooth === 0 ? '없음' : `${smoothOptions.smooth} %`}</Text>
          </View>
          <View style={styles.sliderRow}>
            <Text style={styles.sliderLabel}>코너</Text>
            <View style={styles.sliderTrack}>
              <Slider value={smoothOptions.corner} accessibilityLabel="코너 다듬기" onChange={(v) => handleSmoothAxisChange('corner', v)} onSlidingStart={handleSlidingStart} onSlidingComplete={handleSmoothCommit} />
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
          <Text style={styles.hint}>화면에서 끌어서 옮기고, 아래 동그라미로 끌면 숨겨요.</Text>
        </>}
      </Animated.View>}

      {undoToast && dragging === null && !tool && <View style={[styles.toast, { bottom: insets.bottom + BOTTOM_BAR_HEIGHT + 8 }]}
        accessibilityLiveRegion="polite">
        <Text style={styles.toastText}>{undoToast}</Text>
        <Pressable onPress={() => { setUndoToast(null); handleUndo(); }} hitSlop={10} accessibilityRole="button" accessibilityLabel="되돌리기">
          <Text style={styles.toastAction}>되돌리기</Text>
        </Pressable>
      </View>}

      {editingCaption && <CaptionEditor text={editingCaption.text} scale={editingCaption.scale}
        fitScale={previewSize.width / CANVAS_WIDTH} keyboardHeight={keyboardHeight} topInset={insets.top}
        limited={editingCaption.limited} onChangeText={handleEditingText} onScaleChange={handleEditingScale}
        onDone={finishEditingCaption} />}
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
  // 화면 왼쪽 끝에서 밀면 뒤로 가기라 그 자리를 피한다.
  sizeSlider: { position: 'absolute', left: 12, top: '26%', height: '40%' },
  bottomBar: { height: BOTTOM_BAR_HEIGHT, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', paddingHorizontal: 20 },
  doneButton: { minHeight: 44, minWidth: 120, paddingHorizontal: 24, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.accent, borderRadius: 22 },
  doneText: { fontFamily: Fonts.sansBold, fontSize: 14, color: Colors.accentText },
  hideZone: {
    position: 'absolute', width: HIDE_ZONE, height: HIDE_ZONE, borderRadius: HIDE_ZONE / 2,
    alignItems: 'center', justifyContent: 'center', backgroundColor: OVERLAY_BG, borderWidth: 1, borderColor: Colors.borderStrong,
  },
  hideZoneOn: { backgroundColor: Colors.accent, borderColor: Colors.accent, transform: [{ scale: 1.15 }] },
  toast: {
    position: 'absolute', alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 22, backgroundColor: 'rgba(20,24,29,0.95)',
    borderWidth: 1, borderColor: Colors.border,
  },
  toastText: { fontFamily: Fonts.sans, fontSize: 13, color: Colors.text },
  toastAction: { fontFamily: Fonts.sansBold, fontSize: 13, color: Colors.accent },
  sheet: {
    position: 'absolute', left: 0, right: 0, paddingHorizontal: 20, paddingTop: 12, gap: 10,
    backgroundColor: Colors.bgCard, borderTopLeftRadius: Radius.pill, borderTopRightRadius: Radius.pill,
    borderTopWidth: 1, borderColor: Colors.border,
  },
  sheetGrabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.borderStrong, marginTop: -4 },
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
