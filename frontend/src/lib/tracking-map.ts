import type { RunMapPage, RunPoint } from '../../modules/run-tracking/src/RunTracking';

export type RunMapData = { revision: string | null; runId: string | null; points: RunPoint[]; position: RunPoint | null };
export const emptyRunMap: RunMapData = { revision: null, runId: null, points: [], position: null };

// Reject out-of-order pages; a native engine replacement (including recovery of
// the same run) always resets the cursor so an old route cannot be appended.
export function mergeMapPage(previous: RunMapData, page: RunMapPage, now = Date.now() / 1000): RunMapData {
  const reset = page.reset || page.revision !== previous.revision || page.runId !== previous.runId;
  const base = reset ? [] : previous.points;
  if (page.fromIndex !== base.length || page.nextIndex !== page.fromIndex + page.points.length) throw new Error('지도 좌표를 다시 불러오는 중이에요.');
  // Losing GPS freshness must not remove a map the user is exploring. Keep
  // the last real position in this context; the view labels it stale after 15s.
  // The first recording callback can lag after Start. Carry only a fresh
  // prepared position into a new run, never a previous run or recovered route.
  const age = previous.position ? now - previous.position.time : Infinity;
  const starting = previous.runId === null && page.runId !== null && age >= -2 && age <= 15;
  const position = page.position ?? (reset && !starting ? null : previous.position);
  const samePosition = previous.position?.time === position?.time && previous.position?.latitude === position?.latitude && previous.position?.longitude === position?.longitude;
  if (!reset && !page.points.length && samePosition) return previous;
  return { revision: page.revision, runId: page.runId, points: page.points.length ? [...base, ...page.points] : base, position };
}

// Thin only the map drawing, never recorded coordinates or metric calculations.
// Iterative Douglas–Peucker retains corners and both ends, within 2 metres.
function simplify(points: RunPoint[]): RunPoint[] {
  if (points.length < 3) return points;
  const latitude = points[0].latitude * Math.PI / 180;
  const xy = points.map(p => ({ x: (p.longitude - points[0].longitude) * 111320 * Math.cos(latitude), y: (p.latitude - points[0].latitude) * 111320 }));
  const keep = new Set([0, points.length - 1]);
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop()!;
    const a = xy[first], b = xy[last], dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy;
    let farthest = -1, max = 4;
    for (let index = first + 1; index < last; index++) {
      const p = xy[index], t = length ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length)) : 0;
      const distance = (p.x - a.x - t * dx) ** 2 + (p.y - a.y - t * dy) ** 2;
      if (distance > max) { max = distance; farthest = index; }
    }
    if (farthest >= 0) { keep.add(farthest); stack.push([first, farthest], [farthest, last]); }
  }
  return [...keep].sort((a, b) => a - b).map(index => points[index]);
}
export function mapSegments(points: RunPoint[]): RunPoint[][] {
  const segments: RunPoint[][] = [];
  let current: RunPoint[] = [];
  for (const point of points) {
    if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude) || Math.abs(point.latitude) > 90 || Math.abs(point.longitude) > 180) { current = []; continue; }
    if (!current.length || current[current.length - 1].segment !== point.segment) { current = []; segments.push(current); }
    current.push(point);
  }
  return segments.map(simplify);
}

// Fit-to-coordinates otherwise zooms a stationary GPS trace down to individual
// buildings. Keep a street-level minimum for single points and very short runs.
export function shortRouteRegion(points: RunPoint[]) {
  if (!points.length) return null;
  let south = Infinity, north = -Infinity, west = Infinity, east = -Infinity;
  for (const p of points) { south = Math.min(south, p.latitude); north = Math.max(north, p.latitude); west = Math.min(west, p.longitude); east = Math.max(east, p.longitude); }
  const latitude = (south + north) / 2;
  const minimumLatitude = 0.003;
  const minimumLongitude = minimumLatitude / Math.max(0.1, Math.cos(latitude * Math.PI / 180));
  if (north - south > minimumLatitude || east - west > minimumLongitude) return null;
  return { latitude, longitude: (west + east) / 2, latitudeDelta: Math.max(minimumLatitude, (north - south) * 1.5), longitudeDelta: Math.max(minimumLongitude, (east - west) * 1.5) };
}
