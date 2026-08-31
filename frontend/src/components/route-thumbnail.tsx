import { useMemo } from 'react';
import { Defs, FeGaussianBlur, FeMerge, FeMergeNode, Filter, G, Path, Svg } from 'react-native-svg';

import { CANVAS_HEIGHT, CANVAS_WIDTH, projectPoints, toSvgPath, type Point } from '@/lib/route-projection';
import { applySmoothing, type SmoothOptions } from '@/lib/route-smoothing';

import { IDENTITY_SMOOTH, type RouteTransform } from './route-preview';

// FRD: docs/specs/frd/home-and-library.md §2-1 "썸네일: 결과물의 한 장면"
//
// 애니메이션 없이 "완성된 순간"만 정지 이미지로 보여준다. 3개 프리셋 다 완주 시점엔
// 전체 경로가 따뜻한 흰색으로 밝아지는 게 공통이라(route-preview.tsx 참고), 프리셋별로
// 다르게 그릴 필요 없이 이 하나로 충분하다.

type Props = {
  points: Point[];
  transform: RouteTransform;
  size: number; // 정사각형 한 변
  smoothOptions?: SmoothOptions;
};

export function RouteThumbnail({ points, transform, size, smoothOptions = IDENTITY_SMOOTH }: Props) {
  const rawProjected = useMemo(() => projectPoints(points), [points]);
  const projected = useMemo(() => applySmoothing(rawProjected, smoothOptions), [rawProjected, smoothOptions]);
  if (projected.length < 2) return null;
  const path = toSvgPath(projected);
  const scaleToView = Math.min(size / CANVAS_WIDTH, size / CANVAS_HEIGHT);

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`} preserveAspectRatio="xMidYMid slice">
      <Defs>
        <Filter id="thumbGlow" x="-100%" y="-100%" width="300%" height="300%">
          <FeGaussianBlur stdDeviation="10" result="blur" />
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
        <Path
          d={path}
          stroke="#FFF3EC"
          strokeWidth={10 / scaleToView}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          filter="url(#thumbGlow)"
        />
      </G>
    </Svg>
  );
}
