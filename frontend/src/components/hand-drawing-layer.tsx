import { Canvas, Circle, Group, Path, Shadow, Skia, type SkPath } from '@shopify/react-native-skia';
import { memo, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import type { HandStroke } from '@/lib/hand-drawing';

export type ActiveHandStroke = { path: SharedValue<SkPath>; brush: HandStroke['brush']; color: string; width: number };
const inkPath = (stroke: HandStroke) => {
  const p = Skia.Path.Make();
  stroke.points.forEach((point, index) => index ? p.lineTo(point.x, point.y) : p.moveTo(point.x, point.y));
  return p;
};
const InkStroke = memo(function InkStroke({ stroke }: { stroke: HandStroke }) {
  const path = useMemo(() => inkPath(stroke), [stroke]);
  if (stroke.points.length === 1) {
    const point = stroke.points[0];
    return <Group opacity={stroke.brush === 'highlight' ? .4 : 1}>
      <Circle cx={point.x} cy={point.y} r={stroke.width / 2} color={stroke.color}>
        {stroke.brush === 'neon' && <Shadow dx={0} dy={0} blur={16} color={stroke.color} />}
      </Circle>
      {stroke.brush === 'neon' && <Circle cx={point.x} cy={point.y} r={stroke.width * .19} color="#FFFFFF" />}
    </Group>;
  }
  return <InkPath path={path} brush={stroke.brush} color={stroke.color} width={stroke.width} />;
});
function InkPath({ path, brush, color, width }: { path: SkPath | SharedValue<SkPath>; brush: HandStroke['brush']; color: string; width: number }) {
  return <Group opacity={brush === 'highlight' ? .4 : 1}>
    <Path path={path} style="stroke" color={color} strokeWidth={width} strokeCap="round" strokeJoin="round">
      {brush === 'neon' && <Shadow dx={0} dy={0} blur={16} color={color} />}
    </Path>
    {brush === 'neon' && <Path path={path} style="stroke" color="#FFFFFF" strokeWidth={width * .38} strokeCap="round" strokeJoin="round" />}
  </Group>;
}
export const HandDrawingLayer = memo(function HandDrawingLayer({ strokes, active, width, height, offsetX, offsetY, scale }: {
  strokes: HandStroke[]; active?: ActiveHandStroke; width: number; height: number;
  offsetX: number; offsetY: number; scale: number;
}) {
  const transform = useMemo(() => [{ translateX: offsetX }, { translateY: offsetY }, { scale }], [offsetX, offsetY, scale]);
  if (!strokes.length && !active) return null;
  return <Canvas pointerEvents="none" style={[StyleSheet.absoluteFill, { width, height }]}>
    <Group transform={transform}>
      {strokes.map(stroke => <InkStroke key={stroke.id} stroke={stroke} />)}
      {active && <InkPath {...active} />}
    </Group>
  </Canvas>;
});
