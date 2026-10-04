import { cumulativeCanvasDistances, pointAtDistance, projectPoints } from './route-projection';
import { lightingDistanceMeters, lightingSegments } from './segment-lighting';

const points = [{ latitude: 37, longitude: 127 }, { latitude: 37.001, longitude: 127.001 }];

describe('구간 점등은 화면 픽셀이 아닌 기록 거리 기준', () => {
  test.each([
    [1947, [500, 1000, 1500, 1947]],
    [3000, [500, 1000, 1500, 2000, 2500, 3000]],
    [6010, [1000, 2000, 3000, 4000, 5000, 6000, 6010]],
    [16000, [2000, 4000, 6000, 8000, 10000, 12000, 14000, 16000]],
    [20000, [5000, 10000, 15000, 20000]],
  ])('%im 기록의 마지막 잔여 구간까지 표시', (meters, ends) => {
    const bounds = lightingSegments(meters);
    expect(bounds.map(bound => bound.endMeters)).toEqual(ends);
    expect(bounds[0].startFraction).toBe(0);
    expect(bounds.at(-1)?.endFraction).toBe(1);
    bounds.slice(1).forEach((bound, i) => expect(bound.startFraction).toBe(bounds[i].endFraction));
  });

  it('12개를 넘는 긴 기록도 끝까지 점등', () => {
    const bounds = lightingSegments(70000);
    expect(bounds).toHaveLength(14);
    expect(bounds.at(-1)?.endMeters).toBe(70000);
  });

  it('같은 기록을 확대하거나 회전해도 구간 비율과 수가 동일', () => {
    const meters = lightingDistanceMeters(6010, points);
    const bounds = lightingSegments(meters);
    const projected = projectPoints(points);
    for (const scale of [0.5, 1, 2]) {
      const canvas = projected.map(p => ({ x: -p.y * scale, y: p.x * scale }));
      const cumulative = cumulativeCanvasDistances(canvas);
      const total = cumulative.at(-1)!;
      const marker = pointAtDistance(bounds[0].endFraction * total, canvas, cumulative)!;
      expect(marker.x).toBeCloseTo(canvas[0].x + (canvas[1].x - canvas[0].x) * 1000 / 6010);
      expect(marker.y).toBeCloseTo(canvas[0].y + (canvas[1].y - canvas[0].y) * 1000 / 6010);
      expect(bounds).toHaveLength(7);
    }
  });

  it('총 거리 누락은 GPS 미터로 대체하고 비정상 기록은 점을 만들지 않음', () => {
    for (const invalid of [undefined, 0, -1, NaN, Infinity]) {
      const fallback = lightingDistanceMeters(invalid, points);
      expect(fallback).toBeGreaterThan(100);
      expect(fallback).toBeLessThan(200);
    }
    for (const invalid of [0, -1, NaN, Infinity]) expect(lightingSegments(invalid)).toEqual([]);
    expect(lightingDistanceMeters(undefined, [])).toBe(0);
  });
});
