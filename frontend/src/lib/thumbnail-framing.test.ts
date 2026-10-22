import { computeThumbnailFrame } from './thumbnail-framing';
import { handDrawingBounds } from './hand-drawing';
it('경로와 멀리 떨어진 손그림 전체를 한 썸네일 안에 담는다', () => {
  const drawing = { id: 'ink', brush: 'neon' as const, color: '#FFFFFF', width: 24, points: [{ x: 1000, y: 1850 }] };
  const bounds = handDrawingBounds([drawing]);
  const frame = computeThumbnailFrame([{ x: 500, y: 400 }, { x: 600, y: 500 }], { x: 0, y: 0, scale: 1, rotationDeg: 0 }, null, bounds);
  expect(frame.x).toBeLessThanOrEqual(bounds[0].x);
  expect(frame.y).toBeLessThanOrEqual(400);
  expect(frame.x + frame.width).toBeGreaterThanOrEqual(bounds[0].x + bounds[0].width);
  expect(frame.y + frame.height).toBeGreaterThanOrEqual(bounds[0].y + bounds[0].height);
});
