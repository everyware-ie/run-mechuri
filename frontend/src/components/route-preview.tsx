import { useEffect, useMemo, useRef, useState } from 'react';
import { Circle, Defs, FeGaussianBlur, FeMerge, FeMergeNode, Filter, G, Path, Rect, Svg, Text as SvgText } from 'react-native-svg';

import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  cumulativeCanvasDistances,
  projectPoints,
  pointsUpToDistance,
  segmentUnitMeters,
  toSvgPath,
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
  /** §4-1: 각인 넷은 하나의 묶음 — 위치 하나만 갖는다. 기본 자리(§7-5, 하단 안전
   * 영역 위)에서의 오프셋(캔버스 px). */
  position: { x: number; y: number };
};

export const IDENTITY_STAMP: StampConfig = {
  mode: 'always',
  enabled: { distance: true, time: true, pace: true, heartRate: true },
  position: { x: 0, y: 0 },
};

// route-rendering FRD §7-5: 상단 14%·하단 20% 제안값. "[확인 필요]"라 실기기 확인
// 전까지는 이 제안값을 그대로 쓴다.
const SAFE_AREA_TOP_RATIO = 0.14;
const SAFE_AREA_BOTTOM_RATIO = 0.2;
const STAMP_DEFAULT_Y = CANVAS_HEIGHT * (1 - SAFE_AREA_BOTTOM_RATIO) - 90;

// FRD: docs/specs/frd/route-rendering.md §5, §6 · docs/specs/frd/result-editing.md §2-1
//
// 색상·레이어 구성은 2026-08-04 JiEung2 목업
// (docs/ideation/JiEung2/2026-08-04-route-overlay-mockup.html)의 캔버스 드로잉 로직을
// 그대로 옮긴 것이다 — Swift 렌더러(modules/route-renderer)도 같은 값을 쓴다.
//
// 최종 mp4를 굽는 AVFoundation 렌더러와는 별개의, RN 쪽에서 직접 그리는 실시간 미리보기.
// §2-2 "모든 조작은 즉시 미리보기에 반영된다"를 만족하려면 매번 네이티브로 mp4를
// 다시 인코딩할 수 없어서 이 경로가 따로 필요하다.

export type RoutePreset = 'default-drawing' | 'light-runner' | 'segment-lighting';

const DRAW_SECONDS = 9;
const HOLD_SECONDS = 3;
const CYCLE_SECONDS = DRAW_SECONDS + HOLD_SECONDS;

// 목업 팔레트 그대로.
const LINE_DIM = 'rgba(255,255,255,0.2)';
const LINE_WARM = '#FFF3EC';
// 글로우 색(#FF6B4A)은 SVG 필터(glowSoft/glowHot)의 blur가 원본 색 위에 겹쳐지는
// 방식이라 별도 상수로 안 쓰고, 각 레이어의 stroke 색 자체가 글로우 색을 겸한다.

export type RouteTransform = {
  x: number;
  y: number;
  scale: number;
  rotationDeg: number;
};

export const IDENTITY_TRANSFORM: RouteTransform = { x: 0, y: 0, scale: 1, rotationDeg: 0 };

