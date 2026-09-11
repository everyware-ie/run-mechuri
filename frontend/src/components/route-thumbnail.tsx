import { Blur, Canvas, Fill, Group, Image as SkiaImage, ImageShader, Path, Shadow, Skia, useImage } from '@shopify/react-native-skia';
import { memo, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Defs, FeGaussianBlur, FeMerge, FeMergeNode, Filter, Svg } from 'react-native-svg';

import { CANVAS_HEIGHT, CANVAS_WIDTH, projectPoints, toSvgPath, type Point } from '@/lib/route-projection';
import { applySmoothing, type SmoothOptions } from '@/lib/route-smoothing';
import { computeThumbnailFrame } from '@/lib/thumbnail-framing';
import { DEFAULT_BACKGROUNDS } from '@/constants/default-backgrounds';

import type { RunRecord } from '../../modules/health-kit-bridge/src/HealthKitBridge.types';
import { computeStampBounds, IDENTITY_SMOOTH, IDENTITY_STAMP, StampLayer, type RouteTransform, type StampConfig } from './route-preview';

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
  /** 홈 목록에서는 경로와 각인을 모두 담고 저장된 배경도 함께 표시한다. */
  framing?: 'center' | 'content';
  backgroundImagePath?: string;
};

export const RouteThumbnail = memo(function RouteThumbnail({
  points,
  transform,
  size,
  smoothOptions = IDENTITY_SMOOTH,
  run,
  stampConfig = IDENTITY_STAMP,
  framing = 'center',
  backgroundImagePath,
}: Props) {
  const rawProjected = useMemo(() => projectPoints(points), [points]);
  const projected = useMemo(() => applySmoothing(rawProjected, smoothOptions), [rawProjected, smoothOptions]);
  const path = useMemo(
    () => Skia.Path.MakeFromSVGString(toSvgPath(projected)) ?? Skia.Path.Make(),
    [projected]
  );
  const frame = useMemo(() => framing === 'content'
    ? computeThumbnailFrame(projected, transform, run ? computeStampBounds(run, stampConfig, true) : null)
    : { x: 0, y: (CANVAS_HEIGHT - CANVAS_WIDTH) / 2, width: CANVAS_WIDTH, height: CANVAS_WIDTH },
  [framing, projected, transform, run, stampConfig]);

  const fitScale = size / frame.width;
  const offsetX = -frame.x * fitScale;
  const offsetY = -frame.y * fitScale;

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
    <View style={{ width: size, height: size, overflow: 'hidden' }}>
      {framing === 'content' && (
        <ThumbnailBackground key={backgroundImagePath ?? 'default'} path={backgroundImagePath}
          size={size} left={offsetX} top={offsetY} scale={fitScale} />
      )}
      <Canvas style={{ flex: 1 }}>
        <Group transform={groupTransform}>
          <Path
            path={path}
            style="stroke"
            strokeWidth={10}
            strokeCap="round"
            strokeJoin="round"
            color={LINE_WARM}>
            <Shadow dx={0} dy={0} blur={60} color={GLOW} />
          </Path>
        </Group>
      </Canvas>

      {/* §2-1 "완성된 순간" — 각인도 완주 시점(progressFraction=1)으로 함께. */}
      {run && (
        <Svg
          style={{ position: 'absolute', top: 0, left: 0 }}
          width={size}
          height={size}
          viewBox={`${frame.x} ${frame.y} ${frame.width} ${frame.height}`}>
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
});

function ThumbnailBackground({ path, size, left, top, scale }: {
  path?: string; size: number; left: number; top: number; scale: number;
}) {
  const [failed, setFailed] = useState(false);
  // 기본 배경은 앱 업데이트로 컨테이너 경로가 달라져도 원래 소재를 복원한다.
  const bundled = DEFAULT_BACKGROUNDS.find(bg => path?.endsWith(`/backgrounds/${bg.id}.jpg`));
  const source = bundled?.source ?? (path && !failed
    ? (path.startsWith('/') ? `file://${path}` : path)
    : DEFAULT_BACKGROUNDS[0].source);
  const image = useImage(source, () => setFailed(true));
  const backgroundRect = { x: left, y: top, width: CANVAS_WIDTH * scale, height: CANVAS_HEIGHT * scale };
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Canvas style={{ width: size, height: size }}>
        {image && <>
          {/* 원본과 같은 좌표에서 가장자리 색을 연장한다. 반투명·별도 확대 때문에 생기던 띠를 없앤다. */}
          <Fill>
            <ImageShader image={image} rect={backgroundRect} fit="cover" tx="clamp" ty="clamp" />
            <Blur blur={size * 0.025} mode="clamp" />
          </Fill>
          <SkiaImage image={image} {...backgroundRect} fit="cover" />
        </>}
      </Canvas>
    </View>
  );
}
