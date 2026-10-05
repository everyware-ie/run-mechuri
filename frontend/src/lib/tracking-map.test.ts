import { emptyRunMap, mapSegments, mergeMapPage, shortRouteRegion } from './tracking-map';
import type { RunMapPage, RunPoint } from '../../modules/run-tracking/src/RunTracking';
const p = (latitude: number, longitude: number, segment = 1): RunPoint => ({ latitude, longitude, time: 1, segment });
const page = (patch: Partial<RunMapPage> = {}): RunMapPage => ({ revision: 'a', runId: 'run', reset: true, fromIndex: 0, nextIndex: 1, total: 1, points: [p(37, 127)], position: p(37, 127), ...patch });
test('incremental pages retain the route; unchanged polls do not redraw it', () => {
  const first = mergeMapPage(emptyRunMap, page());
  const second = mergeMapPage(first, page({ reset: false, fromIndex: 1, nextIndex: 2, total: 2, points: [p(37.001, 127)] }));
  expect(second.points).toHaveLength(2);
  expect(mergeMapPage(second, page({ reset: false, fromIndex: 2, nextIndex: 2, total: 2, points: [] }))).toBe(second);
});
test('recovering the same record replaces old coordinates and rejects missing pages', () => {
  const first = mergeMapPage(emptyRunMap, page());
  expect(mergeMapPage(first, page({ revision: 'b', points: [], nextIndex: 0, total: 0, position: null })).points).toEqual([]);
  expect(() => mergeMapPage(first, page({ reset: false, fromIndex: 2, nextIndex: 3 }))).toThrow();
});
test('pause/gap and invalid coordinates never become joining lines', () => {
  const segments = mapSegments([p(37, 127), p(37.001, 127), p(37.002, 127, 2), p(NaN, 127, 2), p(37.003, 127, 2)]);
  expect(segments.map(s => s.length)).toEqual([2, 1, 1]);
});
test('map thinning keeps corners, segment endpoints and original points untouched', () => {
  const route = [p(37, 127), p(37.00001, 127), p(37.001, 127), p(37.001, 127.001), p(37.001, 127.002)];
  const copy = JSON.stringify(route);
  const [segment] = mapSegments(route);
  expect(segment).toEqual([route[0], route[2], route[4]]);
  expect(JSON.stringify(route)).toBe(copy);
});

test('a GPS readiness timeout retains the actual last position, until context reset', () => {
  const first = mergeMapPage(emptyRunMap, page({ runId: null, points: [], nextIndex: 0, total: 0 }));
  expect(mergeMapPage(first, page({ runId: null, reset: false, fromIndex: 0, nextIndex: 0, total: 0, points: [], position: null }))).toBe(first);
  expect(mergeMapPage(first, page({ runId: null, revision: 'b', points: [], nextIndex: 0, total: 0, position: null })).position).toBeNull();
});

test('start retains a fresh prepared position while waiting for the first sample, not on recovery', () => {
  const prepared = mergeMapPage(emptyRunMap, page({ runId: null, points: [], nextIndex: 0, total: 0 }));
  const start = page({ revision: 'b', points: [], nextIndex: 0, total: 0, position: null });
  expect(mergeMapPage(prepared, start, 10).position).toBe(prepared.position);
  expect(mergeMapPage(prepared, start, 20).position).toBeNull();
  expect(mergeMapPage(prepared, start, -10).position).toBeNull();
  expect(mergeMapPage({ ...prepared, position: { ...prepared.position!, time: NaN } }, start, 10).position).toBeNull();
  const existing = { ...prepared, runId: 'old' };
  expect(mergeMapPage(existing, start, 10).position).toBeNull();
});

test('tiny and single-point routes stay at street scale; larger routes use full extent fitting', () => {
  const one = shortRouteRegion([p(37.55, 127)])!;
  expect(one.latitude).toBe(37.55);
  expect(one.latitudeDelta).toBeGreaterThanOrEqual(0.003);
  const short = shortRouteRegion([p(37.55, 127), p(37.55002, 127.00003)])!;
  expect(short.latitudeDelta).toBeGreaterThanOrEqual(0.003);
  expect(shortRouteRegion([p(37.55, 127), p(37.57, 127)])).toBeNull();
  expect(shortRouteRegion([])).toBeNull();
});
