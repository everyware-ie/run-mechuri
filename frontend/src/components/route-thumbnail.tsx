import { Canvas, Group, Path, Shadow, Skia } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { View } from 'react-native';
import { Defs, FeGaussianBlur, FeMerge, FeMergeNode, Filter, Svg } from 'react-native-svg';

import { CANVAS_HEIGHT, CANVAS_WIDTH, projectPoints, toSvgPath, type Point } from '@/lib/route-projection';
import { applySmoothing, type SmoothOptions } from '@/lib/route-smoothing';

import type { RunRecord } from '../../modules/health-kit-bridge/src/HealthKitBridge.types';
import { IDENTITY_SMOOTH, IDENTITY_STAMP, StampLayer, type RouteTransform, type StampConfig } from './route-preview';

// FRD: docs/specs/frd/home-and-library.md §2-1 "썸네일: 결과물의 한 장면"
//
// 애니메이션 없이 "완성된 순간"만 정지 이미지로. 3개 프리셋 다 완주 시점엔 전체 경로가
// 따뜻한 흰색으로 밝아지는 게 공통이라 이 하나로 충분하다. route-preview.tsx와 같은
// Skia 렌더 + 시안 neon 팔레트.

const LINE_WARM = '#FFF3EC';
const GLOW = '#FF5A2B';

type Props = {
  points: Point[];
  transform: RouteTransform;
  size: number; // 정사각형 한 변
  smoothOptions?: SmoothOptions;
  run?: RunRecord;
  stampConfig?: StampConfig;
};

export function RouteThumbnail({
  points,
  transform,
  size,
  smoothOptions = IDENTITY_SMOOTH,
  run,
  stampConfig = IDENTITY_STAMP,
}: Props) {
  const rawProjected = useMemo(() => projectPoints(points), [points]);
  const projected = useMemo(() => applySmoothing(rawProjected, smoothOptions), [rawProjected, smoothOptions]);
  const path = useMemo(
    () => Skia.Path.MakeFromSVGString(toSvgPath(projected)) ?? Skia.Path.Make(),
    [projected]
  );
  if (projected.length < 2) return <View style={{ width: size, height: size }} />;

  const fitScale = Math.max(size / CANVAS_WIDTH, size / CANVAS_HEIGHT); // slice(꽉 채움)
  const offsetX = (size - CANVAS_WIDTH * fitScale) / 2;
  const offsetY = (size - CANVAS_HEIGHT * fitScale) / 2;

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
    <View style={{ width: size, height: size }}>
      <Canvas style={{ flex: 1 }}>
        <Group transform={groupTransform}>
          <Path
            path={path}
            style="stroke"
            strokeWidth={10}
            strokeCap="round"
            strokeJoin="round"
            color={LINE_WARM}>
            <Shadow dx={0} dy={0} blur={9} color={GLOW} />
          </Path>
        </Group>
      </Canvas>

      {/* §2-1 "완성된 순간" — 각인도 완주 시점(progressFraction=1)으로 함께. */}
      {run && (
        <Svg
          style={{ position: 'absolute', top: 0, left: 0 }}
          width={size}
          height={size}
          viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
          preserveAspectRatio="xMidYMid slice">
          <Defs>
            <Filter id="stampGlow" x="-100%" y="-100%" width="300%" height="300%">
              <FeGaussianBlur stdDeviation="6" result="b" />
              <FeMerge>
                <FeMergeNode in="b" />
                <FeMergeNode in="SourceGraphic" />
              </FeMerge>
            </Filter>
          </Defs>
          <StampLayer run={run} config={stampConfig} progressFraction={1} />
        </Svg>
      )}
    </View>
  );
}
