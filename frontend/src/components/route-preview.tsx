import { Canvas, Circle, Group, Path, Shadow, Skia } from '@shopify/react-native-skia';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { Animated, View } from 'react-native';
import { useAnimatedReaction, useDerivedValue, useFrameCallback, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import {
  Circle as SvgCircle,
  G,
  Rect as SvgRect,
  Line,
  Svg,
  Text as SvgText,
  TSpan,
  Defs,
  Filter,
  FeGaussianBlur,
  FeMerge,
  FeMergeNode,
} from 'react-native-svg';

import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  cumulativeCanvasDistances,
  projectPoints,
  pointAtDistance,
  segmentUnitMeters,
  type CanvasPoint,
  type Point,
} from '@/lib/route-projection';
import { applySmoothing, type SmoothOptions } from '@/lib/route-smoothing';
import { formatDistanceKm, formatDuration, formatHeartRate, formatPace, formatStampDate } from '@/lib/stamp-format';

import type { RunRecord } from '../../modules/health-kit-bridge/src/HealthKitBridge.types';

export const IDENTITY_SMOOTH: SmoothOptions = { smooth: 0, corner: 0 };

// result-editing FRD §7 · route-rendering FRD §7. '날짜'·'장소'는 시안 S6(2026-09-01)에서
// 추가 — route-rendering §7은 원래 넷이었다(확인 노트 기록).
export type StampItem = 'distance' | 'time' | 'pace' | 'heartRate' | 'date' | 'place';
export type StampMode = 'always' | 'after' | 'hidden';
/** 각인 배치 프리셋. row/hero는 자체 제작, 나머지 6개(stack~line)는 디자인
 * 프로젝트("런 기록 카드 프리셋" 2a~2f, 2026-09-02) 그대로 포팅했다. 각각
 * 어떻게 생겼는지는 stampLayoutDescriptors 함수 본문의 분기 주석 참고. */
export type StampLayout = 'row' | 'stack' | 'bar' | 'corner' | 'glass' | 'rail' | 'line';

export const STAMP_LAYOUTS: { id: StampLayout; label: string }[] = [
  { id: 'row', label: '간결' },
  { id: 'stack', label: '스택' }, // 2a 좌하단 스택
  { id: 'bar', label: '스탯바' }, // 2b 하단 스탯 바
  { id: 'corner', label: '코너' }, // 2c 코너 분산
  { id: 'glass', label: '글래스' }, // 2d 글래스 플레이트
  { id: 'rail', label: '레일' }, // 2e 사이드 레일
  { id: 'line', label: '원라인' }, // 2f 원 라인
];

export type StampConfig = {
  /** §7-3 표시 타이밍. 시안 S6엔 UI가 없어(2026-09-01) 항상 'always' — 확인 노트 참고. */
  mode: StampMode;
  /** 배치 프리셋. 기존 저장분엔 없어 렌더 시 'row'로 방어. */
  layout: StampLayout;
  enabled: Record<StampItem, boolean>;
  /** 시안 S6 "한 줄 문구" — 결과물에 얹는 자유 텍스트 한 줄. 빈 문자열이면 안 그린다. */
  caption: string;
  /** '장소' 각인 값 — 트랙 좌표를 역지오코딩해 채운다(edit.tsx). 비면 장소 항목은 안 나온다. */
  placeName: string;
  /** 각인 묶음(문구 + 항목)은 하나의 묶음 — 위치 하나만 갖는다. 기본 자리(§7-5) 오프셋(캔버스 px). */
  position: { x: number; y: number };
  /** 각인 묶음 크기 배율(2026-09-02 추가). 기본 자리(anchor)는 그대로 두고 글자 크기·
   * 내부 간격만 이 값을 곱해 키우거나 줄인다 — 기존 저장분엔 없는 필드라 읽을 때
   * `?? 1`로 방어. */
  scale?: number;
};

export const IDENTITY_STAMP: StampConfig = {
  mode: 'always',
  layout: 'row',
  enabled: { distance: true, time: true, pace: true, heartRate: true, date: true, place: true },
  caption: '',
  placeName: '',
  position: { x: 0, y: 0 },
  scale: 1,
};

// route-rendering FRD §7-5: 인스타 스토리에서 안 가려지는 영역. 원래 상단 14%·하단 20%
// 제안값이었으나(비대칭), 실기기 피드백(2026-09)으로 세로 가운데에 두기로 함 — 안전 영역
// 높이(0.66)는 그대로, 상하 여백만 같게(0.17). "[확인 필요]" — 실기기 전까지 제안값.
const SAFE_AREA_TOP_RATIO = 0.17;
const SAFE_AREA_BOTTOM_RATIO = 0.17;
const STAMP_DEFAULT_Y = CANVAS_HEIGHT * (1 - SAFE_AREA_BOTTOM_RATIO) - 90;

// 캔버스(1080x1920) 좌표 → 뷰 픽셀 변환. RoutePreview 내부(Canvas Group·SVG
// 오버레이)와 edit.tsx(각인 탭 히트테스트)가 정확히 같은 좌표를 쓰려면 이 계산이
// 한 곳에만 있어야 한다(2026-09-02, 각인 탭-선택 기능 추가하며 분리) — 따로
// 베끼면 언젠가 둘이 조용히 어긋난다.
export function computeFitTransform(
  viewWidth: number,
  viewHeight: number,
  fit: 'contain' | 'cover' | 'cover-safe',
  bottomInset = 0
): { fitScale: number; offsetX: number; offsetY: number; usableHeight: number } {
  const safeTop = CANVAS_HEIGHT * SAFE_AREA_TOP_RATIO;
  const safeHeight = CANVAS_HEIGHT * (1 - SAFE_AREA_TOP_RATIO - SAFE_AREA_BOTTOM_RATIO);
  const usableHeight = fit === 'cover-safe' ? Math.max(1, viewHeight - bottomInset) : viewHeight;

  const fitScale =
    fit === 'cover'
      ? Math.max(viewWidth / CANVAS_WIDTH, viewHeight / CANVAS_HEIGHT)
      : fit === 'cover-safe'
        ? Math.max(viewWidth / CANVAS_WIDTH, usableHeight / safeHeight)
        : Math.min(viewWidth / CANVAS_WIDTH, viewHeight / CANVAS_HEIGHT);
  const offsetX = (viewWidth - CANVAS_WIDTH * fitScale) / 2;
  const offsetY =
    fit === 'cover-safe'
      ? (usableHeight - safeHeight * fitScale) / 2 - safeTop * fitScale
      : (viewHeight - CANVAS_HEIGHT * fitScale) / 2;

  return { fitScale, offsetX, offsetY, usableHeight };
}

// FRD: docs/specs/frd/route-rendering.md §5·§6 · docs/specs/frd/result-editing.md §2-1
//
// 렌더링은 "3안" 시안의 canvas 로직(neon 테마: 어두운 캔버스에 #FFF3EC 선 + #FF5A2B 글로우,
// 지나온 길 · 최근 잔광 · 머리 점, 구간 점등의 반짝임)을 그대로 옮긴 것이다. 시안은
// <canvas> 2D를 쓰고, 여기서는 같은 엔진 계열인 react-native-skia로 그린다 —
// react-native-svg 필터로는 canvas shadowBlur 글로우를 못 맞췄고, 프레임마다 SVG를
// 다시 그리는 비용도 컸다. Swift 렌더러(modules/route-renderer)도 같은 값을 맞춰야 한다.
//
// 최종 mp4를 굽는 AVFoundation 렌더러와는 별개의, 편집 중 실시간 미리보기.
// §2-2 "모든 조작은 즉시 미리보기에 반영된다"를 매번 재인코딩 없이 만족하기 위한 경로.

export type RoutePreset = 'default-drawing' | 'light-runner' | 'segment-lighting';

const DRAW_SECONDS = 9;
const HOLD_SECONDS = 3;
// 재생 버튼(2026-09-02)이 "한 번 재생하고 자동으로 멈춘다"의 길이를 재려고 밖에서도 씀.
export const CYCLE_SECONDS = DRAW_SECONDS + HOLD_SECONDS;

// 시안 neon 테마 팔레트.
const LINE_WARM = '#FFF3EC';
const GLOW = '#FF5A2B';
const GHOST = 'rgba(237,241,245,0.13)';
const BASE = 'rgba(237,241,245,0.20)';
const TRAVELED = 'rgba(255,243,236,0.60)';

export type RouteTransform = { x: number; y: number; scale: number; rotationDeg: number };
export const IDENTITY_TRANSFORM: RouteTransform = { x: 0, y: 0, scale: 1, rotationDeg: 0 };

/** RouteTransform의 각 값을 Reanimated SharedValue로 들고 있는 버전 — edit.tsx가
 * 드래그 중 이 값들에 직접 쓰면(React state를 안 거침) Skia Group transform이
 * 네이티브 쪽에서만 갱신된다. transformShared 참고. */
export type RouteTransformShared = {
  x: ReturnType<typeof useSharedValue<number>>;
  y: ReturnType<typeof useSharedValue<number>>;
  scale: ReturnType<typeof useSharedValue<number>>;
  rotationDeg: ReturnType<typeof useSharedValue<number>>;
};

