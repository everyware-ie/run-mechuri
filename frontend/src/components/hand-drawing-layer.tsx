import { Canvas, Circle, DashPathEffect, Group, Path, RoundedRect, Shadow, Skia, type SkPath } from '@shopify/react-native-skia';
import { memo, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { handStrokeGeometry, type HandStroke } from '@/lib/hand-drawing';
import { Colors } from '@/constants/theme';
export type HandStrokeEditing = { id: string; x: SharedValue<number>; y: SharedValue<number>; scale: SharedValue<number> };

export type ActiveHandStroke = { path: SharedValue<SkPath>; brush: HandStroke['brush']; color: string; width: number };
const inkPath = (points: HandStroke['points']) => {
  const p = Skia.Path.Make();
  points.forEach((point, index) => index ? p.lineTo(point.x, point.y) : p.moveTo(point.x, point.y));
  return p;
};
const InkStroke = memo(function InkStroke({ stroke, selected, editing }: { stroke: HandStroke; selected: boolean; editing?: HandStrokeEditing }) {
  const points = stroke.points;
  const path = useMemo(() => inkPath(points), [points]);
  const g = useMemo(() => handStrokeGeometry({ points }), [points]);
  const transform = useDerivedValue(() => [
    { translateX: g.cx + (editing ? editing.x.value : stroke.offset?.x ?? 0) },
    { translateY: g.cy + (editing ? editing.y.value : stroke.offset?.y ?? 0) },
    { scale: editing ? editing.scale.value : stroke.scale ?? 1 },
    { translateX: -g.cx }, { translateY: -g.cy },
  ]);
  const point = stroke.points[0];
  const margin = stroke.width / 2 + 10;
  return <Group transform={transform}>
    {stroke.points.length === 1 ? <Group opacity={stroke.brush === 'highlight' ? .4 : 1}>
      <Circle cx={point.x} cy={point.y} r={stroke.width / 2} color={stroke.color}>
        {stroke.brush === 'neon' && <Shadow dx={0} dy={0} blur={16} color={stroke.color} />}
      </Circle>
      {stroke.brush === 'neon' && <Circle cx={point.x} cy={point.y} r={stroke.width * .19} color="#FFFFFF" />}
    </Group> : <InkPath path={path} brush={stroke.brush} color={stroke.color} width={stroke.width} />}
    {selected && <RoundedRect x={g.left - margin} y={g.top - margin} width={g.width + margin * 2} height={g.height + margin * 2}
      r={12} style="stroke" strokeWidth={3} color={Colors.accent}>
      <DashPathEffect intervals={[12, 9]} />
    </RoundedRect>}
  </Group>;
});
function InkPath({ path, brush, color, width }: { path: SkPath | SharedValue<SkPath>; brush: HandStroke['brush']; color: string; width: number }) {
  return <Group opacity={brush === 'highlight' ? .4 : 1}>
    <Path path={path} style="stroke" color={color} strokeWidth={width} strokeCap="round" strokeJoin="round">
      {brush === 'neon' && <Shadow dx={0} dy={0} blur={16} color={color} />}
    </Path>
    {brush === 'neon' && <Path path={path} style="stroke" color="#FFFFFF" strokeWidth={width * .38} strokeCap="round" strokeJoin="round" />}
  </Group>;
}
export const HandDrawingLayer = memo(function HandDrawingLayer({ strokes, active, selectedId, editing, width, height, offsetX, offsetY, scale }: {
  strokes: HandStroke[]; active?: ActiveHandStroke; selectedId?: string | null; editing?: HandStrokeEditing; width: number; height: number;
  offsetX: number; offsetY: number; scale: number;
}) {
  const transform = useMemo(() => [{ translateX: offsetX }, { translateY: offsetY }, { scale }], [offsetX, offsetY, scale]);
  if (!strokes.length && !active) return null;
  return <Canvas pointerEvents="none" style={[StyleSheet.absoluteFill, { width, height }]}>
    <Group transform={transform}>
      {strokes.map(stroke => <InkStroke key={stroke.id} stroke={stroke} selected={stroke.id === selectedId} editing={editing?.id === stroke.id ? editing : undefined} />)}
      {active && <InkPath {...active} />}
    </Group>
  </Canvas>;
});