type Props = {
  points: Point[];
  preset: RoutePreset;
  transform: RouteTransform;
  /** §5: 다듬기 세기(기본 축)·모서리 라운딩(고급 축). 기본값은 IDENTITY_SMOOTH(무보정). */
  smoothOptions: SmoothOptions;
  /** §7 각인 값 계산에 쓰는 원본 기록. */
  run: RunRecord;
  stampConfig: StampConfig;
  /** §7-1: 편집 중에만 인스타 UI 안전 영역 가이드를 보여준다. 결과물엔 안 나온다. */
  showSafeAreaGuide?: boolean;
  /** §2-1: 조작 중(제스처)이면 그 시점에서 멈춘다. */
  isInteracting: boolean;
  viewWidth: number;
  viewHeight: number;
};

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
  // §5: 다듬기는 그룹 변형(scale/rotate) 이전, 캔버스 좌표계에서 적용한다 — 사용자가
  // 확대해도 슬라이더가 의미하는 "다듬기 세기"가 화면상에서 갑자기 달라지지 않도록.
  const rawProjected = useMemo(() => projectPoints(points), [points]);
  const projected = useMemo(
    () => applySmoothing(rawProjected, smoothOptions),
    [rawProjected, smoothOptions]
  );
  const cumulative = useMemo(() => cumulativeCanvasDistances(projected), [projected]);
  const totalDistance = cumulative[cumulative.length - 1] ?? 0;

  const [elapsed, setElapsed] = useState(0);
  const frameRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);

  // §3: 프리셋을 바꾸면 처음부터 재생.
  useEffect(() => {
    setElapsed(0);
    lastTsRef.current = null;
  }, [preset]);

  useEffect(() => {
    if (isInteracting) {
      lastTsRef.current = null;
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      return;
    }

    const tick = (ts: number) => {
      if (lastTsRef.current !== null) {
        const deltaSeconds = (ts - lastTsRef.current) / 1000;
        setElapsed((prev) => (prev + deltaSeconds) % CYCLE_SECONDS);
      }
      lastTsRef.current = ts;
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [isInteracting]);

  if (projected.length < 2) return null;

  const progressFraction = Math.min(elapsed / DRAW_SECONDS, 1);
  const targetDistance = totalDistance * progressFraction;
  const fullPath = toSvgPath(projected);
  const scaleToView = Math.min(viewWidth / CANVAS_WIDTH, viewHeight / CANVAS_HEIGHT);
  const w = (px: number) => px / scaleToView; // 캔버스 기준 두께를 뷰 스케일에 맞게 보정

  return (
    <Svg width={viewWidth} height={viewHeight} viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}>
      <Defs>
        <Filter id="glowSoft" x="-100%" y="-100%" width="300%" height="300%">
          <FeGaussianBlur stdDeviation="6" result="blur" />
          <FeMerge>
            <FeMergeNode in="blur" />
            <FeMergeNode in="SourceGraphic" />
          </FeMerge>
        </Filter>
        <Filter id="glowHot" x="-200%" y="-200%" width="500%" height="500%">
          <FeGaussianBlur stdDeviation="14" result="blur" />
          <FeMerge>
            <FeMergeNode in="blur" />
            <FeMergeNode in="SourceGraphic" />
          </FeMerge>
        </Filter>
      </Defs>

      <G
        transform={`translate(${CANVAS_WIDTH / 2 + transform.x} ${
          CANVAS_HEIGHT / 2 + transform.y
        }) rotate(${transform.rotationDeg}) scale(${transform.scale}) translate(${-CANVAS_WIDTH / 2} ${-CANVAS_HEIGHT / 2})`}>
        {preset === 'default-drawing' && (
          <DefaultDrawingLayer
            projected={projected}
            cumulative={cumulative}
            targetDistance={targetDistance}
            strokeWidth={w(10)}
          />
        )}

        {preset === 'segment-lighting' && (
          <SegmentLightingLayer
            projected={projected}
            cumulative={cumulative}
            totalDistance={totalDistance}
            progressFraction={progressFraction}
            fullPath={fullPath}
            strokeWidth={w(10)}
          />
        )}

        {preset === 'light-runner' && (
          <LightRunnerLayer
            projected={projected}
            cumulative={cumulative}
            totalDistance={totalDistance}
            targetDistance={targetDistance}
            progressFraction={progressFraction}
            fullPath={fullPath}
            strokeWidth={w(8)}
          />
        )}
      </G>

      {showSafeAreaGuide && <SafeAreaGuide />}

      <StampLayer run={run} config={stampConfig} progressFraction={progressFraction} />
    </Svg>
  );
}

// §7-1: 인스타 스토리 UI가 가리는 상하단을 편집 중에만 보여준다. 결과물에는 안 나온다.
// 드로잉에도 같은 가이드가 쓰인다(같은 Svg 안이라 자연히 함께 보임).
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
// §7-3: "항상" 모드는 진행률을 따라 카운트업, "완성 후만"은 정지 구간(완주)에만.
// 거리는 선 길이가 아니라 기록된 총 거리를 쓴다 — 다듬기 세기를 바꿔도 안 흔들리도록.
export function StampLayer({
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
  // §7-3: 페이스·심박은 "완성 후만"일 때 평균값. "항상"에서도 구간별 실측이 없어
  // 평균 페이스를 쓴다(그 시점 값이 없다 — 아래 "남은 근사" 참고).
  if (config.enabled.pace) items.push(formatPace(run.averagePaceSecPerKm));
  if (config.enabled.heartRate && run.averageHeartRate !== undefined) {
    items.push(formatHeartRate(run.averageHeartRate));
  }
  if (items.length === 0) return null;

  const fontSize = 28;
  const gap = 22;
  const centerX = CANVAS_WIDTH / 2 + config.position.x;
  const y = STAMP_DEFAULT_Y + config.position.y;

  // 대략적인 고정폭 문자 너비로 전체 너비를 추정해 가운데 정렬한다(모노스페이스 폰트).
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
            filter="url(#glowSoft)">
            {text}
          </SvgText>
        );
      })}
    </>
  );
}

// §6-1 기본 드로잉: 목업 "draw" 그대로 — 따뜻한 흰색 + 옅은 글로우.
function DefaultDrawingLayer({
  projected,
  cumulative,
  targetDistance,
  strokeWidth,
}: {
  projected: { x: number; y: number }[];
  cumulative: number[];
  targetDistance: number;
  strokeWidth: number;
}) {
  const visible = pointsUpToDistance(targetDistance, projected, cumulative);
  return (
    <Path
      d={toSvgPath(visible)}
      stroke={LINE_WARM}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
      filter="url(#glowSoft)"
    />
  );
}