type Props = {
  points: Point[];
  preset: RoutePreset;
  transform: RouteTransform;
  /** 실기기 피드백(2026-09-02): "경로 이동이 뚝뚝 끊긴다" — 끌기·핀치 중엔
   * transform(React state, 매 프레임 리렌더)을 직접 안 바꾸고, edit.tsx가 이
   * SharedValue들에 바로 쓴다(터치를 처리하는 JS 스레드에서 쓰긴 하지만, 그
   * 갱신 자체는 React 리렌더를 안 거쳐 네이티브 쪽으로 바로 전달된다 — light-
   * runner의 진행률과 같은 경로). 손을 떼면 그 값을 transform(state)에 한 번만
   * 커밋해 지속되게 한다. 안 넘기면(다른 화면들) transform prop을 그대로 쓴다. */
  transformShared?: RouteTransformShared;
  smoothOptions: SmoothOptions;
  run: RunRecord;
  stampConfig: StampConfig;
  /** §7-1: 편집 중에만 인스타 안전 영역 가이드. 결과물엔 안 나온다. */
  showSafeAreaGuide?: boolean;
  /** §2-1: 조작 중(제스처)이면 그 시점에서 멈춘다. */
  isInteracting: boolean;
  viewWidth: number;
  viewHeight: number;
  /**
   * 'contain'(기본) — 9:16 전체가 다 보이게 맞춘다. 화면 비율이 9:16과 다르면
   * 위아래(또는 좌우)에 여백이 남는다(배경 이미지로 채워짐).
   * 'cover' — 화면을 꽉 채우고 넘치는 만큼 잘라낸다. 9:16 캔버스 전체를 기준으로
   * 자르기 때문에, 편집 화면처럼 실제 뷰 비율이 9:16보다 납작하면 위아래가 꽤
   * 잘려 나가 보인다는 실기기 피드백(2026-09-02)이 있었다.
   * 'cover-safe' — 캔버스 전체가 아니라 인스타 스토리 안전 영역(SAFE_AREA_TOP/BOTTOM_RATIO,
   * 어차피 스토리에 올리면 UI에 가려지는 부분)만 기준으로 꽉 채운다. 잘려 나가는
   * 부분이 "어차피 안 보이는 영역"이라 체감상 원본 그대로에 가깝다.
   * 실제 내보내기는 이 화면 크롭과 무관하게 항상 정확한 9:16 전체를 그린다
   * (RouteRendererModule.swift가 화면 크기가 아니라 CANVAS_WIDTH/HEIGHT 기준으로
   * 따로 계산) — 편집 중 미리보기에서만 화면을 꽉 채워 보여주는 표시 방식 차이일 뿐이다.
   */
  fit?: 'contain' | 'cover' | 'cover-safe';
  /**
   * cover-safe 전용: 뷰 하단에서 다른 UI(바텀시트 등)가 덮어서 실제로는 안 보이는
   * 높이(뷰 픽셀 단위). previewArea가 flex:1이라 바텀시트가 덮는 만큼까지 포함해서
   * viewHeight가 잡히는 경우, 이 값만큼 빼고 "실제로 보이는 높이"만 기준으로
   * 안전 영역을 채운다 — 안 그러면 안전 영역 하단 가까이 있는 각인이 시트 뒤로
   * 밀려 들어가 안 보인다. 기본 0(전부 보인다고 가정).
   */
  bottomInset?: number;
  /** 실기기 피드백(2026-09-02): 각인을 화면에서 직접 탭해 고를 때, 지금 각인이
   * "선택된" 대상임을 점선 박스로 보여준다(edit.tsx가 탭 히트테스트 결과로 켬). */
  stampSelected?: boolean;
  /** 실기기 피드백(2026-09-02): "재생 중엔 편집(경로·각인 이동)이 계속 느리다" —
   * 재생과 조작이 동시에 일어나지 않게 edit.tsx는 기본 정지(완성된 모습)로 두고
   * 명시적으로 재생 버튼을 눌렀을 때만 이 값을 true로 준다. false면
   * progressFraction을 강제로 1(완성 상태)로 취급 — elapsed 타이머 자체가 안
   * 돈다. 기본값은 true라 안 넘기는 기존 화면(background-selection.tsx 등)은
   * 원래 동작(항상 재생) 그대로 유지된다. */
  playing?: boolean;
  /** 실기기 피드백(2026-09-02): "각인 옮기는 게 렉이 걸린다" — 각인은 SVG라
   * Skia처럼 SharedValue를 프레임마다 바로 읽는 방식이 없다. 대신 각인 레이어를
   * 별도 Svg로 떼어(안전 영역 가이드와는 분리) 이 클래식 Animated.Value 두
   * 개(x/y)로 감싼 Animated.View에 넣는다 — 바텀시트 드래그 때 이미 쓰던
   * 것과 같은 방식(useNativeDriver:true인 값에 onPanResponderMove에서
   * .setValue()를 직접 호출)이라, edit.tsx가 드래그 중 stampConfig(React
   * state)를 안 건드리고 이 값만 갱신하면 리렌더 없이 네이티브 쪽에서 위치가
   * 움직인다. 손을 뗄 때만 실제 stampConfig.position을 커밋하고 이 오프셋을
   * 0으로 되돌린다. 안 넘기면(다른 화면들) 각인은 원래 자리에 고정. */
  stampDragOffset?: { x: Animated.Value; y: Animated.Value };
};

// 애니메이션 중(최대 60fps)마다 불리므로 SVG 문자열을 만들었다가 다시 파싱하는
// MakeFromSVGString은 쓰지 않는다 — Skia Path API로 바로 그린다(2026-09-01, 실기기
// 끊김 원인 중 하나였음). toSvgPath는 route-thumbnail.tsx 등 애니메이션이 없는
// 곳에서만 쓴다.
function skPath(points: CanvasPoint[]) {
  const path = Skia.Path.Make();
  if (points.length === 0) return path;
  path.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    path.lineTo(points[i].x, points[i].y);
  }
  return path;
}

