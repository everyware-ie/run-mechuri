import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  cumulativeCanvasDistances,
  cumulativeDistances,
  pointAtDistance,
  pointsUpToDistance,
  projectPoints,
  segmentUnitMeters,
  toSvgPath,
  type CanvasPoint,
  type Point,
} from './route-projection';

describe('projectPoints', () => {
  it('returns an empty array for no points', () => {
    expect(projectPoints([])).toEqual([]);
  });

  it('centers a single point on the canvas', () => {
    const [p] = projectPoints([{ latitude: 37.5, longitude: 127.0 }]);
    expect(p.x).toBeCloseTo(CANVAS_WIDTH / 2);
    expect(p.y).toBeCloseTo(CANVAS_HEIGHT / 2);
  });

  it('places north at a smaller y than south (§4: 북쪽=위=작은 y)', () => {
    const [north, south] = projectPoints([
      { latitude: 37.6, longitude: 127.0 },
      { latitude: 37.5, longitude: 127.0 },
    ]);
    expect(north.y).toBeLessThan(south.y);
  });

  it('centers the whole track envelope on the canvas', () => {
    const points: Point[] = [
      { latitude: 37.50, longitude: 127.00 },
      { latitude: 37.51, longitude: 127.02 },
      { latitude: 37.49, longitude: 126.99 },
    ];
    const projected = projectPoints(points);
    const xs = projected.map((p) => p.x);
    const ys = projected.map((p) => p.y);
    const midX = (Math.min(...xs) + Math.max(...xs)) / 2;
    const midY = (Math.min(...ys) + Math.max(...ys)) / 2;
    expect(midX).toBeCloseTo(CANVAS_WIDTH / 2, 5);
    expect(midY).toBeCloseTo(CANVAS_HEIGHT / 2, 5);
  });
});

describe('cumulativeDistances', () => {
  it('starts at 0 and is non-decreasing', () => {
    const points: Point[] = [
      { latitude: 37.50, longitude: 127.00 },
      { latitude: 37.501, longitude: 127.001 },
      { latitude: 37.502, longitude: 127.002 },
    ];
    const dist = cumulativeDistances(points);
    expect(dist[0]).toBe(0);
    for (let i = 1; i < dist.length; i++) {
      expect(dist[i]).toBeGreaterThanOrEqual(dist[i - 1]);
    }
  });

  it('matches a known haversine distance (~111.19m per 0.001° latitude)', () => {
    const dist = cumulativeDistances([
      { latitude: 37.5, longitude: 127.0 },
      { latitude: 37.501, longitude: 127.0 },
    ]);
    expect(dist[1]).toBeCloseTo(111.19, 0);
  });
});

describe('pointsUpToDistance / pointAtDistance (§5-4: 진행률은 거리 기준)', () => {
  const projected: CanvasPoint[] = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 20, y: 0 },
  ];
  const cumulative = cumulativeCanvasDistances(projected);

  it('returns just the head point at or before the start', () => {
    expect(pointsUpToDistance(0, projected, cumulative)).toEqual([{ x: 0, y: 0 }]);
    expect(pointAtDistance(0, projected, cumulative)).toEqual({ x: 0, y: 0 });
  });

  it('returns the whole track at or past the end', () => {
    expect(pointsUpToDistance(999, projected, cumulative)).toEqual(projected);
    expect(pointAtDistance(999, projected, cumulative)).toEqual(projected[projected.length - 1]);
  });

  it('interpolates linearly inside a segment', () => {
    const mid = pointAtDistance(15, projected, cumulative);
    expect(mid?.x).toBeCloseTo(15);
    expect(mid?.y).toBeCloseTo(0);
  });

  it('pointAtDistance agrees with the last point of pointsUpToDistance', () => {
    for (const target of [0, 5, 10, 15, 20, 25]) {
      const upTo = pointsUpToDistance(target, projected, cumulative);
      const at = pointAtDistance(target, projected, cumulative);
      expect(at).toEqual(upTo[upTo.length - 1]);
    }
  });
});

describe('cumulativeCanvasDistances', () => {
  it('sums straight-line canvas distances', () => {
    const points: CanvasPoint[] = [{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 3, y: 8 }];
    expect(cumulativeCanvasDistances(points)).toEqual([0, 5, 9]);
  });
});

describe('toSvgPath', () => {
  it('returns an empty string for fewer than 2 points', () => {
    expect(toSvgPath([])).toBe('');
    expect(toSvgPath([{ x: 0, y: 0 }])).toBe('');
  });

  it('builds an M/L path string', () => {
    expect(toSvgPath([{ x: 0, y: 0 }, { x: 1, y: 2 }])).toBe('M 0 0 L 1 2');
  });
});

describe('segmentUnitMeters (§6-3: 점등 5~8회 목표)', () => {
  it.each([
    [1, 500],
    [3, 500],
    [5, 1000],
    [8, 1000],
    [10, 2000],
    [16, 2000],
    [20, 5000],
  ])('%dkm -> %dm segments', (km, expected) => {
    expect(segmentUnitMeters(km * 1000)).toBe(expected);
  });
});
