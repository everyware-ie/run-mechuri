import type { RouteTransform } from '@/components/route-preview';
import { CANVAS_HEIGHT, CANVAS_WIDTH, type CanvasPoint } from './route-projection';

type Rect = { x: number; y: number; width: number; height: number };

/** 편집된 경로·각인을 같은 배율로 담을 정사각형 창. 원본 편집값은 변경하지 않는다. */
export function computeThumbnailFrame(
  points: CanvasPoint[],
  transform: RouteTransform,
  stamp: Rect | null,
): Rect {
  const boxes: Rect[] = stamp ? [stamp] : [];
  if (points.length >= 2) {
    const angle = transform.rotationDeg * Math.PI / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    for (const point of points) {
      const dx = (point.x - CANVAS_WIDTH / 2) * transform.scale;
      const dy = (point.y - CANVAS_HEIGHT / 2) * transform.scale;
      const x = CANVAS_WIDTH / 2 + transform.x + dx * cos - dy * sin;
      const y = CANVAS_HEIGHT / 2 + transform.y + dx * sin + dy * cos;
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
    const glow = 60 * Math.abs(transform.scale);
    boxes.push({ x: left - glow, y: top - glow, width: right - left + glow * 2, height: bottom - top + glow * 2 });
  }
  if (boxes.length === 0) return { x: (CANVAS_WIDTH - CANVAS_HEIGHT) / 2, y: 0, width: CANVAS_HEIGHT, height: CANVAS_HEIGHT };

  const left = Math.min(...boxes.map(b => b.x));
  const top = Math.min(...boxes.map(b => b.y));
  const right = Math.max(...boxes.map(b => b.x + b.width));
  const bottom = Math.max(...boxes.map(b => b.y + b.height));
  const side = Math.max(1, right - left, bottom - top) / 0.88; // 둘레 6% 여백
  // 가능한 축은 원본 배경 안으로 창을 옮기되, 내용과 여백은 반드시 포함한다.
  const origin = (min: number, max: number, extent: number) => {
    const centered = (min + max - side) / 2;
    const pad = side * 0.06;
    const lower = Math.max(0, max + pad - side);
    const upper = Math.min(extent - side, min - pad);
    return lower <= upper ? Math.max(lower, Math.min(upper, centered)) : centered;
  };
  return { x: origin(left, right, CANVAS_WIDTH), y: origin(top, bottom, CANVAS_HEIGHT), width: side, height: side };
}