export function RoutePreview({
  points,
  preset,
  transform,
  transformShared,
  smoothOptions,
  run,
  stampConfig,
  showSafeAreaGuide = false,
  isInteracting,
  viewWidth,
  viewHeight,
  fit = 'contain',
  bottomInset = 0,
  stampSelected = false,
  playing = true,
  stampDragOffset,
}: Props) {
  // §5: 다듬기는 그룹 변형(scale/rotate) 이전, 캔버스 좌표계에서 적용한다.
  const rawProjected = useMemo(() => projectPoints(points), [points]);
  const projected = useMemo(
    () => applySmoothing(rawProjected, smoothOptions),
    [rawProjected, smoothOptions]
  );
  const cumulative = useMemo(() => cumulativeCanvasDistances(projected), [projected]);
  const totalDistance = cumulative[cumulative.length - 1] ?? 0;

  const rawFullPath = useMemo(() => skPath(rawProjected), [rawProjected]);
  const fullPath = useMemo(() => skPath(projected), [projected]);

  // 실기기 피드백(2026-09-02): 세 프리셋 다 이제 진행률을 Reanimated
  // SharedValue(UI 스레드)로 들고 있어서(아래 useUIThreadProgress·
  // LightRunnerLayer), 여기 JS 쪽엔 "그리기 자체"를 위한 진행률 state가 더 이상
  // 없다 — 각인(거리·시간·페이스) 카운트업 숫자를 SVG로 그리는 데만 이 값이
  // 필요해서, 어느 프리셋이 켜져 있든 그 프리셋 레이어가 onProgressSample로
  // 대략 30단계마다만 낮춰서 여기로 올려준다(JS 리렌더가 드묾).
  const [uiStampProgress, setUiStampProgress] = useState(0);

  // §3: 프리셋을 바꾸면 처음부터 재생 — prop이 바뀐 렌더에서 상태만 리셋(React 권장 패턴,
  // ref는 안 건드린다).
  const [seenPreset, setSeenPreset] = useState(preset);
  if (seenPreset !== preset) {
    setSeenPreset(preset);
    setUiStampProgress(0);
  }

  // 재생 버튼(2026-09-02): 정지(playing=false) → 재생(true)으로 바뀔 때마다
  // 처음부터 다시 재생한다. light-runner는 진행률을 LightRunnerLayer 내부의
  // Reanimated SharedValue(UI 스레드)가 들고 있어서, playToken을 바꿔 그
  // 컴포넌트를 강제로 다시 마운트시켜 리셋한다(프리셋이 바뀔 때 자연히 새로
  // 마운트되며 리셋되는 것과 같은 방식). 나머지 둘(useUIThreadProgress)은
  // playing 값 자체가 바뀌는 걸 보고 훅 안에서 직접 리셋하므로 재마운트가
  // 필요 없다.
  const [playToken, setPlayToken] = useState(0);
  const [seenPlaying, setSeenPlaying] = useState(playing);
  if (seenPlaying !== playing) {
    setSeenPlaying(playing);
    if (playing) {
      setUiStampProgress(0);
      setPlayToken((t) => t + 1);
    }
  }

  // 실기기 피드백(2026-09-02): "경로 이동이 뚝뚝 끊긴다" — transformShared를 안
  // 넘기는 화면(background-selection.tsx 등, 드래그 없음)을 위해 내부에도
  // SharedValue를 만들어 두고 transform prop이 바뀔 때 거기로 동기화한다.
  // transformShared가 있으면(edit.tsx) 그쪽을 대신 쓴다 — 둘 중 뭘 쓰든 아래
  // 파생값들은 항상 SharedValue만 읽으므로(참조는 매 렌더 ??로 고르지만 그
  // 안쪽 값 자체는 바뀌지 않음) 갈라치기 없이 하나의 코드 경로로 그린다.
  const internalX = useSharedValue(transform.x);
  const internalY = useSharedValue(transform.y);
  const internalScale = useSharedValue(transform.scale);
  const internalRotation = useSharedValue(transform.rotationDeg);
  useEffect(() => {
    if (!transformShared) {
      internalX.value = transform.x;
      internalY.value = transform.y;
      internalScale.value = transform.scale;
      internalRotation.value = transform.rotationDeg;
    }
  }, [transform, transformShared, internalX, internalY, internalScale, internalRotation]);
  const tx = transformShared?.x ?? internalX;
  const ty = transformShared?.y ?? internalY;
  const tScale = transformShared?.scale ?? internalScale;
  const tRotation = transformShared?.rotationDeg ?? internalRotation;

  // 캔버스 → 뷰 스케일. Skia Group은 캔버스 좌표(1080x1920)로 그리고 하나의 스케일로 축소.
  // contain=min(다 보이게, 여백 남음) / cover=max(캔버스 전체 기준 꽉 채움) /
  // cover-safe=max(안전 영역 기준, 시트에 안 가려진 높이만 채움). edit.tsx의 각인
  // 탭 히트테스트도 같은 computeFitTransform을 쓴다 — 계산이 어긋나면 안 된다.
  // early return(아래) 전에 계산해 두는 이유는 이 값들을 쓰는 groupTransform이
  // 훅(useDerivedValue)이라 early return 앞에 있어야 해서다.
  const { fitScale, offsetX, offsetY } = computeFitTransform(viewWidth, viewHeight, fit, bottomInset);

  // 시안과 동일: translate(cx+tx, cy+ty) rotate scale translate(-cx,-cy). tx/ty/
  // tScale/tRotation(SharedValue)의 .value만 갱신되면 이 배열 전체가 네이티브
  // 쪽에서 다시 계산된다 — edit.tsx가 드래그 중 React state를 안 거치고 이
  // 값들에 바로 쓰면(transformShared), Group 변형이 리렌더 없이 프레임마다
  // 갱신된다(진행률 애니메이션과 같은 경로). offsetX/offsetY/fitScale처럼
  // 참조하는 일반 값이 바뀌면(예: 화면 회전) Reanimated가 자동으로 감지해
  // 다시 계산한다(위 hotStartFraction 등과 같은 패턴, 별도 deps 배열 불필요).
  const groupTransform = useDerivedValue(() => [
    { translateX: offsetX },
    { translateY: offsetY },
    { scale: fitScale },
    { translateX: CANVAS_WIDTH / 2 + tx.value },
    { translateY: CANVAS_HEIGHT / 2 + ty.value },
    { rotate: (tRotation.value * Math.PI) / 180 },
    { scale: tScale.value },
    { translateX: -CANVAS_WIDTH / 2 },
    { translateY: -CANVAS_HEIGHT / 2 },
  ]);

  if (projected.length < 2) return <View style={{ width: viewWidth, height: viewHeight }} />;

  // 정지 상태(재생 버튼 안 누름)면 완성된 모습(진행률 1)을 보여준다 — 보관함
  // 썸네일이 "완성된 순간"만 보여주는 것과 같은 원칙.
  const stampProgressFraction = !playing ? 1 : uiStampProgress;
  // 실기기 피드백(2026-09): 드래그(이동·확대·회전) 중엔 Group 변형이 프레임마다
  // 바뀌어서 블러(Shadow)가 매 프레임 다시 계산된다 — 반경이 클수록(30~80px) 그
  // 비용이 커서 조작 중 끊김의 큰 원인이었다. 조작 중엔 블러 반경을 줄여 GPU 비용을
  // 낮추고, 손을 떼면(정지 상태) 원래 반경으로 돌아온다.
  //
  // 실기기 피드백(2026-09-02): 재생 "중"에도 — 조작 없이 가만히 보고만 있어도 —
  // 프레임이 뚝뚝 끊기고 그동안 프리셋 탭·터치까지 같이 느려졌다. 재생이 멈추면(그릴
  // 게 없으면) 전부 다시 빨라지는 것으로 봐서, 매 프레임 블러를 다시 계산하는 비용이
  // 터치를 처리하는 스레드까지 잡아먹고 있었다는 뜻 — 조작 중이 아니어도 블러를
  // 100%로 두지 않고 약 70%로 낮춘다("정지 상태"는 여기서 "재생도 안 하는 상태"를
  // 말한 게 아니라 "손을 뗐다"는 뜻이었을 뿐, 재생 자체의 비용은 그대로였다).
  const blurScale = isInteracting ? 0.4 : 0.7;

  const stampBounds = stampSelected ? computeStampBounds(run, stampConfig) : null;

  return (
    <View style={{ width: viewWidth, height: viewHeight }}>
      <Canvas style={{ flex: 1 }}>
        <Group transform={groupTransform}>
          {preset === 'segment-lighting' && (
            <SegmentLayer
              projected={projected}
              cumulative={cumulative}
              totalDistance={totalDistance}
              fullPath={fullPath}
              isInteracting={isInteracting}
              playing={playing}
              blurScale={blurScale}
              onProgressSample={setUiStampProgress}
            />
          )}
          {preset === 'light-runner' && (
            <LightRunnerLayer
              // 재생 버튼을 다시 누를 때마다(playToken 증가) 새로 마운트돼
              // 내부 Reanimated SharedValue(elapsed)가 0부터 다시 시작한다.
              key={playToken}
              projected={projected}
              cumulative={cumulative}
              totalDistance={totalDistance}
              fullPath={fullPath}
              rawFullPath={rawFullPath}
              isInteracting={isInteracting}
              playing={playing}
              blurScale={blurScale}
              onProgressSample={setUiStampProgress}
            />
          )}
          {preset === 'default-drawing' && (
            <DefaultDrawingLayer
              fullPath={fullPath}
              isInteracting={isInteracting}
              playing={playing}
              onProgressSample={setUiStampProgress}
            />
          )}
        </Group>
      </Canvas>

      {/* 안전 영역 가이드는 이 Svg에만 — 각인과 분리해 뒀다(바로 아래 각인 Svg
          설명 참고). Svg 자체는 항상 뷰 전체 크기로 두고(잘림 없음), 대신 Canvas
          Group과 똑같은 offsetX/offsetY/fitScale을 <G transform>으로 적용해서
          좌표만 맞춘다(뷰 밖으로 나가는 것 자체는 previewArea의 overflow:hidden이
          처리, 이건 의도된 동작). */}
      {showSafeAreaGuide && (
        <Svg style={{ position: 'absolute', top: 0, left: 0 }} width={viewWidth} height={viewHeight}>
          <G transform={`translate(${offsetX} ${offsetY}) scale(${fitScale})`}>
            <SafeAreaGuide />
          </G>
        </Svg>
      )}

      {/* 각인 텍스트(+선택 박스)는 안전 영역 가이드와 별도의 Svg — 실기기
          피드백(2026-09-02) "각인 옮기는 게 렉이 걸린다": 각인은 Skia가 아니라
          SVG라 SharedValue를 프레임마다 바로 읽는 길이 없다. 대신 이 Svg 전체를
          클래식 Animated.Value 두 개(stampDragOffset)로 감싼 Animated.View에
          넣어서, edit.tsx가 드래그 중 stampConfig(React state)를 안 건드리고
          이 값에 직접 쓰면(바텀시트 드래그와 같은 방식) 리렌더 없이 네이티브
          쪽에서만 위치가 움직인다. 손을 뗄 때만 실제 자리를 커밋한다. */}
      <Animated.View
        pointerEvents="none"
        style={[
          { position: 'absolute', top: 0, left: 0, width: viewWidth, height: viewHeight },
          stampDragOffset
            ? { transform: [{ translateX: stampDragOffset.x }, { translateY: stampDragOffset.y }] }
            : null,
        ]}>
        <Svg width={viewWidth} height={viewHeight}>
          <Defs>
            <Filter id="stampGlow" x="-100%" y="-100%" width="300%" height="300%">
              <FeGaussianBlur stdDeviation="6" result="b" />
              <FeMerge>
                <FeMergeNode in="b" />
                <FeMergeNode in="SourceGraphic" />
              </FeMerge>
            </Filter>
          </Defs>
          <G transform={`translate(${offsetX} ${offsetY}) scale(${fitScale})`}>
            <StampLayerSvg run={run} config={stampConfig} progressFraction={stampProgressFraction} />
            {stampBounds && (
              <SvgRect
                x={stampBounds.x}
                y={stampBounds.y}
                width={stampBounds.width}
                height={stampBounds.height}
                rx={16}
                stroke={GLOW}
                strokeWidth={3}
                strokeDasharray="10,8"
                fill="none"
              />
            )}
          </G>
        </Svg>
      </Animated.View>
    </View>
  );
}

// default-drawing — 시안 "plain" 그대로: 따뜻한 흰색 선, 글로우 없음(paint()의
// mode==='plain' 분기는 shadowBlur를 걸지 않는다). 다만 시안의 plain은 정지 화면이고
// FRD §6-1(경로 렌더링) "처음부터 선으로 그려져 나간다"는 애니메이션을 요구하므로
// 그리는 부분만 보여주되, 매 프레임 점을 다시 훑지 않도록 fullPath를 네이티브
// trim(start/end)으로 잘라 그린다(2026-09-01).
function DefaultDrawingLayer({
  fullPath,
  isInteracting,
  playing,
  onProgressSample,
}: {
  fullPath: ReturnType<typeof skPath>;
  isInteracting: boolean;
  playing: boolean;
  onProgressSample: (progress: number) => void;
}) {
  const progress = useUIThreadProgress(isInteracting, playing, onProgressSample);
  return (
    <Path
      path={fullPath}
      start={0}
      end={progress}
      style="stroke"
      strokeWidth={9}
      strokeCap="round"
      strokeJoin="round"
      color={LINE_WARM}
    />
  );
}

// 불빛 러너 — 시안 "glow" 알고리즘 이식(paint() mode!=='plain'/'seg' 분기). 시안은 캔버스
// 폭 ~345px 기준으로 T.w=3(선 두께)·shadowBlur 10/20/26을 쓴다 — 우리 Skia 캔버스는 최종
// 출력과 같은 1080px 폭이라 그 비율(~3.13배)로 스케일한 값을 쓴다. 옅은 원본 + 지나온
// 길(+글로우) + 최근 잔광(강한 글로우) + 머리 점, 순서로 쌓는다.
//
// 실기기 피드백(2026-09-02) "기본 드로잉/구간 점등도 여전히 느리다" — light-runner만
// Reanimated(UI 스레드)로 옮겨져 있었고, 나머지 둘은 아직 elapsed를 React state로 두고
// 매 프레임 setState → 리렌더 → Skia가 새 트리를 받는 왕복을 거쳤다(위 light-runner
// 주석과 같은 문제). 이 훅이 그 왕복을 없앤 "진행률" 하나를 세 프리셋이 공통으로
// 쓸 수 있게 뽑아낸 것 — light-runner는 targetDistance·잔광 등 자기만의 파생값이
// 많아 자기 것을 그대로 두고, DefaultDrawingLayer·SegmentLayer가 이걸 쓴다.
function useUIThreadProgress(
  isInteracting: boolean,
  playing: boolean,
  onProgressSample: (progress: number) => void
) {
  const elapsed = useSharedValue(0);
  const progress = useDerivedValue(() => Math.min(elapsed.value / DRAW_SECONDS, 1));

  const frameCallback = useFrameCallback((frameInfo) => {
    if (frameInfo.timeSincePreviousFrame === null) return;
    const delta = Math.min(0.1, frameInfo.timeSincePreviousFrame / 1000);
    elapsed.value = (elapsed.value + delta) % CYCLE_SECONDS;
  });

  useEffect(() => {
    frameCallback.setActive(!isInteracting && playing);
  }, [isInteracting, playing, frameCallback]);

  // 재생 버튼(2026-09-02): 정지 상태(playing=false)에선 완성된 모습을 보여주고
  // (light-runner와 같은 원칙), 재생을 누를 때마다(playing이 true로 바뀔 때)
  // 처음부터 다시 그린다 — light-runner처럼 key={playToken}으로 컴포넌트를
  // 통째로 다시 마운트시키지 않고, 이 훅 안에서 직접 elapsed를 리셋한다.
  useEffect(() => {
    elapsed.value = playing ? 0 : DRAW_SECONDS;
  }, [playing, elapsed]);

  // 각인(거리·시간·페이스) 카운트업 숫자는 매 프레임까지 정밀할 필요가 없다 — 대략
  // 30단계로만 낮춰서 JS 쪽에 넘긴다(light-runner와 같은 이유).
  useAnimatedReaction(
    () => Math.floor(progress.value * 30),
    (bucket, prevBucket) => {
      if (bucket !== prevBucket) {
        scheduleOnRN(onProgressSample, progress.value);
      }
    }
  );

  return progress;
}

