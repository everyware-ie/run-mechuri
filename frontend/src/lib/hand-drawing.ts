import { CANVAS_HEIGHT, CANVAS_WIDTH } from './route-projection';

export type InkPoint = { x: number; y: number };
export type InkBrush = 'pen' | 'highlight' | 'neon';
export type HandStroke = { id: string; brush: InkBrush; color: string; width: number; points: InkPoint[]; offset?: InkPoint; scale?: number };
export const INK_MIN_SCALE = 1 / 3;
export const INK_MAX_SCALE = 3;
export const inkScale = (value: number) => Math.min(INK_MAX_SCALE, Math.max(INK_MIN_SCALE, value));
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
      width: Number.isFinite(raw.width) ? Math.min(48, Math.max(4, raw.width)) : 12, points,
      ...(raw.offset ? { offset: {
        x: Number.isFinite(raw.offset.x) ? Math.min(CANVAS_WIDTH * 3, Math.max(-CANVAS_WIDTH * 3, raw.offset.x)) : 0,
        y: Number.isFinite(raw.offset.y) ? Math.min(CANVAS_HEIGHT * 3, Math.max(-CANVAS_HEIGHT * 3, raw.offset.y)) : 0,
      } } : {}),
      ...(Number.isFinite(raw.scale) ? { scale: inkScale(raw.scale) } : {}),
    }];
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
  const next = strokes.filter(stroke => {
    const points = handStrokePoints(stroke);
    return !points.some((point, index) =>
      segmentDistance(from, to, points[Math.max(0, index - 1)], point) <= radius + stroke.width * (stroke.scale ?? 1) / 2);
  });
  return next.length === strokes.length ? strokes : next;
}

/** 썸네일 프레이밍은 구석에 그린 손그림도 포함한다. */
export function handDrawingBounds(strokes: HandStroke[]) {
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (const stroke of strokes) {
    const margin = (stroke.width / 2 + (stroke.brush === 'neon' ? 32 : 0)) * (stroke.scale ?? 1);
    for (const p of handStrokePoints(stroke)) {
      left = Math.min(left, p.x - margin); right = Math.max(right, p.x + margin);
      top = Math.min(top, p.y - margin); bottom = Math.max(bottom, p.y + margin);
    }
  }
  return Number.isFinite(left) ? [{ x: left, y: top, width: right - left, height: bottom - top }] : [];
}

/** 원본 점은 보존한다. 이동·크기와 선택·지우개·썸네일 모두 같은 변환을 쓴다. */
export function handStrokeGeometry(stroke: Pick<HandStroke, 'points'>) {
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (const p of stroke.points) {
    left = Math.min(left, p.x); right = Math.max(right, p.x);
    top = Math.min(top, p.y); bottom = Math.max(bottom, p.y);
  }
  if (!stroke.points.length) return { cx: 0, cy: 0, left: 0, top: 0, width: 0, height: 0 };
  return { cx: (left + right) / 2, cy: (top + bottom) / 2, left, top, width: right - left, height: bottom - top };
}
export function handStrokePoints(stroke: HandStroke): InkPoint[] {
  if (!stroke.offset && !stroke.scale) return stroke.points;
  const { cx, cy } = handStrokeGeometry(stroke), scale = stroke.scale ?? 1;
  return stroke.points.map(p => ({ x: cx + (p.x - cx) * scale + (stroke.offset?.x ?? 0),
    y: cy + (p.y - cy) * scale + (stroke.offset?.y ?? 0) }));
}
/** 그린 순서의 역순으로, 넓은 빈 사각형 대신 실제 선을 선택한다. */
export function hitHandStroke(strokes: HandStroke[], point: InkPoint, radius: number): string | null {
  for (let i = strokes.length - 1; i >= 0; i--) {
    const stroke = strokes[i], points = handStrokePoints(stroke);
    if (points.some((p, index) => distanceToSegment(point, points[Math.max(0, index - 1)], p)
      <= radius + stroke.width * (stroke.scale ?? 1) / 2)) return stroke.id;
  }
  return null;
}
/** 화면에서 전부 사라지지 않게 최소 일부를 남긴다. 점별 clamp로 그림을 찌그러뜨리지 않는다. */
export function constrainHandStroke(stroke: HandStroke, offset: InkPoint, scale: number): HandStroke {
  const s = inkScale(scale), { cx, cy, width, height } = handStrokeGeometry(stroke);
  const visible = 32;
  return { ...stroke, scale: s, offset: {
    x: Math.min(CANVAS_WIDTH - visible - cx + width * s / 2, Math.max(visible - cx - width * s / 2, offset.x)),
    y: Math.min(CANVAS_HEIGHT - visible - cy + height * s / 2, Math.max(visible - cy - height * s / 2, offset.y)),
  } };
}
