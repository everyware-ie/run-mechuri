import { mergeRunRecords, runaryRecord, runaryRecordID, runaryTrack } from './runary-records';
import { cumulativeCanvasDistances, cumulativeDistances, pointAtDistance, projectPoints, toSvgPath } from './route-projection';
import { applySmoothing } from './route-smoothing';
import type { RunSummary, RunPoint } from '../../modules/run-tracking/src/RunTracking';

const summary = { id: 'local', started: 100, status: 'completed', duration: 1800, distance: 5100,
  averagePace: 352.94, averageHeartRate: 145, acceptedCount: 4, hasDrawableRoute: true } as RunSummary;
const points: RunPoint[] = [
  { latitude: 0, longitude: 0, time: 100, segment: 0 }, { latitude: 0, longitude: 0.001, time: 120, segment: 0 },
  { latitude: 1, longitude: 1, time: 300, segment: 3 }, { latitude: 1, longitude: 1.001, time: 320, segment: 3 },
];
test('completed local data is copied with namespaced identity and actual metrics', () => {
  const selected = runaryTrack({ summary, points });
  expect(selected.run).toMatchObject({ id: 'runary:local', source: 'runary', distanceMeters: 5100, durationSeconds: 1800, averageHeartRate: 145 });
  expect(selected.track.coordinates.map(p => p.segment)).toEqual([0, 0, 1, 1]);
  selected.track.coordinates[0].latitude = 2;
  expect(points[0].latitude).toBe(0);
  expect(runaryRecordID(selected.run.id)).toBe('local');
  expect(runaryRecordID('local')).toBeNull();
});
test('missing pace and heart stay missing, never synthetic zero', () => {
  const run = runaryRecord({ ...summary, averagePace: undefined, averageHeartRate: undefined });
  expect(run.averagePaceSecPerKm).toBeNull(); expect(run.averageHeartRate).toBeUndefined();
});
test('unfinished, isolated and invalid coordinates cannot become a drawable run', () => {
  expect(runaryRecord({ ...summary, status: 'running' }).hasRoute).toBe(false);
  expect(() => runaryTrack({ summary: { ...summary, status: 'paused' }, points })).toThrow();
  expect(() => runaryTrack({ summary, points: [points[0], points[2]] })).toThrow();
  expect(() => runaryTrack({ summary, points: [points[0], { ...points[1], latitude: NaN }, points[2]] })).toThrow();
});
test('bad points and reversed timestamps create a break rather than a shortcut', () => {
  const selected = runaryTrack({ summary, points: [points[0], points[1], { ...points[1], time: 110 }, { ...points[2], segment: 0 }, { ...points[3], segment: 0 }] });
  expect(selected.track.coordinates.map(p => p.segment)).toEqual([0, 0, 1, 1]);
});
test('local and health records share date ordering without identity collisions', () => {
  const own = runaryRecord(summary);
  const health = { ...own, id: 'local', date: new Date(200000).toISOString(), source: 'healthkit' as const };
  expect(mergeRunRecords([health], [own]).map(p => p.id)).toEqual(['local', 'runary:local']);
});
test('projection, smoothing, path and animation preserve gaps', () => {
  const track = runaryTrack({ summary, points }).track;
  expect(cumulativeDistances(track.coordinates)[2]).toBe(cumulativeDistances(track.coordinates)[1]);
  const projected = applySmoothing(projectPoints(track.coordinates), { smooth: 100, corner: 100 });
  expect(projected.map(p => p.segment)).toEqual([0, 0, 1, 1]);
  const distances = cumulativeCanvasDistances(projected);
  expect(distances[2]).toBe(distances[1]);
  expect(toSvgPath(projected).match(/M /g)).toHaveLength(2);
  const justAfterGap = pointAtDistance(distances[1] + 0.01, projected, distances)!;
  expect(justAfterGap.segment).toBe(1);
  expect(justAfterGap.x).toBeGreaterThanOrEqual(projected[2].x);
});

test('Health export is hidden only while its exact Runary original exists', () => {
  const own = runaryRecord(summary);
  const exported = { ...own, id: 'health-copy', source: 'healthkit' as const, runaryRunID: summary.id };
  const unrelated = { ...exported, id: 'other-app', runaryRunID: undefined };
  expect(mergeRunRecords([exported, unrelated], [own]).map(r => r.id).sort()).toEqual(['other-app', own.id].sort());
  expect(mergeRunRecords([exported], []).map(r => r.id)).toEqual(['health-copy']);
});