// §6-2 불빛 러너: 목업 "beacon" 그대로 — 옅은 전체 경로 + 지나온 길(중간 밝기) +
// 최근 10% 구간(핫 트레일) + 머리 위 발광 점. 완주 시 전체가 밝아진다.
function LightRunnerLayer({
  projected,
  cumulative,
  totalDistance,
  targetDistance,
  progressFraction,
  fullPath,
  strokeWidth,
}: {
  projected: { x: number; y: number }[];
  cumulative: number[];
  totalDistance: number;
  targetDistance: number;
  progressFraction: number;
  fullPath: string;
  strokeWidth: number;
}) {
  const traveled = pointsUpToDistance(targetDistance, projected, cumulative);
  // 목업(2026-08-04)의 "최근 46점" 잔광을 거리 기준으로 옮긴 값 — GPS 샘플 밀도가
  // 들쭉날쭉한 실제 기록에서는 점 개수보다 거리 비율이 안정적이다. 6%(거리 기준)로
  // 잡아 목업의 짧고 스치는 느낌에 맞췄다(v0 근사, 3주차 실측 후 조정 가능).
  const hotStartDistance = Math.max(0, targetDistance - totalDistance * 0.06);
  const before = pointsUpToDistance(hotStartDistance, projected, cumulative);
  const hotTrail = traveled.slice(Math.max(0, before.length - 1));
  const head = traveled[traveled.length - 1];
  const isComplete = progressFraction >= 1;

  return (
    <>
      <Path d={fullPath} stroke={LINE_DIM} strokeWidth={3} fill="none" />
      {/* 목업의 "지나온 길" 레이어에도 옅은 글로우가 있다 — 처음 옮길 때 빠뜨렸던 부분. */}
      <Path
        d={toSvgPath(traveled)}
        stroke="rgba(255,243,236,0.55)"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        filter="url(#glowSoft)"
      />
      {!isComplete && (
        <Path
          d={toSvgPath(hotTrail)}
          stroke={LINE_WARM}
          strokeWidth={strokeWidth + 2}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          filter="url(#glowHot)"
        />
      )}
      {!isComplete && head && (
        <Circle cx={head.x} cy={head.y} r={8} fill="#FFFFFF" filter="url(#glowHot)" />
      )}
      {/* §6-2 마무리: 끝점에 닿는 순간 경로 전체가 밝아진다 */}
      {isComplete && (
        <Path
          d={fullPath}
          stroke={LINE_WARM}
          strokeWidth={strokeWidth + 4}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          filter="url(#glowHot)"
        />
      )}
    </>
  );
}

// §6-3 구간 점등: 목업 "segments" 그대로 — 옅은 전체 경로 위에, 구간마다
// (완료된 구간은 밝게, 그리는 중인 구간은 중간 밝기로) 쌓아 그린다.
// 구간 수는 FRD 제안 표(segmentUnitMeters)를 따른다(목업의 "ceil(km)"보다 정밀함).
function SegmentLightingLayer({
  projected,
  cumulative,
  totalDistance,
  progressFraction,
  fullPath,
  strokeWidth,
}: {
  projected: { x: number; y: number }[];
  cumulative: number[];
  totalDistance: number;
  progressFraction: number;
  fullPath: string;
  strokeWidth: number;
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

    if (progressFraction <= segStartFraction) break; // 아직 도달 안 함 — 이후 구간도 마찬가지

    const done = progressFraction >= segEndFraction;
    const endDistance = done ? segEndDist : progressFraction * totalDistance;
    const segPoints = pointsUpToDistance(endDistance, projected, cumulative);
    // segStartDist 이전 구간은 잘라낸다. 시작점 하나는 이어 그리기 위해 남긴다.
    const before = pointsUpToDistance(segStartDist, projected, cumulative);
    const slice = segPoints.slice(Math.max(0, before.length - 1));

    // 방금 완료된 구간일수록 반짝임이 강하다(목업의 justLit, 감쇠 계수는 근사치).
    const justLit = done ? Math.max(0, 1 - (progressFraction - segEndFraction) * 14) : 0;

    segments.push(
      <Path
        key={s}
        d={toSvgPath(slice)}
        stroke={`rgba(255,243,236,${done ? 0.95 : 0.5})`}
        strokeWidth={strokeWidth + justLit * 4}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        filter={done ? 'url(#glowHot)' : undefined}
      />
    );

    if (done) {
      const boundaryPoint = pointsUpToDistance(segEndDist, projected, cumulative).at(-1);
      if (boundaryPoint) {
        segments.push(
          <Circle
            key={`dot-${s}`}
            cx={boundaryPoint.x}
            cy={boundaryPoint.y}
            r={4 + justLit * 3}
            fill={LINE_WARM}
            filter="url(#glowHot)"
          />
        );
      }
    }
  }

  return (
    <>
      <Path d={fullPath} stroke={LINE_DIM} strokeWidth={strokeWidth} fill="none" />
      {segments}
    </>
  );
}
