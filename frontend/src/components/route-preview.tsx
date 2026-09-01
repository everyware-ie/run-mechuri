import { Canvas, Circle, Group, Path, Shadow, Skia } from '@shopify/react-native-skia';
import { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { Rect, Svg, Text as SvgText, Defs, Filter, FeGaussianBlur, FeMerge, FeMergeNode } from 'react-native-svg';

import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  cumulativeCanvasDistances,
  projectPoints,
  pointsUpToDistance,
  segmentUnitMeters,
  type CanvasPoint,
  type Point,
} from '@/lib/route-projection';
import { applySmoothing, type SmoothOptions } from '@/lib/route-smoothing';
import { formatDistanceKm, formatDuration, formatHeartRate, formatPace } from '@/lib/stamp-format';

import type { RunRecord } from '../../modules/health-kit-bridge/src/HealthKitBridge.types';

export const IDENTITY_SMOOTH: SmoothOptions = { smooth: 0, corner: 0 };

// result-editing FRD §7 · route-rendering FRD §7
export type StampItem = 'distance' | 'time' | 'pace' | 'heartRate';
export type StampMode = 'always' | 'after' | 'hidden';

export type StampConfig = {
  mode: StampMode;
  enabled: Record<StampItem, boolean>;
  /** §4-1: 각인 넷은 하나의 묶음 — 위치 하나만 갖는다. 기본 자리(§7-5) 오프셋(캔버스 px). */
  position: { x: number; y: number };
};

