import { Circle, RadialGradient } from '@shopify/react-native-skia';
import { memo, type ComponentProps } from 'react';
import type { CanvasPoint } from '@/lib/route-projection';

// 미리보기와 썸네일이 같은 표식을 쓴다. 반경 그라데이션이라 별도 블러 레이어가 없다.
export const SegmentGlowMarker = memo(function SegmentGlowMarker({ point, color, radius, coreRadius, haloRadius, haloOpacity = 0.24 }: {
  point: CanvasPoint;
  color: string;
  radius: ComponentProps<typeof Circle>['r'];
  coreRadius: ComponentProps<typeof Circle>['r'];
  haloRadius: ComponentProps<typeof Circle>['r'];
  haloOpacity?: ComponentProps<typeof Circle>['opacity'];
}) {
  return <>
    <Circle cx={point.x} cy={point.y} r={haloRadius} opacity={haloOpacity}>
      <RadialGradient c={point} r={haloRadius} colors={[color, `${color}00`]} />
    </Circle>
    <Circle cx={point.x} cy={point.y} r={radius} color={color} />
    <Circle cx={point.x} cy={point.y} r={coreRadius} color="rgba(255,255,255,0.9)" />
  </>;
});
