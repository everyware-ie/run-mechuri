import { applySmoothing } from './route-smoothing';
import type { CanvasPoint } from './route-projection';

function line(n: number): CanvasPoint[] {
  return Array.from({ length: n }, (_, i) => ({ x: i * 10, y: 0 }));
}

function noisyLine(n: number): CanvasPoint[] {
  // A straight line with small alternating jitter — the kind of noise
  // "직선 다듬기(smooth)" is meant to average out.
  return Array.from({ length: n }, (_, i) => ({ x: i * 10, y: i % 2 === 0 ? 0 : 2 }));
}

describe('applySmoothing', () => {
  it('returns short tracks unchanged (fewer than 3 points)', () => {
    const points: CanvasPoint[] = [{ x: 0, y: 0 }, { x: 10, y: 10 }];
    expect(applySmoothing(points, { smooth: 100, corner: 100 })).toEqual(points);
  });

  it('keeps the first and last point fixed regardless of smoothing (§5: 안전 구간)', () => {
    const points = noisyLine(30);
    const result = applySmoothing(points, { smooth: 80, corner: 80 });
    expect(result[0]).toEqual(points[0]);
    expect(result[result.length - 1]).toEqual(points[points.length - 1]);
  });

  it('at smooth=0, corner=0 stays close to the original shape', () => {
    const points = line(20);
    const result = applySmoothing(points, { smooth: 0, corner: 0 });
    // Endpoints preserved exactly; the path should not have moved off the line.
    expect(result[0]).toEqual(points[0]);
    for (const p of result) {
      expect(p.y).toBeCloseTo(0, 1);
    }
  });

  it("stays within the track's own bounding diagonal (§5: 지나온 영역 밖으로 크게 벗어나지 않는다)", () => {
    const points = noisyLine(40);
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const margin = 5; // px slack for corner rounding overshoot near the endpoints
    const minX = Math.min(...xs) - margin;
    const maxX = Math.max(...xs) + margin;
    const minY = Math.min(...ys) - margin;
    const maxY = Math.max(...ys) + margin;

    for (const strength of [0, 25, 50, 75, 100]) {
      const result = applySmoothing(points, { smooth: strength, corner: strength });
      for (const p of result) {
        expect(p.x).toBeGreaterThanOrEqual(minX);
        expect(p.x).toBeLessThanOrEqual(maxX);
        expect(p.y).toBeGreaterThanOrEqual(minY);
        expect(p.y).toBeLessThanOrEqual(maxY);
      }
    }
  });

  it('never returns fewer than 2 points for a real track', () => {
    const result = applySmoothing(noisyLine(50), { smooth: 100, corner: 100 });
    expect(result.length).toBeGreaterThanOrEqual(2);
  });
});