export const IDENTITY_STAMP: StampConfig = {
  mode: 'always',
  enabled: { distance: true, time: true, pace: true, heartRate: true },
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

  // §3: 프리셋을 바꾸면 처음부터 재생 — prop이 바뀐 렌더에서 상태만 리셋(React 권장 패턴,
  // ref는 안 건드린다). 프레임 delta는 아래 tick에서 어차피 0.1초로 클램프한다.
  const [seenPreset, setSeenPreset] = useState(preset);
  if (seenPreset !== preset) {
    setSeenPreset(preset);
    setElapsed(0);
  }

  useEffect(() => {
    if (isInteracting) {
      lastTsRef.current = null;
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      return;
    }
    const tick = (ts: number) => {
      if (lastTsRef.current !== null) {
        const delta = Math.min(0.1, (ts - lastTsRef.current) / 1000);
        setElapsed((prev) => (prev + delta) % CYCLE_SECONDS);
      }
      lastTsRef.current = ts;
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [isInteracting]);

  if (projected.length < 2) return <View style={{ width: viewWidth, height: viewHeight }} />;

  const progressFraction = Math.min(elapsed / DRAW_SECONDS, 1);
  const targetDistance = totalDistance * progressFraction;

  // 캔버스 → 뷰 스케일. Skia Group은 캔버스 좌표(1080x1920)로 그리고 하나의 스케일로 축소.
  const fitScale = Math.min(viewWidth / CANVAS_WIDTH, viewHeight / CANVAS_HEIGHT);
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
          <RouteLayer
            preset={preset}
            projected={projected}
            cumulative={cumulative}
            totalDistance={totalDistance}
            targetDistance={targetDistance}
            progressFraction={progressFraction}
            fullPath={fullPath}
            rawFullPath={rawFullPath}
          />
        </Group>
      </Canvas>

      {/* 각인 텍스트와 안전 영역 가이드는 SVG 오버레이 — 로드된 폰트로 또렷하게. */}
      <Svg
        style={{ position: 'absolute', top: 0, left: 0 }}
        width={viewWidth}
        height={viewHeight}
        viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
        preserveAspectRatio="xMidYMid meet">
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
        <StampLayerSvg run={run} config={stampConfig} progressFraction={progressFraction} />
      </Svg>
    </View>
  );
}

// ── 경로 레이어 (시안 canvas paint() 이식) ────────────────────────────────
function RouteLayer({
  preset,
  projected,
  cumulative,
  totalDistance,
  targetDistance,
  progressFraction,
  fullPath,
  rawFullPath,
}: {
  preset: RoutePreset;
  projected: CanvasPoint[];
  cumulative: number[];
  totalDistance: number;
  targetDistance: number;
  progressFraction: number;
  fullPath: ReturnType<typeof skPath>;
  rawFullPath: ReturnType<typeof skPath>;
}) {
  const isComplete = progressFraction >= 1;
  const traveled = pointsUpToDistance(targetDistance, projected, cumulative);
  const head = traveled[traveled.length - 1];

  if (preset === 'segment-lighting') {
    return (
      <SegmentLayer
        projected={projected}
        cumulative={cumulative}
        totalDistance={totalDistance}
        progressFraction={progressFraction}
        fullPath={fullPath}
      />
    );
  }

  if (preset === 'light-runner') {
    // 시안 "glow": 옅은 원본 + 지나온 길(+글로우) + 최근 6% 잔광(강한 글로우) + 머리 점.
    const hotStart = Math.max(0, targetDistance - totalDistance * 0.06);
    const before = pointsUpToDistance(hotStart, projected, cumulative);
    const hotTrail = traveled.slice(Math.max(0, before.length - 1));
    return (
      <Group>
        <Path path={rawFullPath} style="stroke" strokeWidth={3} color={GHOST} />
        <Path
          path={fullPath}
          style="stroke"
          strokeWidth={7}
          strokeCap="round"
          strokeJoin="round"
          color={BASE}
        />
        <Path
          path={skPath(traveled)}
          style="stroke"
          strokeWidth={9}
          strokeCap="round"
          strokeJoin="round"
          color={TRAVELED}>
          <Shadow dx={0} dy={0} blur={6} color={GLOW} />
        </Path>
        {!isComplete && (
          <Path
            path={skPath(hotTrail)}
            style="stroke"
            strokeWidth={12}
            strokeCap="round"
            strokeJoin="round"
            color={LINE_WARM}>
            <Shadow dx={0} dy={0} blur={12} color={GLOW} />
          </Path>
        )}
        {isComplete && (
          <Path
            path={fullPath}
            style="stroke"
            strokeWidth={13}
            strokeCap="round"
            strokeJoin="round"
            color={LINE_WARM}>
            <Shadow dx={0} dy={0} blur={12} color={GLOW} />
          </Path>
        )}
        {!isComplete && head && (
          <Circle cx={head.x} cy={head.y} r={9} color={LINE_WARM}>
            <Shadow dx={0} dy={0} blur={16} color={GLOW} />
          </Circle>
        )}
      </Group>
    );
  }

  // default-drawing — 시안 "plain"의 그리기 애니메이션 버전: 따뜻한 흰색 선 + 옅은 글로우.
  return (
    <Path
      path={skPath(traveled)}
      style="stroke"
      strokeWidth={10}
      strokeCap="round"
      strokeJoin="round"
      color={LINE_WARM}>
      <Shadow dx={0} dy={0} blur={5} color={GLOW} />
    </Path>
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
}: {
  projected: CanvasPoint[];
  cumulative: number[];
  totalDistance: number;
  progressFraction: number;
  fullPath: ReturnType<typeof skPath>;
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
    const segPoints = pointsUpToDistance(endDistance, projected, cumulative);
    const before = pointsUpToDistance(segStartDist, projected, cumulative);
    const slice = segPoints.slice(Math.max(0, before.length - 1));
    const justLit = done ? Math.max(0, 1 - (progressFraction - segEndFraction) * 14) : 0;

    segments.push(
      <Path
        key={s}
        path={skPath(slice)}
        style="stroke"
        strokeWidth={10 + justLit * 4}
        strokeCap="round"
        strokeJoin="round"
        opacity={done ? 0.95 : 0.5}
        color={LINE_WARM}>
        {done && <Shadow dx={0} dy={0} blur={9 + justLit * 13} color={GLOW} />}
      </Path>
    );

    if (done) {
      const boundary = pointsUpToDistance(segEndDist, projected, cumulative).at(-1);
      if (boundary) {
        segments.push(
          <Circle key={`dot-${s}`} cx={boundary.x} cy={boundary.y} r={4 + justLit * 3} color={LINE_WARM}>
            <Shadow dx={0} dy={0} blur={12} color={GLOW} />
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

// §7-1: 인스타 스토리 UI가 가리는 상하단(편집 중에만).
function SafeAreaGuide() {
  const topHeight = CANVAS_HEIGHT * SAFE_AREA_TOP_RATIO;
  const bottomHeight = CANVAS_HEIGHT * SAFE_AREA_BOTTOM_RATIO;
  return (
    <>
      <Rect x={0} y={0} width={CANVAS_WIDTH} height={topHeight} fill="rgba(255,90,43,0.14)" />
      <Rect
        x={0}
        y={CANVAS_HEIGHT - bottomHeight}
        width={CANVAS_WIDTH}
        height={bottomHeight}
        fill="rgba(255,90,43,0.14)"
      />
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

  const items: string[] = [];
  if (config.enabled.distance) items.push(formatDistanceKm(run.distanceMeters * progressFraction));
  if (config.enabled.time) items.push(formatDuration(run.durationSeconds * progressFraction));
  if (config.enabled.pace) items.push(formatPace(run.averagePaceSecPerKm));
  if (config.enabled.heartRate && run.averageHeartRate !== undefined) {
    items.push(formatHeartRate(run.averageHeartRate));
  }
  if (items.length === 0) return null;

  const fontSize = 28;
  const gap = 22;
  const centerX = CANVAS_WIDTH / 2 + config.position.x;
  const y = STAMP_DEFAULT_Y + config.position.y;
  const charWidth = fontSize * 0.62;
  const widths = items.map((s) => s.length * charWidth);
  const totalWidth = widths.reduce((a, b) => a + b, 0) + gap * (items.length - 1);
  let cursorX = centerX - totalWidth / 2;

  return (
    <>
      {items.map((text, i) => {
        const x = cursorX;
        cursorX += widths[i] + gap;
        return (
          <SvgText
            key={i}
            x={x}
            y={y}
            fontSize={fontSize}
            fontFamily="JetBrainsMono_700Bold"
            fill={LINE_WARM}
            filter="url(#stampGlow)">
            {text}
          </SvgText>
        );
      })}
    </>
  );
}

// route-thumbnail.tsx가 예전 이름으로 import 하던 것과의 호환.
export { StampLayerSvg as StampLayer };
