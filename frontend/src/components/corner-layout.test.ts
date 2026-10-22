import { IDENTITY_STAMP, stampLayoutDescriptors, type StampConfig } from '@/components/route-preview';
import type { RunRecord } from '../../modules/health-kit-bridge/src/HealthKitBridge.types';

jest.mock('@shopify/react-native-skia', () => ({}));
jest.mock('react-native-reanimated', () => ({ __esModule: true, default: {} }));
jest.mock('react-native-worklets', () => ({}));
jest.mock('expo-router', () => ({}));

// 경로 렌더링 FRD §7-5 "코너 프리셋은 켜진 항목에 맞춰 자리를 다시 잡는다"
const run: RunRecord = { id: 'corner-qa', date: '2026-10-22T00:00:00Z', distanceMeters: 5410,
  durationSeconds: 2292, averagePaceSecPerKm: 424, averageHeartRate: 165, hasRoute: true };
const base: StampConfig = { ...IDENTITY_STAMP, layout: 'corner', placeName: '신대방동', captions: [] };
const only = (...items: (keyof StampConfig['enabled'])[]): StampConfig => ({ ...base,
  enabled: { distance: false, time: false, pace: false, heartRate: false, date: false, place: false,
    ...Object.fromEntries(items.map(i => [i, true])) } });
const nodes = (config: StampConfig) => stampLayoutDescriptors(run, config, 1).texts;
const byKey = (config: StampConfig, key: string) => nodes(config).find(n => n.key === key);

it('모든 항목을 켜면 날짜는 통계 묶음의 첫 줄로 붙고 위에서 떨어지지 않는다', () => {
  const config = base;
  const date = byKey(config, 'date')!;
  const firstLabel = byKey(config, 'stat-label-0')!;
  expect(date.anchor).toBe('end');
  expect(date.x).toBe(firstLabel.x);
  // 날짜와 첫 통계 사이가 통계 줄 사이보다 벌어지면 날짜가 혼자 떨어져 보인다
  const rowPitch = byKey(config, 'stat-label-1')!.y - firstLabel.y;
  const gap = firstLabel.y - date.y;
  expect(gap).toBeGreaterThan(0);
  expect(gap).toBeLessThanOrEqual(rowPitch);
});

it('큰 숫자로 쓴 항목은 통계에 다시 나오지 않는다', () => {
  // 거리가 큰 숫자이면 시간·페이스가 통계로 간다
  expect(nodes(only('distance', 'time', 'pace')).filter(n => n.key.startsWith('stat-value-'))).toHaveLength(2);
  // 거리를 끄면 시간이 큰 숫자가 되고 통계에는 페이스만 남는다
  const withoutDistance = nodes(only('time', 'pace'));
  const stats = withoutDistance.filter(n => n.key.startsWith('stat-value-'));
  const heroText = withoutDistance.find(n => n.key === 'hero')!.text;
  expect(stats).toHaveLength(1);
  expect(stats.some(n => n.text === heroText)).toBe(false);
});

it('통계가 없고 큰 숫자가 있으면 날짜는 큰 숫자 바로 위에 왼쪽 정렬로 붙는다', () => {
  const config = only('distance', 'date');
  const hero = byKey(config, 'hero')!;
  const date = byKey(config, 'date')!;
  expect(nodes(config).some(n => n.key.startsWith('stat-'))).toBe(false);
  expect(date.anchor).toBe('start');
  expect(date.x).toBe(hero.x);
  expect(date.y).toBeLessThan(hero.y);
  expect(hero.y - date.y).toBeLessThan(hero.size);
});

it('날짜만 있으면 오른쪽 위에 둔다', () => {
  const date = byKey(only('date'), 'date')!;
  expect(date.anchor).toBe('end');
  expect(nodes(only('date'))).toHaveLength(1);
});

it('날짜 없이 통계만 있으면 날짜 자리인 맨 위에서 시작한다', () => {
  const withDate = byKey(only('distance', 'time', 'date'), 'date')!;
  const first = byKey(only('distance', 'time'), 'stat-label-0')!;
  expect(first.y).toBeLessThan(withDate.y + 40);
  expect(first.y).toBeGreaterThan(0);
});

it('큰 숫자와 통계가 모두 없어도 날짜 외에는 그리지 않는다', () => {
  expect(nodes(only('heartRate')).map(n => n.key)).toEqual(['stat-label-0', 'stat-value-0']);
  expect(nodes(only()).length).toBe(0);
});