// 실기기 피드백(2026-09-01) "html처럼 부드럽지 않다, 앱의 한계냐" — 한계가 아니라
// 구조 문제였다. 이전까지는 진행률(elapsed)을 React state로 두고 매 프레임 setState →
// 리렌더 → Skia가 새 트리를 받는 왕복을 거쳤다. 여기서는 진행률을 Reanimated
// SharedValue로 두고 useFrameCallback으로 UI 스레드에서 직접 갱신한다. Path의
// start/end, Circle의 cx/cy에 SharedValue를 그대로 넘기면(react-native-skia의
// Reanimated 연동) React 리렌더 없이 네이티브 쪽에서만 값이 갱신된다 — html의 raw
// canvas 루프에 가장 가까운 구조. 프리셋이 'light-runner'로 바뀔 때마다 이 컴포넌트가
// 새로 마운트되므로(부모의 preset 분기 렌더링), elapsed는 항상 0부터 새로 시작한다 —
// §3 "프리셋을 바꾸면 처음부터 재생" 규칙이 저절로 지켜진다.
function LightRunnerLayer({
  projected,
  cumulative,
  totalDistance,
  fullPath,
  rawFullPath,
  isInteracting,
  playing,
  blurScale,
  onProgressSample,
}: {
  projected: CanvasPoint[];
  cumulative: number[];
  totalDistance: number;
  fullPath: ReturnType<typeof skPath>;
  rawFullPath: ReturnType<typeof skPath>;
  isInteracting: boolean;
  playing: boolean;
  blurScale: number;
  onProgressSample: (progress: number) => void;
}) {
  const elapsed = useSharedValue(0);
  const progress = useDerivedValue(() => Math.min(elapsed.value / DRAW_SECONDS, 1));
  const targetDistance = useDerivedValue(() => totalDistance * progress.value);

  // 잔광 길이는 "총 거리의 비율"이 아니라 캔버스 픽셀 고정값을 쓴다(2026-09,
  // 실기기 피드백 — 머리 점은 매끄러운데 뒤따르는 잔광이 끊겨 보인다는 것). 경로마다
  // 총 캔버스 길이(굴곡·왕복 여부)가 달라서 "총 거리의 10%"는 경로마다 실제 화면
  // 픽셀 길이가 들쭉날쭉했다 — 고정 길이면 항상 같은 크기로 따라간다.
  const HOT_TRAIL_LENGTH_PX = 260;
  const hotStartFraction = useDerivedValue(() => {
    return totalDistance > 0 ? Math.max(0, targetDistance.value - HOT_TRAIL_LENGTH_PX) / totalDistance : 0;
  });
  const headX = useDerivedValue(() => pointAtDistance(targetDistance.value, projected, cumulative)?.x ?? 0);
  const headY = useDerivedValue(() => pointAtDistance(targetDistance.value, projected, cumulative)?.y ?? 0);
  // 완주(progress===1) 시점에 잔광·머리 점 → 굵은 정지 글로우로 층이 바뀐다. 매 프레임
  // 바뀌는 값이 아니라 두 상태 사이 전환이라, 엘리먼트를 마운트/언마운트하는 대신(그러면
  // React 리렌더가 다시 필요해진다) opacity로 켜고 끈다 — 항상 같은 엘리먼트 트리를 유지.
  const runningOpacity = useDerivedValue(() => (progress.value >= 1 ? 0 : 1));
  const completeOpacity = useDerivedValue(() => (progress.value >= 1 ? 1 : 0));

  const frameCallback = useFrameCallback((frameInfo) => {
    if (frameInfo.timeSincePreviousFrame === null) return;
    const delta = Math.min(0.1, frameInfo.timeSincePreviousFrame / 1000);
    elapsed.value = (elapsed.value + delta) % CYCLE_SECONDS;
  });

  useEffect(() => {
    frameCallback.setActive(!isInteracting && playing);
  }, [isInteracting, playing, frameCallback]);

  // 재생 버튼(2026-09-02): 정지 상태에선 완성된 모습(정지 글로우)을 보여준다 —
  // key={playToken}로 재생을 다시 누를 때마다 이 컴포넌트가 통째로 새로
  // 마운트되어 elapsed가 0부터 시작하지만, "정지"로 바뀌는 순간에는 마운트가
  // 그대로 유지되므로(멈춘 자리에 얼어붙지 않고) elapsed를 완주 지점으로
  // 직접 옮겨 다른 두 프리셋과 같은 "정지=완성" 원칙을 지킨다.
  useEffect(() => {
    if (!playing) {
      elapsed.value = DRAW_SECONDS;
    }
  }, [playing, elapsed]);

  // 각인(거리·시간·페이스) 카운트업 숫자는 매 프레임까지 정밀할 필요가 없다 — 대략
  // 30단계(진행률 0→1 구간을 30칸으로 나눈 정도)로만 낮춰서 JS 쪽에 넘긴다. Skia
  // 캔버스 자체(아래 SharedValue들)는 이 동기화와 무관하게 계속 UI 스레드에서 그려진다.
  useAnimatedReaction(
    () => Math.floor(progress.value * 30),
    (bucket, prevBucket) => {
      if (bucket !== prevBucket) {
        scheduleOnRN(onProgressSample, progress.value);
      }
    }
  );

  return (
    <Group>
      <Path path={rawFullPath} style="stroke" strokeWidth={4.5} color={GHOST} />
      <Path path={fullPath} style="stroke" strokeWidth={7} strokeCap="round" strokeJoin="round" color={BASE} />
      <Path
        path={fullPath}
        start={0}
        end={progress}
        style="stroke"
        strokeWidth={9}
        strokeCap="round"
        strokeJoin="round"
        color={TRAVELED}>
        <Shadow dx={0} dy={0} blur={30 * blurScale} color={GLOW} />
      </Path>
      <Path
        path={fullPath}
        start={hotStartFraction}
        end={progress}
        style="stroke"
        strokeWidth={12}
        strokeCap="round"
        strokeJoin="round"
        color={LINE_WARM}
        opacity={runningOpacity}>
        <Shadow dx={0} dy={0} blur={60 * blurScale} color={GLOW} />
      </Path>
      <Path
        path={fullPath}
        style="stroke"
        strokeWidth={13}
        strokeCap="round"
        strokeJoin="round"
        color={LINE_WARM}
        opacity={completeOpacity}>
        <Shadow dx={0} dy={0} blur={60 * blurScale} color={GLOW} />
      </Path>
      <Circle cx={headX} cy={headY} r={16} color="#FFFFFF" opacity={runningOpacity}>
        <Shadow dx={0} dy={0} blur={80 * blurScale} color={GLOW} />
      </Circle>
    </Group>
  );
}

// 시안 "seg": 옅은 전체 경로 위에 구간마다(완료=밝게, 그리는 중=중간) 쌓고,
// 방금 완료된 구간일수록 반짝인다.
// 실기기 피드백(2026-09-02): light-runner만 UI 스레드(Reanimated)로 옮겨져 있어서
// 구간 점등은 여전히 매 프레임 JS state(progressFraction)가 바뀔 때마다 이 함수
// 전체가 다시 불려 도형 배열을 통째로 새로 만들었다 — 셋 중 가장 무거운 경로였다.
// 구간 하나하나의 end/opacity/strokeWidth/blur를 각자의 Reanimated 파생값으로
// 만들어 두면, 진행률이 바뀌어도 네이티브 쪽에서만 값이 갱신되고 이 컴포넌트
// 자체는 다시 렌더링될 필요가 없다(light-runner와 같은 원리).
//
// 구간 개수(segmentCount)는 경로 길이에 따라 달라지는데, 컴포넌트 안에서 훅을
// 개수만큼 반복 호출(.map 등)하면 React 훅 규칙을 어긴다 — 매 렌더 훅 호출 수가
// 같아야 한다는 규칙은 여기선 "이 라우트가 살아있는 동안 segmentCount가 안
// 바뀐다"고 보장할 수 없어서(다듬기 세기를 바꾸면 totalDistance가 바뀌고,
// segmentCount도 같이 바뀔 수 있다) 실제로 위험하다. 그래서 넉넉한 고정 칸수
// (MAX_SEGMENTS)만큼 항상 훅을 부르고, 실제 구간 수를 넘는 칸은 안 그린다
// (opacity 0 등으로) — FRD §6-3 목표(점등 5~8회)를 크게 웃도는 값이다.
const MAX_SEGMENTS = 12;

function useSegmentReactiveProps(
  progress: ReturnType<typeof useSharedValue<number>>,
  segStartFraction: number,
  segEndFraction: number,
  blurScale: number,
  active: boolean
) {
  const end = useDerivedValue(() => {
    if (!active) return segStartFraction;
    const p = progress.value;
    if (p <= segStartFraction) return segStartFraction;
    return Math.min(p, segEndFraction);
  }, [active, segStartFraction, segEndFraction]);
  const opacity = useDerivedValue(() => {
    if (!active) return 0;
    return progress.value >= segEndFraction ? 0.95 : 0.5;
  }, [active, segEndFraction]);
  const strokeWidth = useDerivedValue(() => {
    if (!active) return 10;
    const p = progress.value;
    if (p < segEndFraction) return 10;
    const justLit = Math.max(0, 1 - (p - segEndFraction) * 14);
    return 10 + justLit * 4;
  }, [active, segEndFraction]);
  const blur = useDerivedValue(() => {
    if (!active) return 0;
    const p = progress.value;
    if (p < segEndFraction) return 0;
    const justLit = Math.max(0, 1 - (p - segEndFraction) * 14);
    return (45 + justLit * 65) * blurScale;
  }, [active, segEndFraction, blurScale]);
  const dotR = useDerivedValue(() => {
    if (!active) return 0;
    const p = progress.value;
    if (p < segEndFraction) return 0;
    const justLit = Math.max(0, 1 - (p - segEndFraction) * 14);
    return 4 + justLit * 3;
  }, [active, segEndFraction]);
  const dotOpacity = useDerivedValue(() => {
    if (!active) return 0;
    return progress.value >= segEndFraction ? 1 : 0;
  }, [active, segEndFraction]);
  return { end, opacity, strokeWidth, blur, dotR, dotOpacity };
}

