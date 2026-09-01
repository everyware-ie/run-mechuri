import { Canvas, Circle, Group, Path, Shadow, Skia } from '@shopify/react-native-skia';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { useAnimatedReaction, useDerivedValue, useFrameCallback, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import {
  Circle as SvgCircle,
  Rect as SvgRect,
  Line,
  Svg,
  Text as SvgText,
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

export type StampConfig = {
  /** §7-3 표시 타이밍. 시안 S6엔 UI가 없어(2026-09-01) 항상 'always' — 확인 노트 참고. */
  mode: StampMode;
  enabled: Record<StampItem, boolean>;
  /** 시안 S6 "한 줄 문구" — 결과물에 얹는 자유 텍스트 한 줄. 빈 문자열이면 안 그린다. */
  caption: string;
  /** '장소' 각인 값 — 트랙 좌표를 역지오코딩해 채운다(edit.tsx). 비면 장소 항목은 안 나온다. */
  placeName: string;
  /** 각인 묶음(문구 + 항목)은 하나의 묶음 — 위치 하나만 갖는다. 기본 자리(§7-5) 오프셋(캔버스 px). */
  position: { x: number; y: number };
};

export const IDENTITY_STAMP: StampConfig = {
  mode: 'always',
  enabled: { distance: true, time: true, pace: true, heartRate: true, date: true, place: true },
  caption: '',
  placeName: '',
  position: { x: 0, y: 0 },
};

// route-rendering FRD §7-5: 상단 14%·하단 20% 제안값 ("[확인 필요]" — 실기기 전까지 제안값).
const SAFE_AREA_TOP_RATIO = 0.14;
const SAFE_AREA_BOTTOM_RATIO = 0.2;
const STAMP_DEFAULT_Y = CANVAS_HEIGHT * (1 - SAFE_AREA_BOTTOM_RATIO) - 90;

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
const CYCLE_SECONDS = DRAW_SECONDS + HOLD_SECONDS;

// 시안 neon 테마 팔레트.
const LINE_WARM = '#FFF3EC';
const GLOW = '#FF5A2B';
const GHOST = 'rgba(237,241,245,0.13)';
const BASE = 'rgba(237,241,245,0.20)';
const TRAVELED = 'rgba(255,243,236,0.60)';

export type RouteTransform = { x: number; y: number; scale: number; rotationDeg: number };
export const IDENTITY_TRANSFORM: RouteTransform = { x: 0, y: 0, scale: 1, rotationDeg: 0 };

type Props = {
  points: Point[];
  preset: RoutePreset;
  transform: RouteTransform;
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
   * 'cover' — 화면을 꽉 채우고 넘치는 만큼 잘라낸다. 실제 내보내기는 이 화면
   * 크롭과 무관하게 항상 정확한 9:16 전체를 그린다(RouteRendererModule.swift가
   * 화면 크기가 아니라 CANVAS_WIDTH/HEIGHT 기준으로 따로 계산) — 편집 중
   * 미리보기에서만 화면을 꽉 채워 보여주는 표시 방식 차이일 뿐이다.
   */
  fit?: 'contain' | 'cover';
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
  smoothOptions,
  run,
  stampConfig,
  showSafeAreaGuide = false,
  isInteracting,
  viewWidth,
  viewHeight,
  fit = 'contain',
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

  const [elapsed, setElapsed] = useState(0);
  const frameRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const accumulatedRef = useRef(0);

  // light-runner의 각인(거리·시간·페이스) 카운트업 숫자용 — 캔버스 자체는
  // LightRunnerLayer 안의 SharedValue가 UI 스레드에서 그리므로 이 값과 무관하다.
  // 대략 30단계(≈33ms)마다만 낮춰서 받으므로 숫자가 튀지 않으면서도 JS 리렌더는
  // 훨씬 드물다.
  const [lightRunnerStampProgress, setLightRunnerStampProgress] = useState(0);

  // §3: 프리셋을 바꾸면 처음부터 재생 — prop이 바뀐 렌더에서 상태만 리셋(React 권장 패턴,
  // ref는 안 건드린다). 프레임 delta는 아래 tick에서 어차피 0.1초로 클램프한다.
  const [seenPreset, setSeenPreset] = useState(preset);
  if (seenPreset !== preset) {
    setSeenPreset(preset);
    setElapsed(0);
    setLightRunnerStampProgress(0);
  }

  // light-runner는 이 JS state 루프를 아예 안 쓴다 — 아래 LightRunnerLayer가
  // Reanimated로 UI 스레드에서 직접 돌린다(2026-09-01, "html처럼 안 부드럽다"는
  // 실기기 피드백). 여기서 계속 돌리면 안 보이는 애니메이션에 리소스만 낭비된다.
  useEffect(() => {
    if (isInteracting || preset === 'light-runner') {
      lastTsRef.current = null;
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      return;
    }
    const tick = (ts: number) => {
      if (lastTsRef.current !== null) {
        const delta = Math.min(0.1, (ts - lastTsRef.current) / 1000);
        accumulatedRef.current += delta;
        // 실기기 피드백(2026-09-01): requestAnimationFrame은 화면 주사율 그대로
        // 불린다 — ProMotion(120Hz) 기기에서는 이 애니메이션(Canvas 재구성 +
        // Shadow 블러 30~80px 여러 겹)이 초당 최대 120번 다시 그려졌다. 천천히
        // 진행되는 그리기 효과라 30fps로도 눈에 매끄러워서, state 갱신(=실제 다시
        // 그리는 시점)만 그 주기로 묶는다 — requestAnimationFrame 자체는 계속
        // 걸어서 화면 주사율과 무관하게 타이밍은 정확하게 유지한다.
        const FRAME_INTERVAL = 1 / 30;
        if (accumulatedRef.current >= FRAME_INTERVAL) {
          const applied = accumulatedRef.current;
          accumulatedRef.current = 0;
          setElapsed((prev) => (prev + applied) % CYCLE_SECONDS);
        }
      }
      lastTsRef.current = ts;
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [isInteracting, preset]);

  if (projected.length < 2) return <View style={{ width: viewWidth, height: viewHeight }} />;

  const progressFraction = Math.min(elapsed / DRAW_SECONDS, 1);
  const stampProgressFraction = preset === 'light-runner' ? lightRunnerStampProgress : progressFraction;
  // 실기기 피드백(2026-09): 드래그(이동·확대·회전) 중엔 Group 변형이 프레임마다
  // 바뀌어서 블러(Shadow)가 매 프레임 다시 계산된다 — 반경이 클수록(30~80px) 그
  // 비용이 커서 조작 중 끊김의 큰 원인이었다. 조작 중엔 블러 반경을 줄여 GPU 비용을
  // 낮추고, 손을 떼면(정지 상태) 원래 반경으로 돌아온다.
  const blurScale = isInteracting ? 0.4 : 1;

  // 캔버스 → 뷰 스케일. Skia Group은 캔버스 좌표(1080x1920)로 그리고 하나의 스케일로 축소.
  // contain=min(다 보이게, 여백 남음) / cover=max(꽉 채우고 넘치는 만큼 자름).
  const fitScale =
    fit === 'cover'
      ? Math.max(viewWidth / CANVAS_WIDTH, viewHeight / CANVAS_HEIGHT)
      : Math.min(viewWidth / CANVAS_WIDTH, viewHeight / CANVAS_HEIGHT);
  const offsetX = (viewWidth - CANVAS_WIDTH * fitScale) / 2;
  const offsetY = (viewHeight - CANVAS_HEIGHT * fitScale) / 2;

  // 시안과 동일: translate(cx+tx, cy+ty) rotate scale translate(-cx,-cy)
  const groupTransform = [
    { translateX: offsetX },
    { translateY: offsetY },
    { scale: fitScale },
    { translateX: CANVAS_WIDTH / 2 + transform.x },
    { translateY: CANVAS_HEIGHT / 2 + transform.y },
    { rotate: (transform.rotationDeg * Math.PI) / 180 },
    { scale: transform.scale },
    { translateX: -CANVAS_WIDTH / 2 },
    { translateY: -CANVAS_HEIGHT / 2 },
  ];

  return (
    <View style={{ width: viewWidth, height: viewHeight }}>
      <Canvas style={{ flex: 1 }}>
        <Group transform={groupTransform}>
          {preset === 'segment-lighting' && (
            <SegmentLayer
              projected={projected}
              cumulative={cumulative}
              totalDistance={totalDistance}
              progressFraction={progressFraction}
              fullPath={fullPath}
              blurScale={blurScale}
            />
          )}
          {preset === 'light-runner' && (
            <LightRunnerLayer
              projected={projected}
              cumulative={cumulative}
              totalDistance={totalDistance}
              fullPath={fullPath}
              rawFullPath={rawFullPath}
              isInteracting={isInteracting}
              blurScale={blurScale}
              onProgressSample={setLightRunnerStampProgress}
            />
          )}
          {preset === 'default-drawing' && (
            <DefaultDrawingLayer fullPath={fullPath} progressFraction={progressFraction} />
          )}
        </Group>
      </Canvas>

      {/* 각인 텍스트와 안전 영역 가이드는 SVG 오버레이 — 로드된 폰트로 또렷하게. */}
      <Svg
        style={{ position: 'absolute', top: 0, left: 0 }}
        width={viewWidth}
        height={viewHeight}
        viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
        preserveAspectRatio={fit === 'cover' ? 'xMidYMid slice' : 'xMidYMid meet'}>
        <Defs>
          <Filter id="stampGlow" x="-100%" y="-100%" width="300%" height="300%">
            <FeGaussianBlur stdDeviation="6" result="b" />
            <FeMerge>
              <FeMergeNode in="b" />
              <FeMergeNode in="SourceGraphic" />
            </FeMerge>
          </Filter>
        </Defs>
        {showSafeAreaGuide && <SafeAreaGuide />}
        <StampLayerSvg run={run} config={stampConfig} progressFraction={stampProgressFraction} />
      </Svg>
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
  progressFraction,
}: {
  fullPath: ReturnType<typeof skPath>;
  progressFraction: number;
}) {
  return (
    <Path
      path={fullPath}
      start={0}
      end={progressFraction}
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
  blurScale,
  onProgressSample,
}: {
  projected: CanvasPoint[];
  cumulative: number[];
  totalDistance: number;
  fullPath: ReturnType<typeof skPath>;
  rawFullPath: ReturnType<typeof skPath>;
  isInteracting: boolean;
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
    frameCallback.setActive(!isInteracting);
  }, [isInteracting, frameCallback]);

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
function SegmentLayer({
  projected,
  cumulative,
  totalDistance,
  progressFraction,
  fullPath,
  blurScale,
}: {
  projected: CanvasPoint[];
  cumulative: number[];
  totalDistance: number;
  progressFraction: number;
  fullPath: ReturnType<typeof skPath>;
  blurScale: number;
}) {
  if (totalDistance <= 0) return null;
  const unit = segmentUnitMeters(totalDistance);
  const segmentCount = Math.ceil(totalDistance / unit);

  const segments = [];
  for (let s = 0; s < segmentCount; s++) {
    const segStartDist = s * unit;
    const segEndDist = Math.min(totalDistance, (s + 1) * unit);
    const segStartFraction = segStartDist / totalDistance;
    const segEndFraction = segEndDist / totalDistance;
    if (progressFraction <= segStartFraction) break;

    const done = progressFraction >= segEndFraction;
    const endDistance = done ? segEndDist : progressFraction * totalDistance;
    const endFraction = endDistance / totalDistance;
    const justLit = done ? Math.max(0, 1 - (progressFraction - segEndFraction) * 14) : 0;

    // 실기기 피드백(2026-09-01): 구간마다 매 프레임 점 배열을 슬라이스해 새 Path를
    // 만들었다 — fullPath 하나를 구간 경계 비율로 네이티브 trim해서 그리면 JS에서
    // 점을 훑을 필요가 없다(위 light-runner/default-drawing과 같은 이유).
    segments.push(
      <Path
        key={s}
        path={fullPath}
        start={segStartFraction}
        end={endFraction}
        style="stroke"
        strokeWidth={10 + justLit * 4}
        strokeCap="round"
        strokeJoin="round"
        opacity={done ? 0.95 : 0.5}
        color={LINE_WARM}>
        {done && <Shadow dx={0} dy={0} blur={(45 + justLit * 65) * blurScale} color={GLOW} />}
      </Path>
    );

    if (done) {
      const boundary = pointAtDistance(segEndDist, projected, cumulative);
      if (boundary) {
        segments.push(
          <Circle key={`dot-${s}`} cx={boundary.x} cy={boundary.y} r={4 + justLit * 3} color={LINE_WARM}>
            <Shadow dx={0} dy={0} blur={60 * blurScale} color={GLOW} />
          </Circle>
        );
      }
    }
  }

  return (
    <Group>
      <Path path={fullPath} style="stroke" strokeWidth={10} color={GHOST} />
      {segments}
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
  const stroke = 'rgba(255,90,43,0.6)';
  const strokeWidth = 3;
  const dash = '10,8';
  const commonProps = { stroke, strokeWidth, strokeDasharray: dash, fill: 'none' as const };

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
      <Line x1={0} y1={topY} x2={CANVAS_WIDTH} y2={topY} {...commonProps} />
      <Line x1={0} y1={bottomY} x2={CANVAS_WIDTH} y2={bottomY} {...commonProps} />

      {/* 상단 — 프로필(아바타+이름 바)과 닫기 버튼 자리 */}
      <SvgCircle cx={avatarCx} cy={avatarCy} r={avatarR} {...commonProps} />
      <SvgRect
        x={avatarCx + avatarR + 18}
        y={avatarCy - 15}
        width={240}
        height={30}
        rx={15}
        {...commonProps}
      />
      <SvgCircle cx={closeCx} cy={closeCy} r={closeR} {...commonProps} />
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
        stroke={stroke}
        strokeWidth={strokeWidth}
      />

      {/* 하단 — 답장 입력창 자리 */}
      <SvgRect x={replyX} y={replyY} width={replyWidth} height={replyHeight} rx={replyHeight / 2} {...commonProps} />
    </>
  );
}

// route-rendering FRD §7: 넷을 다 새긴다, 심박은 데이터 있을 때만, 항목별로 끈다.
// §7-3: "항상"은 진행률 카운트업, "완성 후만"은 정지 구간에만. 거리는 기록된 총 거리 기준.
export function StampLayerSvg({
  run,
  config,
  progressFraction,
}: {
  run: RunRecord;
  config: StampConfig;
  progressFraction: number;
}) {
  const isComplete = progressFraction >= 1;
  if (config.mode === 'hidden') return null;
  if (config.mode === 'after' && !isComplete) return null;

  const enabled = config.enabled ?? ({} as StampConfig['enabled']);
  const items: string[] = [];
  if (enabled.distance) items.push(formatDistanceKm(run.distanceMeters * progressFraction));
  if (enabled.time) items.push(formatDuration(run.durationSeconds * progressFraction));
  if (enabled.pace) items.push(formatPace(run.averagePaceSecPerKm));
  if (enabled.date) items.push(formatStampDate(run.date));
  if (enabled.place && config.placeName) items.push(config.placeName);
  if (enabled.heartRate && run.averageHeartRate !== undefined) {
    items.push(formatHeartRate(run.averageHeartRate));
  }

  const caption = (config.caption ?? '').trim();
  if (items.length === 0 && !caption) return null;

  const centerX = CANVAS_WIDTH / 2 + config.position.x;
  const baseY = STAMP_DEFAULT_Y + config.position.y;

  // 밝은 글씨만으로는 밝은 배경 사진 위에서 흐려 보인다는 실기기 피드백(2026-09) —
  // 어두운 아웃라인 사본을 먼저 깔고 그 위에 밝은 글씨를 겹친다.
  const glowText = (key: string, x: number, y: number, size: number, family: string, text: string) => (
    <Fragment key={key}>
      <SvgText x={x} y={y} fontSize={size} fontFamily={family} fill="none" stroke="rgba(11,13,16,0.8)" strokeWidth={size * 0.26}>
        {text}
      </SvgText>
      <SvgText x={x} y={y} fontSize={size} fontFamily={family} fill={LINE_WARM} filter="url(#stampGlow)">
        {text}
      </SvgText>
    </Fragment>
  );

  const nodes: React.ReactNode[] = [];

  // 한 줄 문구 — 항목 줄 위에 가운데 정렬. Space Grotesk, 약간 크게.
  if (caption) {
    const capSize = 34;
    const capWidth = caption.length * capSize * 0.52;
    nodes.push(glowText('caption', centerX - capWidth / 2, baseY - 58, capSize, 'SpaceGrotesk_500Medium', caption));
  }

  if (items.length > 0) {
    const fontSize = 28;
    const gap = 22;
    const charWidth = fontSize * 0.62;
    const widths = items.map((s) => s.length * charWidth);
    const totalWidth = widths.reduce((a, b) => a + b, 0) + gap * (items.length - 1);
    let cursorX = centerX - totalWidth / 2;
    items.forEach((text, i) => {
      nodes.push(glowText(`item-${i}`, cursorX, baseY, fontSize, 'JetBrainsMono_700Bold', text));
      cursorX += widths[i] + gap;
    });
  }

  return <>{nodes}</>;
}

// route-thumbnail.tsx가 예전 이름으로 import 하던 것과의 호환.
export { StampLayerSvg as StampLayer };
