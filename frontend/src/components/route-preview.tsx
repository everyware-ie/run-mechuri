import { useEffect, useMemo, useRef, useState } from 'react';
import { Circle, Defs, FeGaussianBlur, FeMerge, FeMergeNode, Filter, G, Path, Svg } from 'react-native-svg';

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

export const IDENTITY_SMOOTH: SmoothOptions = { smooth: 0, corner: 0 };

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
    </Svg>
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
  // 최근 10%(거리 기준) 구간만 남긴 "핫 트레일". before로 시작점 인덱스를 찾아 자른다.
  const hotStartDistance = Math.max(0, targetDistance - totalDistance * 0.1);
  const before = pointsUpToDistance(hotStartDistance, projected, cumulative);
  const hotTrail = traveled.slice(Math.max(0, before.length - 1));
  const head = traveled[traveled.length - 1];
  const isComplete = progressFraction >= 1;

  return (
    <>
      <Path d={fullPath} stroke={LINE_DIM} strokeWidth={3} fill="none" />
      <Path
        d={toSvgPath(traveled)}
        stroke="rgba(255,243,236,0.55)"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
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