function SegmentLayer({
  projected,
  cumulative,
  totalDistance,
  fullPath,
  isInteracting,
  playing,
  blurScale,
  onProgressSample,
}: {
  projected: CanvasPoint[];
  cumulative: number[];
  totalDistance: number;
  fullPath: ReturnType<typeof skPath>;
  isInteracting: boolean;
  playing: boolean;
  blurScale: number;
  onProgressSample: (progress: number) => void;
}) {
  const progress = useUIThreadProgress(isInteracting, playing, onProgressSample);

  const unit = totalDistance > 0 ? segmentUnitMeters(totalDistance) : 1;
  const segmentCount = totalDistance > 0 ? Math.min(MAX_SEGMENTS, Math.ceil(totalDistance / unit)) : 0;

  // 구간 경계(거리·비율)는 totalDistance/unit이 바뀔 때만 다시 계산 — 매 프레임이 아니라
  // "다듬기 세기를 바꿨다" 같은 드문 경우에만 바뀐다.
  const bounds = useMemo(() => {
    const arr: { segStartFraction: number; segEndFraction: number; segEndDist: number; active: boolean }[] = [];
    for (let s = 0; s < MAX_SEGMENTS; s++) {
      const segStartDist = s * unit;
      const segEndDist = Math.min(totalDistance, (s + 1) * unit);
      arr.push({
        segStartFraction: totalDistance > 0 ? segStartDist / totalDistance : 0,
        segEndFraction: totalDistance > 0 ? segEndDist / totalDistance : 0,
        segEndDist,
        active: s < segmentCount,
      });
    }
    return arr;
  }, [unit, totalDistance, segmentCount]);

  // 점(boundary dot) 자리는 시간에 안 따라 바뀌는 값이라(어느 구간이 "막 켜졌는지"의
  // 잔광 정도만 바뀔 뿐, 점 자체의 캔버스 위치는 고정) 훅 없이 그냥 계산한다.
  const dotPositions = useMemo(
    () => bounds.map((b) => (b.active ? pointAtDistance(b.segEndDist, projected, cumulative) : undefined)),
    [bounds, projected, cumulative]
  );

  // MAX_SEGMENTS는 리터럴 상수라 이 12개 호출은 매 렌더 항상 정확히 12번, 같은
  // 순서로 실행된다(조건·반복문이 아니라 그냥 나열) — 실제 구간 수(segmentCount)가
  // 몇이든 안전하다. bounds[i]가 없을 수 없도록 위에서 항상 MAX_SEGMENTS개를
  // 채워 넣는다.
  const seg0 = useSegmentReactiveProps(progress, bounds[0].segStartFraction, bounds[0].segEndFraction, blurScale, bounds[0].active);
  const seg1 = useSegmentReactiveProps(progress, bounds[1].segStartFraction, bounds[1].segEndFraction, blurScale, bounds[1].active);
  const seg2 = useSegmentReactiveProps(progress, bounds[2].segStartFraction, bounds[2].segEndFraction, blurScale, bounds[2].active);
  const seg3 = useSegmentReactiveProps(progress, bounds[3].segStartFraction, bounds[3].segEndFraction, blurScale, bounds[3].active);
  const seg4 = useSegmentReactiveProps(progress, bounds[4].segStartFraction, bounds[4].segEndFraction, blurScale, bounds[4].active);
  const seg5 = useSegmentReactiveProps(progress, bounds[5].segStartFraction, bounds[5].segEndFraction, blurScale, bounds[5].active);
  const seg6 = useSegmentReactiveProps(progress, bounds[6].segStartFraction, bounds[6].segEndFraction, blurScale, bounds[6].active);
  const seg7 = useSegmentReactiveProps(progress, bounds[7].segStartFraction, bounds[7].segEndFraction, blurScale, bounds[7].active);
  const seg8 = useSegmentReactiveProps(progress, bounds[8].segStartFraction, bounds[8].segEndFraction, blurScale, bounds[8].active);
  const seg9 = useSegmentReactiveProps(progress, bounds[9].segStartFraction, bounds[9].segEndFraction, blurScale, bounds[9].active);
  const seg10 = useSegmentReactiveProps(progress, bounds[10].segStartFraction, bounds[10].segEndFraction, blurScale, bounds[10].active);
  const seg11 = useSegmentReactiveProps(progress, bounds[11].segStartFraction, bounds[11].segEndFraction, blurScale, bounds[11].active);
  const slots = [seg0, seg1, seg2, seg3, seg4, seg5, seg6, seg7, seg8, seg9, seg10, seg11];

  if (totalDistance <= 0) return null;

  return (
    <Group>
      <Path path={fullPath} style="stroke" strokeWidth={10} color={GHOST} />
      {slots.map((seg, s) => (
        <Path
          key={s}
          path={fullPath}
          start={bounds[s].segStartFraction}
          end={seg.end}
          style="stroke"
          strokeWidth={seg.strokeWidth}
          strokeCap="round"
          strokeJoin="round"
          opacity={seg.opacity}
          color={LINE_WARM}>
          <Shadow dx={0} dy={0} blur={seg.blur} color={GLOW} />
        </Path>
      ))}
      {slots.map((seg, s) => {
        const dot = dotPositions[s];
        if (!dot) return null;
        return (
          <Circle key={`dot-${s}`} cx={dot.x} cy={dot.y} r={seg.dotR} color={LINE_WARM} opacity={seg.dotOpacity}>
            <Shadow dx={0} dy={0} blur={60 * blurScale} color={GLOW} />
          </Circle>
        );
      })}
    </Group>
  );
}

// §7-1: 인스타 스토리 UI가 가리는 상하단. 기본 숨김, 편집 화면의 토글 버튼으로만 켠다
// (실기기 피드백 2026-09: 항상 떠 있으면 채움이든 점선이든 거슬린다는 지적 — 필요할
// 때만 눌러서 확인하는 것으로 바꿨다). 결과물엔 어차피 안 나온다.
//
// 경계선뿐 아니라 실제 인스타 스토리 UI(프로필·닫기, 답장 입력창) 모양을 점선
// 아웃라인으로 흉내 내서, 막연히 "위아래 몇 %"가 아니라 뭐가 거기 있는지 보여준다.
function SafeAreaGuide() {
  const topY = CANVAS_HEIGHT * SAFE_AREA_TOP_RATIO;
  const bottomY = CANVAS_HEIGHT * (1 - SAFE_AREA_BOTTOM_RATIO);
  const stroke = 'rgba(255,140,90,0.95)';
  const strokeWidth = 4;
  const dash = '10,8';
  const commonProps = { stroke, strokeWidth, strokeDasharray: dash, fill: 'none' as const };

  // 실기기 피드백(2026-09-02): 밝은 배경 사진 위에서 점선이 흐려 보였다 — 각인
  // 텍스트(glowText)와 같은 방식으로, 굵은 검정 아웃라인을 먼저 깔고 그 위에 밝은
  // 점선을 겹쳐서 배경 밝기와 무관하게 항상 또렷하게 보이도록 했다.
  const backerProps = {
    stroke: 'rgba(11,13,16,0.85)',
    strokeWidth: strokeWidth + 3,
    strokeDasharray: dash,
    fill: 'none' as const,
  };

  const avatarCx = 70;
  const avatarCy = 68;
  const avatarR = 28;

  const closeCx = CANVAS_WIDTH - 60;
  const closeCy = avatarCy;
  const closeR = 16;

  const replyWidth = CANVAS_WIDTH - 220;
  const replyHeight = 76;
  const replyX = (CANVAS_WIDTH - replyWidth) / 2;
  const replyY = CANVAS_HEIGHT - 140;

  return (
    <>
      {/* 경계선 — 정확한 안전 영역 기준선 */}
      <Line x1={0} y1={topY} x2={CANVAS_WIDTH} y2={topY} {...backerProps} />
      <Line x1={0} y1={topY} x2={CANVAS_WIDTH} y2={topY} {...commonProps} />
      <Line x1={0} y1={bottomY} x2={CANVAS_WIDTH} y2={bottomY} {...backerProps} />
      <Line x1={0} y1={bottomY} x2={CANVAS_WIDTH} y2={bottomY} {...commonProps} />

      {/* 상단 — 프로필(아바타+이름 바)과 닫기 버튼 자리 */}
      <SvgCircle cx={avatarCx} cy={avatarCy} r={avatarR} {...backerProps} />
      <SvgCircle cx={avatarCx} cy={avatarCy} r={avatarR} {...commonProps} />
      <SvgRect
        x={avatarCx + avatarR + 18}
        y={avatarCy - 15}
        width={240}
        height={30}
        rx={15}
        {...backerProps}
      />
      <SvgRect
        x={avatarCx + avatarR + 18}
        y={avatarCy - 15}
        width={240}
        height={30}
        rx={15}
        {...commonProps}
      />
      <SvgCircle cx={closeCx} cy={closeCy} r={closeR} {...backerProps} />
      <SvgCircle cx={closeCx} cy={closeCy} r={closeR} {...commonProps} />
      <Line
        x1={closeCx - 8}
        y1={closeCy - 8}
        x2={closeCx + 8}
        y2={closeCy + 8}
        stroke={backerProps.stroke}
        strokeWidth={backerProps.strokeWidth}
      />
      <Line
        x1={closeCx - 8}
        y1={closeCy - 8}
        x2={closeCx + 8}
        y2={closeCy + 8}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
      <Line
        x1={closeCx + 8}
        y1={closeCy - 8}
        x2={closeCx - 8}
        y2={closeCy + 8}
        stroke={backerProps.stroke}
        strokeWidth={backerProps.strokeWidth}
      />
      <Line
        x1={closeCx + 8}
        y1={closeCy - 8}
        x2={closeCx - 8}
        y2={closeCy + 8}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />

      {/* 하단 — 답장 입력창 자리 */}
      <SvgRect x={replyX} y={replyY} width={replyWidth} height={replyHeight} rx={replyHeight / 2} {...backerProps} />
      <SvgRect x={replyX} y={replyY} width={replyWidth} height={replyHeight} rx={replyHeight / 2} {...commonProps} />
    </>
  );
}

