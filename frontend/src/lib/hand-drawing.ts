import { CANVAS_HEIGHT, CANVAS_WIDTH } from './route-projection';

export type InkPoint = { x: number; y: number };
export type InkBrush = 'pen' | 'highlight' | 'neon';
export type HandStroke = { id: string; brush: InkBrush; color: string; width: number; points: InkPoint[] };
export const INK_COLORS = ['#FFFFFF', '#111111', '#FFF3EC', '#FF985C', '#8EF0CE', '#8ECFFF', '#FFADD5', '#C5AEFF'];
export const MAX_STROKES = 100;
export const MAX_INK_POINTS = 10000;
export const EMPTY_HAND_DRAWING: HandStroke[] = [];
export const inkPoint = (x: number, y: number): InkPoint => ({
  x: Math.min(CANVAS_WIDTH, Math.max(0, x)), y: Math.min(CANVAS_HEIGHT, Math.max(0, y)),
});

/** 옛 저장분은 빈 그림이다. 비정상 입력은 그리기·메모리에 안전한 범위로 정리한다. */
export function normalizeHandDrawing(value: unknown): HandStroke[] {
  if (!Array.isArray(value)) return EMPTY_HAND_DRAWING;
  let remaining = MAX_INK_POINTS;
  const ids = new Set<string>();
  return value.slice(0, MAX_STROKES).flatMap((raw, index) => {
    if (!raw || !Array.isArray(raw.points) || !['pen', 'highlight', 'neon'].includes(raw.brush) || !remaining) return [];
    const points: InkPoint[] = raw.points.filter((p: InkPoint) => p && Number.isFinite(p.x) && Number.isFinite(p.y))
      .slice(0, remaining).map((p: InkPoint) => inkPoint(p.x, p.y));
    remaining -= points.length;
    if (!points.length) return [];
    const baseId = typeof raw.id === 'string' ? raw.id : `ink-${index}`;
    let id = baseId;
    while (ids.has(id)) id += `-${index}`;
    ids.add(id);
    return [{ id, brush: raw.brush as InkBrush,
      color: INK_COLORS.includes(raw.color) ? raw.color : '#FFFFFF',
      width: Number.isFinite(raw.width) ? Math.min(48, Math.max(4, raw.width)) : 12, points }];
  });
}

const distanceToSegment = (p: InkPoint, a: InkPoint, b: InkPoint) => {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = dx || dy ? Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy))) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
};
const cross = (a: InkPoint, b: InkPoint, p: InkPoint) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
function segmentDistance(a: InkPoint, b: InkPoint, c: InkPoint, d: InkPoint) {
  if (Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)) <= Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x))
    && Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)) <= Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y))
    && cross(a, b, c) * cross(a, b, d) <= 0 && cross(c, d, a) * cross(c, d, b) <= 0) return 0;
  return Math.min(distanceToSegment(a, c, d), distanceToSegment(b, c, d), distanceToSegment(c, a, b), distanceToSegment(d, a, b));
}
/** 빠르게 가로질러도 선분 교차로 잡는다. 손그림 획만 제거하며 다른 레이어는 입력받지 않는다. */
export function eraseHandStrokes(strokes: HandStroke[], from: InkPoint, to: InkPoint, radius: number) {
  const next = strokes.filter(stroke => !stroke.points.some((point, index) =>
    segmentDistance(from, to, stroke.points[Math.max(0, index - 1)], point) <= radius + stroke.width / 2));
  return next.length === strokes.length ? strokes : next;
}

/** 썸네일 프레이밍은 구석에 그린 손그림도 포함한다. */
export function handDrawingBounds(strokes: HandStroke[]) {
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (const stroke of strokes) {
    const margin = stroke.width / 2 + (stroke.brush === 'neon' ? 32 : 0);
    for (const p of stroke.points) {
      left = Math.min(left, p.x - margin); right = Math.max(right, p.x + margin);
      top = Math.min(top, p.y - margin); bottom = Math.max(bottom, p.y + margin);
    }
  }
  return Number.isFinite(left) ? [{ x: left, y: top, width: right - left, height: bottom - top }] : [];
}
