import { diagnosticSummary, runPaths, runPace, runTime } from './tracking-display';
import type { RunSummary } from '../../modules/run-tracking/src/RunTracking';

it('페이스 초 올림과 시간 표시가 분 경계를 넘을 때 올바르다', () => {
  expect(runPace(359.8)).toBe('6′00″');
  expect(runPace(null)).toBe('—');
  expect(runTime(125.8)).toBe('2:05');
});
it('복구·GPS 누락으로 나뉜 구간은 직선으로 이어 그리지 않는다', () => {
  const paths = runPaths([
    { latitude: 0, longitude: 0, time: 1, segment: 1 },
    { latitude: 0, longitude: 0.001, time: 2, segment: 1 },
    { latitude: 0.002, longitude: 0, time: 40, segment: 2 },
    { latitude: 0.002, longitude: 0.001, time: 41, segment: 2 },
  ]);
  expect(paths).toHaveLength(2);
  expect(paths.every(path => path.startsWith('M') && path.split('L').length === 2)).toBe(true);
  expect(runPaths([])).toEqual([]);
});
it('진단 복사는 집계만 포함하고 ID·좌표·원본 심박 배열은 제외한다', () => {
  const run = {
    id: 'private-id', status: 'completed', distance: 1000, duration: 300, elapsed: 320,
    rawCount: 100, acceptedCount: 90, rejected: { jump: 1 }, maxSampleGap: 4, maxReceiptGap: 4,
    foregroundCount: 10, backgroundCount: 90, incomplete: true, errors: [], metricVersion: 1,
    watchEnabled: false, charging: false, lowPower: false,
    points: [{ latitude: 99.123456, longitude: 44.123456 }], hearts: [{ bpm: 177.123456 }],
  } as unknown as RunSummary;
  const text = diagnosticSummary(run, '1.0.0 (1)', 'test');
  expect(text).toContain('1.00 km');
  expect(text).toContain('internal-v1');
  for (const secret of ['private-id', '99.123456', '44.123456', '177.123456']) expect(text).not.toContain(secret);
});