/** 숫자 크게 + 단위 작게(예: "5.23"+" km")처럼 한 줄을 서로 다른 크기로 이어 그릴 때 쓴다. */
type StampTextPart = { text: string; size: number };

type StampTextDescriptor = {
  key: string;
  x: number;
  y: number;
  /** 대표 크기 — 윤곽선 두께·바운즈 추정에 쓴다. parts가 있으면 그중 가장 큰 값. */
  size: number;
  family: string;
  /** 순수 텍스트(바운즈 폭 추정 폴백용) — parts가 있으면 부분 텍스트를 이어붙인 것과 같다. */
  text: string;
  anchor: 'start' | 'middle' | 'end';
  /** 있으면 이 부분들을 각각 다른 크기로 한 줄에 이어 그린다(숫자+단위 등). 없으면 text 전체를 size로. */
  parts?: StampTextPart[];
  /** 실물 사진 참고(2026-09-02): "TIME"·"08.21" 같은 라벨/날짜는 값보다 흐리게 — 카드·분할·
   * 격자 프리셋에서 라벨과 값을 구분하는 데 쓴다. row/hero/stack엔 없음(전부 밝은 톤). */
  muted?: boolean;
};

/** 카드·격자 프리셋의 통계 칸 위 라벨. */
const STAT_LABEL: Record<StampItem, string> = {
  distance: 'DIST',
  time: 'TIME',
  pace: 'PACE',
  heartRate: 'BPM',
  date: 'DATE',
  place: 'PLACE',
};

/** 카드 프리셋의 배경, 격자 프리셋의 구분선처럼 텍스트가 아닌 도형. */
type StampRectDescriptor = {
  key: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rx: number;
  /** 'glass' 프리셋의 옅은 테두리 등 — 없으면 안 그린다. */
  stroke?: string;
  /** 기본은 어두운 카드 채움(card/glass 배경). 구분선(bar/line)·레일 선(rail)처럼
   * 다른 색이 필요하면 지정한다. */
  fill?: string;
};

// "5.23km" → "5.23"(큰 숫자) + " km"(작은 단위), "5'42\"/km" → "5'42\"" + " /km"처럼
// 끝의 단위 글자를 작게 떼어 그린다 — "28:14"·"08.21"처럼 끝에 글자가 없으면 그대로 둔다.
// 실물 사진 참고(2026-09-02): 히어로 숫자를 캡션 위 큰 숫자 + 옆에 작은 단위로 바꿔 달라는
// 요청.
function splitHeroValue(text: string, size: number): StampTextPart[] {
  const m = text.match(/^(.*?)(\/?[a-zA-Z%]+)$/);
  if (!m || !m[1]) return [{ text, size }];
  return [
    { text: m[1], size },
    { text: ` ${m[2]}`, size: size * 0.42 },
  ];
}

