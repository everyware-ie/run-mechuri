import { recordsToUpload, toUpload } from './backup';
import type { RunSummary } from '../../modules/run-tracking/src/RunTracking';

jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn() }));
jest.mock('@/lib/account', () => ({ getSavedToken: jest.fn(), uploadRecord: jest.fn() }));
jest.mock('../../modules/run-tracking/src/RunTracking', () => ({ Tracking: null }));

const run = (id: string, status: RunSummary['status'] = 'completed') => ({
  id, status, started: 1000, elapsed: 1800, duration: 1700, distance: 5230, averagePace: 325,
  averageHeartRate: 150, maxHeartRate: 170, steps: 5000, averageCadence: 172,
  batteryStart: 0.9, errors: ['gps gap'], rejected: { accuracy: 3 },
}) as unknown as RunSummary;

describe('백업 (로그인 FRD §5)', () => {
  it('완료된 기록 중 아직 올리지 않은 것만 올린다', () => {
    const picked = recordsToUpload([run('a'), run('b'), run('c', 'running')], new Set(['a']));
    expect(picked.map((r) => r.id)).toEqual(['b']);
  });

  it('진단 정보는 올리지 않고 종료 시각은 시작 + 경과로 계산한다', () => {
    const body = toUpload(run('a'), [{ latitude: 37.5, longitude: 127, time: 1001, segment: 0 }], [{ time: 1060, bpm: 140 }]);
    expect(body.endedAt).toBe(2800);
    expect(body.points).toHaveLength(1);
    expect(JSON.stringify(body)).not.toMatch(/battery|errors|rejected|gps gap/);
  });
});
