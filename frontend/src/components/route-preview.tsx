import { useEffect, useMemo, useRef, useState } from 'react';
import { Circle, G, Path, Svg } from 'react-native-svg';

import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  cumulativeDistances,
  projectPoints,
  pointsUpToDistance,
  toSvgPath,
  type Point,
} from '@/lib/route-projection';

// FRD: docs/specs/frd/route-rendering.md §5, §6 · docs/specs/frd/result-editing.md §2-1
//
// 최종 mp4를 굽는 AVFoundation 렌더러(modules/route-renderer)와는 별개의, RN 쪽에서
// 직접 그리는 실시간 미리보기. §2-2 "모든 조작은 즉시 미리보기에 반영된다"를 만족하려면
// 매번 네이티브로 mp4를 다시 인코딩할 수 없어서 이 경로가 따로 필요하다.
//
// v0 단순화: 구간 점등은 "구간이 스냅으로 켜진다"가 아니라 밝은 부분이 연속으로 자라나는
// 방식으로 근사했다. 실제 스냅 연출은 3주차 품질 다듬기(§10) 때 정밀화한다.

export type RoutePreset = 'default-drawing' | 'light-runner' | 'segment-lighting';

const DRAW_SECONDS = 9;
const HOLD_SECONDS = 3;
const CYCLE_SECONDS = DRAW_SECONDS + HOLD_SECONDS;

export type RouteTransform = {
  x: number; // 캔버스 중심 기준 이동량(px)
  y: number;
  scale: number; // 1 = 렌더러 초기값(화면에 맞춤)
  rotationDeg: number; // 0 = 렌더러 초기값
};

export const IDENTITY_TRANSFORM: RouteTransform = { x: 0, y: 0, scale: 1, rotationDeg: 0 };

type Props = {
  points: Point[];
  preset: RoutePreset;
  transform: RouteTransform;
  /** §2-1: 조작 중(제스처)이면 그 시점에서 멈춘다. */
  isInteracting: boolean;
  color?: string;
  viewWidth: number;
  viewHeight: number;
};

export function RoutePreview({
  points,
  preset,
  transform,
  isInteracting,
  color = '#ffffff',
  viewWidth,
  viewHeight,
}: Props) {
  const projected = useMemo(() => projectPoints(points), [points]);
  const cumulative = useMemo(() => cumulativeDistances(points), [points]);
  const totalDistance = cumulative[cumulative.length - 1] ?? 0;

  // 초 단위 경과 시간. 0..DRAW_SECONDS는 그리는 중, 그 이후 HOLD_SECONDS는 정지, 다시 0으로.
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
      lastTsRef.current = null; // 재개 시 튀지 않도록
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

  const progressFraction = Math.min(elapsed / DRAW_SECONDS, 1);
  const targetDistance = totalDistance * progressFraction;
  const visiblePoints = pointsUpToDistance(targetDistance, projected, cumulative);
  const fullPath = toSvgPath(projected);
  const visiblePath = toSvgPath(visiblePoints);
  const headPoint = visiblePoints[visiblePoints.length - 1];

  const scaleToView = Math.min(viewWidth / CANVAS_WIDTH, viewHeight / CANVAS_HEIGHT);

  if (projected.length < 2) return null;

  return (
    <Svg width={viewWidth} height={viewHeight} viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}>
      <G
        transform={`translate(${CANVAS_WIDTH / 2 + transform.x} ${
          CANVAS_HEIGHT / 2 + transform.y
        }) rotate(${transform.rotationDeg}) scale(${transform.scale}) translate(${-CANVAS_WIDTH / 2} ${-CANVAS_HEIGHT / 2})`}>
        {preset === 'default-drawing' && (
          <Path
            d={visiblePath}
            stroke={color}
            strokeWidth={10 / scaleToView}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        )}

        {preset === 'segment-lighting' && (
          <>
            <Path
              d={fullPath}
              stroke={color}
              strokeWidth={10 / scaleToView}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              opacity={0.2}
            />
            <Path
              d={visiblePath}
              stroke={color}
              strokeWidth={10 / scaleToView}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </>
        )}

        {preset === 'light-runner' && (
          <>
            <Path
              d={visiblePath}
              stroke={color}
              strokeWidth={8 / scaleToView}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              opacity={progressFraction >= 1 ? 1 : 0.5}
            />
            {headPoint && progressFraction < 1 && (
              <Circle cx={headPoint.x} cy={headPoint.y} r={16 / scaleToView} fill={color} />
            )}
          </>
        )}
      </G>
    </Svg>
  );
}