// route-rendering FRD §7: 넷을 다 새긴다, 심박은 데이터 있을 때만, 항목별로 끈다.
// §7-3: "항상"은 진행률 카운트업, "완성 후만"은 정지 구간에만. 거리는 기록된 총 거리 기준.
//
// StampLayerSvg(그리기)와 computeStampBounds(탭 히트테스트·선택 박스)가 같은 좌표
// 계산을 나눠 갖고 있으면 둘이 조용히 어긋나기 쉬워서, 실제 위치·크기 계산은 여기
// 한 곳에만 두고 둘 다 이 함수를 부른다(2026-09-02, 각인 탭-선택 기능 추가하며 분리).
function stampLayoutDescriptors(
  run: RunRecord,
  config: StampConfig,
  progressFraction: number
): { texts: StampTextDescriptor[]; rects: StampRectDescriptor[] } {
  const isComplete = progressFraction >= 1;
  if (config.mode === 'hidden') return { texts: [], rects: [] };
  if (config.mode === 'after' && !isComplete) return { texts: [], rects: [] };

  const enabled = config.enabled ?? ({} as StampConfig['enabled']);
  const has = (k: StampItem) => {
    if (k === 'heartRate') return !!enabled.heartRate && run.averageHeartRate !== undefined;
    if (k === 'place') return !!enabled.place && !!config.placeName;
    return !!enabled[k];
  };
  const value = (k: StampItem): string => {
    switch (k) {
      case 'distance':
        return formatDistanceKm(run.distanceMeters * progressFraction);
      case 'time':
        return formatDuration(run.durationSeconds * progressFraction);
      case 'pace':
        return formatPace(run.averagePaceSecPerKm);
      case 'date':
        return formatStampDate(run.date);
      case 'place':
        return config.placeName;
      case 'heartRate':
        return run.averageHeartRate !== undefined ? formatHeartRate(run.averageHeartRate) : '';
    }
  };

  const caption = (config.caption ?? '').trim();
  const layout: StampLayout = config.layout ?? 'row';
  const ALL_ITEMS: StampItem[] = ['distance', 'time', 'pace', 'date', 'place', 'heartRate'];
  const activeItems = ALL_ITEMS.filter(has);
  if (activeItems.length === 0 && !caption) return { texts: [], rects: [] };

  // 각인 묶음 크기 배율(§ StampConfig.scale) — 기본 자리(앵커 x/y)는 그대로 두고
  // 글자 크기·내부 간격에만 곱한다. 앵커 자체가 배율을 타면 크기를 키울 때마다
  // 자리가 같이 밀려서 "고정된 자리에서 커진다"는 감각이 깨진다.
  const s = config.scale ?? 1;
  const nodes: StampTextDescriptor[] = [];
  const rects: StampRectDescriptor[] = [];

  // 아래 6개(stack~line)는 디자인 프로젝트 "런 기록 카드 프리셋"의 2a~2f를 그대로
  // 옮긴 것이다(2026-09-02). 목업은 300x533 캔버스라 실제 캔버스(1080x1920)로
  // 옮길 때 M=3.6을 곱한다 — 여백·자리처럼 "고정 길이"는 M만, 글자 크기·내부
  // 간격처럼 "커지고 작아져야 하는 값"은 M*scale(u)을 곱했다. 세로 위치는 시안
  // 그대로(캔버스 맨 위/맨 아래 기준)가 아니라 안전 영역(§7-1) 기준으로 다시
  // 앵커했다 — 시안은 인스타 UI가 뭘 가리는지 고려 안 한 범용 목업이라, 그대로
  // 쓰면 상단/하단 UI에 가려질 수 있어서다. 정확한 폰트 메트릭이 아니라 근사
  // 배수(0.85/0.92/1.05 등)로 줄 간격을 쌓아서, 실기기에서 보고 미세 조정이
  // 필요할 수 있다.
  const M = 3.6;

  if (layout === 'stack') {
    // 2a "좌하단 스택" — 문구 → 큰 숫자(단위 작게) → 시간·페이스·BPM·날짜 한 줄,
    // 전부 왼쪽 아래 정렬.
    const u = M * s;
    const leftX = 24 * M + config.position.x;
    const bottomAnchor = CANVAS_HEIGHT * (1 - SAFE_AREA_BOTTOM_RATIO) - 20 + config.position.y;
    const heroKey = (['distance', 'time', 'pace'] as StampItem[]).find(has);
    const metaItems = activeItems.filter((item) => item !== heroKey);

    const metaFont = 12 * u;
    const heroSize = 58 * u;
    const titleFont = 13 * u;
    const rowGap = 10 * u;

    const metaBaseline = bottomAnchor;
    const heroBaseline = metaBaseline - rowGap - heroSize * 0.85;
    const captionBaseline = heroBaseline - heroSize * 0.3 - rowGap - titleFont * 0.85;

    if (metaItems.length > 0) {
      const metaGap = 14 * u;
      const charW = metaFont * 0.62;
      let cursorX = leftX;
      metaItems.forEach((item, i) => {
        const text = item === 'heartRate' ? `${value(item)}BPM` : value(item);
        nodes.push({ key: `meta-${i}`, x: cursorX, y: metaBaseline, size: metaFont, family: 'JetBrainsMono_500Medium', text, anchor: 'start' });
        cursorX += text.length * charW + metaGap;
      });
    }
    if (heroKey) {
      const heroText = value(heroKey);
      nodes.push({ key: 'hero', x: leftX, y: heroBaseline, size: heroSize, family: 'SpaceGrotesk_700Bold', text: heroText, anchor: 'start', parts: splitHeroValue(heroText, heroSize) });
    }
    if (caption) {
      nodes.push({ key: 'caption', x: leftX, y: captionBaseline, size: titleFont, family: 'SpaceGrotesk_500Medium', text: caption, anchor: 'start' });
    }
    return { texts: nodes, rects };
  }

  if (layout === 'bar') {
    // 2b "하단 스탯 바" — 문구+날짜 머리글, 구분선, 그 아래 4칸 통계(거리 칸이
    // 좀 더 넓다).
    const u = M * s;
    const leftX = 20 * M + config.position.x;
    const rightX = CANVAS_WIDTH - 20 * M + config.position.x;
    const bottomAnchor = CANVAS_HEIGHT * (1 - SAFE_AREA_BOTTOM_RATIO) - 24 * M + config.position.y;
    const dateText = has('date') ? value('date') : '';
    const statOrder = (['distance', 'time', 'pace', 'heartRate'] as StampItem[]).filter(has);
    const statWeight: Partial<Record<StampItem, number>> = { distance: 1.3, time: 1, pace: 1, heartRate: 0.9 };

    const headerFont = 15 * u;
    const dateFont = 11 * u;
    const labelFont = 9 * u;
    const dividerGap = 16 * u;
    const rowPadTop = 12 * u;

    const valueBaseline = bottomAnchor;
    const labelBaseline = valueBaseline - 22 * u * 1.15;
    const dividerY = labelBaseline - labelFont * 0.9 - rowPadTop;
    const headerBaseline = dividerY - dividerGap - headerFont * 0.3;

    if (caption) {
      nodes.push({ key: 'caption', x: leftX, y: headerBaseline, size: headerFont, family: 'SpaceGrotesk_700Bold', text: caption, anchor: 'start' });
    }
    if (dateText) {
      nodes.push({ key: 'date', x: rightX, y: headerBaseline, size: dateFont, family: 'JetBrainsMono_500Medium', text: dateText, anchor: 'end', muted: true });
    }
    if (caption || dateText) {
      rects.push({ key: 'divider', x: leftX, y: dividerY, width: rightX - leftX, height: Math.max(1, 1 * u), rx: 0, fill: 'rgba(255,255,255,0.28)' });
    }
    if (statOrder.length > 0) {
      const totalWeight = statOrder.reduce((sum, item) => sum + (statWeight[item] ?? 1), 0);
      const totalWidth = rightX - leftX;
      let cursorX = leftX;
      statOrder.forEach((item) => {
        const colWidth = ((statWeight[item] ?? 1) / totalWeight) * totalWidth;
        const isDist = item === 'distance';
        nodes.push({ key: `label-${item}`, x: cursorX, y: labelBaseline, size: labelFont, family: 'JetBrainsMono_500Medium', text: STAT_LABEL[item], anchor: 'start', muted: true });
        nodes.push({
          key: `value-${item}`,
          x: cursorX,
          y: valueBaseline,
          size: (isDist ? 22 : 18) * u,
          family: 'SpaceGrotesk_700Bold',
          text: value(item),
          anchor: 'start',
        });
        cursorX += colWidth;
      });
    }
    return { texts: nodes, rects };
  }

  if (layout === 'corner') {
    // 2c "코너 분산" — 위쪽 문구·날짜, 오른쪽에 시간·페이스·평균심박 스택,
    // 왼쪽 아래에 큰 숫자. 네 군데에 정보를 흩어놓는 구성.
    const u = M * s;
    const topLeftX = 24 * M + config.position.x;
    const topRightX = CANVAS_WIDTH - 24 * M + config.position.x;
    const headerFont = 13 * u;
    const headerBaseline = CANVAS_HEIGHT * SAFE_AREA_TOP_RATIO + 24 * M + headerFont * 0.85 + config.position.y;

    if (caption) {
      nodes.push({ key: 'caption', x: topLeftX, y: headerBaseline, size: headerFont, family: 'SpaceGrotesk_700Bold', text: caption, anchor: 'start' });
    }
    const dateText = has('date') ? value('date') : '';
    if (dateText) {
      nodes.push({ key: 'date', x: topRightX, y: headerBaseline, size: 11 * u, family: 'JetBrainsMono_500Medium', text: dateText, anchor: 'end', muted: true });
    }

    const statItems = (['time', 'pace', 'heartRate'] as StampItem[]).filter(has);
    if (statItems.length > 0) {
      const labelFont = 9 * u;
      const valueFont = 19 * u;
      const rowGap = 14 * u;
      let cursorY = headerBaseline + 72 * M; // 시안 top:96 - top:24
      statItems.forEach((item, i) => {
        const labelY = cursorY + labelFont * 0.85;
        const valueY = labelY + valueFont * 1.05;
        const label = item === 'heartRate' ? 'AVG BPM' : STAT_LABEL[item];
        nodes.push({ key: `stat-label-${i}`, x: topRightX, y: labelY, size: labelFont, family: 'JetBrainsMono_500Medium', text: label, anchor: 'end', muted: true });
        nodes.push({ key: `stat-value-${i}`, x: topRightX, y: valueY, size: valueFont, family: 'SpaceGrotesk_700Bold', text: value(item), anchor: 'end' });
        cursorY = valueY + rowGap;
      });
    }

    const heroKey = (['distance', 'time', 'pace'] as StampItem[]).find(has);
    if (heroKey) {
      const heroSize = 66 * u;
      const heroBaseline = CANVAS_HEIGHT * (1 - SAFE_AREA_BOTTOM_RATIO) - 20 + config.position.y;
      const heroText = value(heroKey);
      nodes.push({
        key: 'hero',
        x: 22 * M + config.position.x,
        y: heroBaseline,
        size: heroSize,
        family: 'SpaceGrotesk_700Bold',
        text: heroText,
        anchor: 'start',
        parts: splitHeroValue(heroText, heroSize),
      });
    }
    return { texts: nodes, rects };
  }

  if (layout === 'glass') {
    // 2d "글래스 플레이트" — 반투명 유리판 카드. SVG엔 backdrop-filter blur가
    // 없어 반투명 채우기 + 옅은 테두리로 근사한다.
    const u = M * s;
    const heroKey = (['distance', 'time', 'pace'] as StampItem[]).find(has);
    const statItems = activeItems.filter((item) => item !== heroKey && item !== 'date');
    const dateText = has('date') ? value('date') : '';
    const hasHeader = !!caption || !!dateText;

    const padX = 20 * u;
    const padY = 20 * u;
    const gap = 14 * u;
    const headerFont = 13 * u;
    const heroSize = 46 * u;
    const labelFont = 9 * u;
    const valueFont = 16 * u;
    const colGap = 20 * u; // 통계 칸 사이 최소 간격(겹침 방지)

    const headerLineH = hasHeader ? headerFont * 1.3 : 0;
    const heroLineH = heroKey ? heroSize * 1.05 : 0;
    const statLineH = statItems.length > 0 ? labelFont * 1.3 + valueFont * 1.15 : 0;
    let inner = headerLineH;
    if (heroKey) inner += (hasHeader ? gap : 0) + heroLineH;
    if (statItems.length > 0) inner += (heroKey ? gap : hasHeader ? gap : 0) + statLineH;
    const panelHeight = inner + padY * 2;

    // 실기기 피드백(2026-09-02): 통계 칸을 고정 폭으로 균등 분할했더니 "장소"처럼
    // 값이 긴 항목이 옆 칸("페이스")과 겹쳐 보였다. 칸마다 실제 글자 폭(추정)만큼만
    // 차지하고 그 뒤에 최소 간격을 두는 커서 방식으로 바꿔서 절대 안 겹치게 한다.
    // 그 대신 항목이 많거나 값이 아주 길면 패널이 원래 여백보다 넓어질 수 있다 —
    // 겹치는 것보다는 낫다는 판단.
    const statWidths = statItems.map((item) => {
      const labelW = STAT_LABEL[item].length * labelFont * 0.62;
      const valueW = value(item).length * valueFont * 0.62;
      return Math.max(labelW, valueW);
    });
    const statRowWidth = statWidths.reduce((a, b) => a + b, 0) + colGap * Math.max(0, statItems.length - 1);

    const nominalContentWidth = CANVAS_WIDTH - 32 * M - padX * 2;
    const contentWidth = Math.max(nominalContentWidth, statRowWidth);
    const panelWidth = contentWidth + padX * 2;

    const panelLeft = 16 * M + config.position.x;
    const panelRight = panelLeft + panelWidth;
    const panelBottom = CANVAS_HEIGHT * (1 - SAFE_AREA_BOTTOM_RATIO) - 4 + config.position.y;
    const panelTop = panelBottom - panelHeight;

    rects.push({
      key: 'glass-bg',
      x: panelLeft,
      y: panelTop,
      width: panelWidth,
      height: panelHeight,
      rx: 18 * u,
      stroke: 'rgba(255,255,255,0.14)',
    });

    let cursor = panelTop + padY;
    if (hasHeader) {
      cursor += headerFont * 0.85;
      if (caption) {
        nodes.push({ key: 'caption', x: panelLeft + padX, y: cursor, size: headerFont, family: 'SpaceGrotesk_700Bold', text: caption, anchor: 'start' });
      }
      if (dateText) {
        nodes.push({ key: 'date', x: panelRight - padX, y: cursor, size: 11 * u, family: 'JetBrainsMono_500Medium', text: dateText, anchor: 'end', muted: true });
      }
    }
    if (heroKey) {
      cursor += (hasHeader ? gap : 0) + heroSize * 0.92;
      const heroText = value(heroKey);
      nodes.push({
        key: 'hero',
        x: panelLeft + padX,
        y: cursor,
        size: heroSize,
        family: 'SpaceGrotesk_700Bold',
        text: heroText,
        anchor: 'start',
        parts: splitHeroValue(heroText, heroSize),
      });
    }
    if (statItems.length > 0) {
      cursor += (heroKey ? gap : hasHeader ? gap : 0) + labelFont * 0.85;
      const valueY = cursor + valueFont * 1.05;
      let colX = panelLeft + padX;
      statItems.forEach((item, i) => {
        nodes.push({ key: `stat-label-${item}`, x: colX, y: cursor, size: labelFont, family: 'JetBrainsMono_500Medium', text: STAT_LABEL[item], anchor: 'start', muted: true });
        nodes.push({ key: `stat-value-${item}`, x: colX, y: valueY, size: valueFont, family: 'SpaceGrotesk_700Bold', text: value(item), anchor: 'start' });
        colX += statWidths[i] + colGap;
      });
    }
    return { texts: nodes, rects };
  }

  if (layout === 'rail') {
    // 2e "사이드 레일" — 왼쪽 끝에 세로 네온 선, 그 옆에 거리·시간·페이스·평균심박·
    // 날짜를 위아래로 쌓는다(거리만 크게). 문구는 오른쪽 아래.
    const u = M * s;
    const railPadLeft = 22 * M;
    const labelFont = 9 * u;
    const distValueFont = 34 * u;
    const otherValueFont = 20 * u;
    const rowGap = 18 * u;

    const rows: { label: string; text: string; big?: boolean }[] = [];
    if (has('distance')) rows.push({ label: 'DISTANCE', text: value('distance'), big: true });
    if (has('time')) rows.push({ label: 'TIME', text: value('time') });
    if (has('pace')) rows.push({ label: 'PACE', text: value('pace') });
    if (has('heartRate')) rows.push({ label: 'AVG BPM', text: value('heartRate') });
    if (has('date')) rows.push({ label: 'DATE', text: value('date') });

    if (rows.length > 0) {
      const rowHeights = rows.map((r) => labelFont * 1.2 + (r.big ? distValueFont : otherValueFont) * 1.05);
      const totalHeight = rowHeights.reduce((a, b) => a + b, 0) + rowGap * (rows.length - 1);
      const railTop = CANVAS_HEIGHT / 2 - totalHeight / 2 + config.position.y;
      const railX = config.position.x;
      rects.push({ key: 'rail-line', x: railX, y: railTop, width: 3 * u, height: totalHeight, rx: 0, fill: GLOW });

      let cursorY = railTop;
      rows.forEach((r, i) => {
        const valueFont = r.big ? distValueFont : otherValueFont;
        const labelY = cursorY + labelFont * 0.85;
        const valueY = labelY + valueFont * 0.95;
        nodes.push({ key: `rail-label-${i}`, x: railX + railPadLeft, y: labelY, size: labelFont, family: 'JetBrainsMono_500Medium', text: r.label, anchor: 'start', muted: true });
        nodes.push({ key: `rail-value-${i}`, x: railX + railPadLeft, y: valueY, size: valueFont, family: 'SpaceGrotesk_700Bold', text: r.text, anchor: 'start' });
        cursorY += rowHeights[i] + rowGap;
      });
    }
    if (caption) {
      nodes.push({
        key: 'caption',
        x: CANVAS_WIDTH - 22 * M + config.position.x,
        y: CANVAS_HEIGHT * (1 - SAFE_AREA_BOTTOM_RATIO) - 20 + config.position.y,
        size: 13 * u,
        family: 'SpaceGrotesk_700Bold',
        text: caption,
        anchor: 'end',
      });
    }
    return { texts: nodes, rects };
  }

  if (layout === 'line') {
    // 2f "원 라인" — 문구(크게) 아래 짧은 구분선, 그 아래 통계를 한 줄 문자열로
    // 이어붙인다. 전부 가운데 정렬.
    const u = M * s;
    const centerX = CANVAS_WIDTH / 2 + config.position.x;
    const bottomAnchor = CANVAS_HEIGHT * (1 - SAFE_AREA_BOTTOM_RATIO) - 30 * M + config.position.y;
    const gap = 12 * u;
    const oneLineFont = 11 * u;
    const titleFont = 26 * u;
    const dividerW = 28 * u;

    // 시안의 oneLine 템플릿("{{d}} KM · {{t}} · {{pc}}/KM · {{b}} BPM · {{dt}}")을
    // 근사 — 정확한 대소문자·구분자 재조합 대신 이미 포맷된 값을 그대로 이어붙인다.
    const parts = ([] as string[]).concat(
      has('distance') ? [value('distance').toUpperCase()] : [],
      has('time') ? [value('time')] : [],
      has('pace') ? [value('pace').toUpperCase()] : [],
      has('heartRate') ? [value('heartRate').toUpperCase()] : [],
      has('date') ? [value('date')] : []
    );
    const oneLine = parts.join(' · ');

    const oneLineBaseline = bottomAnchor;
    const dividerY = oneLineBaseline - oneLineFont * 1.3 - gap;
    const titleBaseline = dividerY - gap - titleFont * 0.85;

    if (oneLine) {
      nodes.push({ key: 'oneLine', x: centerX, y: oneLineBaseline, size: oneLineFont, family: 'JetBrainsMono_500Medium', text: oneLine, anchor: 'middle' });
      rects.push({ key: 'divider', x: centerX - dividerW / 2, y: dividerY, width: dividerW, height: Math.max(1, 2 * u), rx: 0, fill: 'rgba(255,255,255,0.5)' });
    }
    if (caption) {
      nodes.push({ key: 'caption', x: centerX, y: titleBaseline, size: titleFont, family: 'SpaceGrotesk_700Bold', text: caption, anchor: 'middle' });
    }
    return { texts: nodes, rects };
  }

  // 'row' — 가운데 한 줄 + 문구는 그 위에.
  const centerX = CANVAS_WIDTH / 2 + config.position.x;
  const baseY = STAMP_DEFAULT_Y + config.position.y;
  const items = activeItems.map(value);

  if (caption) {
    nodes.push({
      key: 'caption',
      x: centerX,
      y: baseY - 58 * s,
      size: 34 * s,
      family: 'SpaceGrotesk_500Medium',
      text: caption,
      anchor: 'middle',
    });
  }
  if (items.length > 0) {
    const fontSize = 28 * s;
    const gap = 22 * s;
    const charWidth = fontSize * 0.62;
    const widths = items.map((str) => str.length * charWidth);
    const totalWidth = widths.reduce((a, b) => a + b, 0) + gap * (items.length - 1);
    let cursorX = centerX - totalWidth / 2;
    items.forEach((text, i) => {
      nodes.push({
        key: `item-${i}`,
        x: cursorX,
        y: baseY,
        size: fontSize,
        family: 'JetBrainsMono_700Bold',
        text,
        anchor: 'start',
      });
      cursorX += widths[i] + gap;
    });
  }

  return { texts: nodes, rects };
}

