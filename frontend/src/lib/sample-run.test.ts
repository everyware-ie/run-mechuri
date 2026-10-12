import { createSampleRun, isSampleRun, SAMPLE_HEART_ID } from './sample-run';
import { cumulativeDistances, projectPoints } from './route-projection';

it('샘플의 거리·페이스·시각이 실제 합성 트랙과 일치한다', () => {
  const { run, track } = createSampleRun();
  const points = track.coordinates;
  expect(run.id).toBe(SAMPLE_HEART_ID);
  expect(cumulativeDistances(points).at(-1)).toBeCloseTo(run.distanceMeters, 5);
  expect(run.distanceMeters).toBeCloseTo(5000, 0);
  expect(run.averagePaceSecPerKm * run.distanceMeters / 1000).toBeCloseTo(run.durationSeconds, 5);
  expect(points[0].timestamp).toBe(run.date);
  expect(Date.parse(points.at(-1)!.timestamp) - Date.parse(points[0].timestamp)).toBe(run.durationSeconds * 1000);
  expect(points.every((point, index) => index === 0 || point.timestamp >= points[index - 1].timestamp)).toBe(true);
  expect(run.averageHeartRate).toBeUndefined();
});

it('하트는 닫힌 경로이며 앱 캔버스에서 잘리지 않는다', () => {
  const { track } = createSampleRun();
  const first = track.coordinates[0], last = track.coordinates.at(-1)!;
  expect(last.latitude).toBeCloseTo(first.latitude, 10);
  expect(last.longitude).toBeCloseTo(first.longitude, 10);
  expect(projectPoints(track.coordinates).every(p => p.x >= 0 && p.x <= 1080 && p.y >= 0 && p.y <= 1920)).toBe(true);
});

it('샘플 선택마다 독립된 트랙을 반환해 이전 편집이 다음 체험에 섞이지 않는다', () => {
  const first = createSampleRun();
  const second = createSampleRun();
  first.track.coordinates[0].latitude = 40;
  first.run.distanceMeters = 1;
  expect(second.track.coordinates[0].latitude).not.toBe(40);
  expect(second.run.distanceMeters).toBeCloseTo(5000, 0);
});

it('건강 기록을 샘플로 잘못 표시하지 않는다', () => {
  expect(isSampleRun(createSampleRun().run)).toBe(true);
  expect(isSampleRun({ id: 'actual-workout-id' })).toBe(false);
  expect(isSampleRun({ id: 'sample:unknown' })).toBe(false);
  expect(isSampleRun(null)).toBe(false);
});
