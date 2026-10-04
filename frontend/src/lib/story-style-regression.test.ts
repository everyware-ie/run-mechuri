import { IDENTITY_STAMP, STAMP_LAYOUTS, stampLayoutDescriptors } from '@/components/route-preview';
import type { RunRecord } from '../../modules/health-kit-bridge/src/HealthKitBridge.types';

jest.mock('@shopify/react-native-skia', () => ({}));
jest.mock('react-native-reanimated', () => ({ __esModule: true, default: {} }));
jest.mock('react-native-worklets', () => ({}));
jest.mock('expo-router', () => ({}));

const run: RunRecord = { id: 'style-qa', date: '2026-10-04T00:00:00Z', distanceMeters: 6010,
  durationSeconds: 2516, averagePaceSecPerKm: 418, averageHeartRate: 156, hasRoute: true };
const config = { ...IDENTITY_STAMP, placeName: '신대방동', captions: [
  { id: 'a', text: '오늘도 잘 달렸다\n기분 좋은 하루', scale: 1, offset: { x: 0, y: 0 } },
] };

it.each(STAMP_LAYOUTS)('$label 프리셋을 바꿔도 러닝 데이터와 모든 문구에 선택한 스타일을 적용한다', ({ id }) => {
  const layout = stampLayoutDescriptors(run, { ...config, layout: id, font: 'pretendard', textColor: 'black' }, .5);
  expect(layout.texts.length).toBeGreaterThan(2);
  expect(layout.texts.filter(n => n.key.startsWith('caption-'))).toHaveLength(2);
  expect(layout.texts.every(n => n.family.startsWith('Pretendard_') && n.color === '#111111' && n.contrastColor === '#FFFFFF')).toBe(true);
  if (id === 'glass') expect(layout.rects.find(r => r.key === 'glass-bg')?.fill).toBe('rgba(255,255,255,0.72)');
});

it('글자 색만 바꾸거나 기본 폰트를 다시 고르면 기존 프리셋의 서체·배치는 유지한다', () => {
  const before = stampLayoutDescriptors(run, { ...config, layout: 'corner' }, 1);
  const after = stampLayoutDescriptors(run, { ...config, layout: 'corner', font: 'preset', textColor: 'white' }, 1);
  expect(after.texts.map(n => ({ ...n, color: '#FFF3EC' }))).toEqual(before.texts);
  expect(before.texts.find(n => n.key.startsWith('caption-'))?.family).toBe('NotoSansKR_700Bold');
});

it('러닝 데이터를 숨겨도 문구의 폰트·색은 남는다', () => {
  const layout = stampLayoutDescriptors(run, { ...config, hidden: true, font: 'noto', textColor: 'black' }, 0);
  expect(layout.texts).toHaveLength(2);
  expect(layout.texts.every(n => n.family === 'NotoSansKR_700Bold' && n.color === '#111111')).toBe(true);
});