export function StampLayerSvg({
  run,
  config,
  progressFraction,
}: {
  run: RunRecord;
  config: StampConfig;
  progressFraction: number;
}) {
  const { texts, rects } = stampLayoutDescriptors(run, config, progressFraction);
  if (texts.length === 0 && rects.length === 0) return null;

  // row/hero는 밝은 글씨만으로는 밝은 배경 사진 위에서 흐려 보인다는 실기기
  // 피드백(2026-09)으로 어두운 아웃라인(두꺼운 stroke) + 별도 블러 사본을 겹치는
  // 강한 처리를 쓴다. 반면 나머지 6개(디자인 2a~2f를 그대로 옮긴 것)는 원본이
  // 옅은 text-shadow 하나뿐인데 그 강한 처리를 그대로 씌웠더니 "안쪽만 빛나고
  // 겉은 새까맣다"는 피드백(2026-09-02) — 원본만큼 옅은, 흐릿한 그림자 하나만
  // 깔고 굵은 외곽선 없이 또렷한 글씨를 올리는 쪽으로 나눴다.
  const softShadow = !['row', 'hero'].includes(config.layout ?? 'row');

  return (
    <>
      {/* 도형(카드 배경·구분선)이 글씨보다 먼저 — 뒤에 깔린다. */}
      {rects.map((r) => (
        <SvgRect
          key={r.key}
          x={r.x}
          y={r.y}
          width={r.width}
          height={r.height}
          rx={r.rx}
          fill={r.fill ?? 'rgba(10,12,15,0.72)'}
          stroke={r.stroke}
          strokeWidth={r.stroke ? 1 : undefined}
        />
      ))}
      {texts.map((n) => {
        // parts가 있으면(예: 히어로 숫자 "5.23"+" km") 한 줄 안에서 TSpan으로 크기를
        // 나눠 그린다 — textAnchor는 SvgText(부모)에서 이어붙인 전체 줄 기준으로 적용된다.
        const content = n.parts
          ? n.parts.map((p, i) => (
              <TSpan key={i} fontSize={p.size}>
                {p.text}
              </TSpan>
            ))
          : n.text;
        const fill = n.muted ? 'rgba(255,243,236,0.5)' : LINE_WARM;
        if (softShadow) {
          // 원본의 옅은 text-shadow 근사 — 흐릿한 검정 사본(그림자) 하나 + 또렷한
          // 글씨. 두꺼운 외곽선(stroke)은 안 쓴다.
          return (
            <Fragment key={n.key}>
              <SvgText x={n.x} y={n.y} textAnchor={n.anchor} fontSize={n.size} fontFamily={n.family} fill="rgba(0,0,0,0.55)" filter="url(#stampGlow)">
                {content}
              </SvgText>
              <SvgText x={n.x} y={n.y} textAnchor={n.anchor} fontSize={n.size} fontFamily={n.family} fill={fill}>
                {content}
              </SvgText>
            </Fragment>
          );
        }
        return (
          <Fragment key={n.key}>
            <SvgText
              x={n.x}
              y={n.y}
              textAnchor={n.anchor}
              fontSize={n.size}
              fontFamily={n.family}
              fill="none"
              stroke="rgba(11,13,16,0.85)"
              strokeWidth={n.size * 0.24}>
              {content}
            </SvgText>
            <SvgText x={n.x} y={n.y} textAnchor={n.anchor} fontSize={n.size} fontFamily={n.family} fill={fill} filter="url(#stampGlow)">
              {content}
            </SvgText>
          </Fragment>
        );
      })}
    </>
  );
}

export type CanvasRect = { x: number; y: number; width: number; height: number };

// 실기기 피드백(2026-09-02): 각인도 드로잉처럼 화면에서 직접 탭해 고르고
// 끌기·핀치로 위치·크기를 바꿀 수 있게 해달라는 요청 — edit.tsx가 탭 지점이
// 각인 위인지 판정(히트테스트)하고, 선택 중엔 이 사각형으로 점선 박스를 그린다.
// 진행률에 따라 숫자가 카운트업되며 폭이 미세하게 변하지만(예: "0.00km"→"5.23km")
// 자리·대략적인 크기는 거의 안 변하므로, 히트테스트·선택 박스 목적으로는 완주
// 시점(progressFraction=1) 값으로 고정 계산해도 충분하다 — 매 프레임 재계산할
// 필요가 없다.
export function computeStampBounds(run: RunRecord, config: StampConfig): CanvasRect | null {
  const { texts, rects } = stampLayoutDescriptors(run, config, 1);
  if (texts.length === 0 && rects.length === 0) return null;

  // 글자폭 추정치라 정확하진 않지만, 탭 히트박스는 넉넉한 편이 오히려 쓰기 좋다.
  let left = Infinity;
  let right = -Infinity;
  let top = Infinity;
  let bottom = -Infinity;
  for (const n of texts) {
    const width = n.parts
      ? n.parts.reduce((sum, p) => sum + p.text.length * p.size * 0.62, 0)
      : n.text.length * n.size * 0.62;
    const nodeLeft = n.anchor === 'middle' ? n.x - width / 2 : n.anchor === 'end' ? n.x - width : n.x;
    const nodeRight = nodeLeft + width;
    const nodeTop = n.y - n.size * 0.85; // 대략적인 ascent
    const nodeBottom = n.y + n.size * 0.3; // 대략적인 descent
    left = Math.min(left, nodeLeft);
    right = Math.max(right, nodeRight);
    top = Math.min(top, nodeTop);
    bottom = Math.max(bottom, nodeBottom);
  }
  // 카드 배경처럼 텍스트보다 더 넓게 퍼진 도형은 그 경계도 같이 반영한다 — 카드
  // 프리셋은 이 rects만으로도 사실상 정확한 바운즈가 나온다.
  for (const r of rects) {
    left = Math.min(left, r.x);
    right = Math.max(right, r.x + r.width);
    top = Math.min(top, r.y);
    bottom = Math.max(bottom, r.y + r.height);
  }
  const padding = 28;
  return {
    x: left - padding,
    y: top - padding,
    width: right - left + padding * 2,
    height: bottom - top + padding * 2,
  };
}

// route-thumbnail.tsx가 예전 이름으로 import 하던 것과의 호환.
export { StampLayerSvg as StampLayer };
