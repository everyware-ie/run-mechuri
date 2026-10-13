import { act, createElement } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { AppState, Text, type AppStateStatus } from 'react-native';
import RunDetail from '../app/internal-run/[id]';
import { Tracking } from '../../modules/run-tracking/src/RunTracking';
import { ThemedButton } from '@/components/ui';

// Match the cold RN screen initialization budget used by run-screen-state.
jest.setTimeout(15_000);

let mockId = 'a';
// Jest hoists module factories before imports.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({ id: mockId }), useFocusEffect: (callback: () => unknown) => require('react').useEffect(callback, [callback]), router: { back: jest.fn() } }));
jest.mock('expo-device', () => ({ modelName: 'test', osName: 'iOS', osVersion: 'test' }));
jest.mock('@/components/run-map', () => ({ RunMap: () => null }));
jest.mock('@/components/screen-header', () => ({ ScreenHeader: () => null }));
jest.mock('@/components/run-tracking-ui', () => ({ RunDisclosure: () => null, RunMetric: () => null, RunStatus: () => null, runUI: {} }));
jest.mock('../../modules/run-tracking/src/RunTracking', () => ({ trackingEnabled: true, Tracking: { detail: jest.fn(), refreshHealthHeart: jest.fn(), appVersion: '1', buildVersion: '1' } }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const detail = Tracking!.detail as jest.Mock;
let renderer: ReactTestRenderer;
let listener: (status: AppStateStatus) => void;
const text = () => renderer.root.findAllByType(Text).map(node => node.props.children).flat().join(' ');
const record = (id: string) => ({ summary: { id, started: 1, status: 'completed', duration: 30, distance: 100, segments: 1, steps: 0, maxSampleGap: 0, maxReceiptGap: 0, rejected: {}, errors: [] }, points: [] });
beforeEach(() => {
  jest.clearAllMocks(); mockId = 'a';
  detail.mockReset();
  (Tracking!.refreshHealthHeart as jest.Mock).mockReset();
  Object.defineProperty(AppState, 'currentState', { configurable: true, writable: true, value: 'active' });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => { listener = callback; return { remove: jest.fn() }; });
});
afterEach(async () => { await act(async () => renderer?.unmount()); jest.restoreAllMocks(); });
test('a different record never shows the previous record or its actions while loading', async () => {
  detail.mockResolvedValue(record('a'));
  await act(async () => { renderer = create(createElement(RunDetail)); });
  expect(text()).toContain('오늘도 달렸어요.');
  mockId = 'b'; detail.mockReturnValue(new Promise(() => {}));
  await act(async () => { renderer.update(createElement(RunDetail)); });
  expect(text()).not.toContain('오늘도 달렸어요.');
  expect(renderer.root.findAllByType(ThemedButton).some(node => node.props.title === '기록 삭제')).toBe(false);
});
test('a failed read can retry without showing another record or retaining the error', async () => {
  detail.mockRejectedValueOnce(new Error('temporary')).mockResolvedValue(record('a'));
  await act(async () => { renderer = create(createElement(RunDetail)); });
  const retry = renderer.root.findAllByType(ThemedButton).find(node => node.props.title === '기록 다시 불러오기');
  expect(retry).toBeDefined();
  await act(async () => { retry!.props.onPress(); });
  expect(text()).toContain('오늘도 달렸어요.');
  expect(text()).not.toContain('기록을 불러오지 못했어요.');
});
test('a late reply from the previous route cannot replace the selected record', async () => {
  let resolve!: (value: unknown) => void;
  detail.mockReturnValueOnce(new Promise(yes => { resolve = yes; })).mockRejectedValueOnce(new Error('temporary'));
  await act(async () => { renderer = create(createElement(RunDetail)); });
  mockId = 'b';
  await act(async () => { renderer.update(createElement(RunDetail)); });
  await act(async () => { resolve(record('a')); });
  expect(text()).not.toContain('오늘도 달렸어요.');
  expect(text()).toContain('기록을 불러오지 못했어요.');
});

test('failed HealthKit read retains completed GPS record and exposes a retry', async () => {
  detail.mockResolvedValue({ ...record('a'), summary: { ...record('a').summary, heartSource: 'health' } });
  (Tracking!.refreshHealthHeart as jest.Mock).mockRejectedValue(new Error('locked'));
  await act(async () => { renderer = create(createElement(RunDetail)); });
  expect(text()).toContain('오늘도 달렸어요.');
  expect(text()).toContain('심박을 불러오지 못했어요. 기존 기록은 보존했습니다.');
  const retry = renderer.root.findAllByType(ThemedButton).find(node => node.props.title === '심박 다시 불러오기');
  expect(retry).toBeDefined();
  (Tracking!.refreshHealthHeart as jest.Mock).mockResolvedValue(true);
  await act(async () => { await retry!.props.onPress(); });
  expect(text()).not.toContain('심박을 불러오지 못했어요.');
});
test('late HealthKit response cannot replace another selected record', async () => {
  let resolve!: (value: boolean) => void;
  detail.mockResolvedValue({ ...record('a'), summary: { ...record('a').summary, heartSource: 'health' } });
  (Tracking!.refreshHealthHeart as jest.Mock).mockReturnValue(new Promise(yes => { resolve = yes; }));
  await act(async () => { renderer = create(createElement(RunDetail)); });
  mockId = 'b'; detail.mockResolvedValue(record('b'));
  await act(async () => { renderer.update(createElement(RunDetail)); });
  await act(async () => { resolve(true); });
  expect(text()).not.toContain('건강 앱에서 불러온 심박이에요.');
  expect(text()).toContain('오늘도 달렸어요.');
});
test('return from settings reimports heart history without opening a permission request', async () => {
  detail.mockResolvedValue({ ...record('a'), summary: { ...record('a').summary, heartSource: 'health' } });
  (Tracking!.refreshHealthHeart as jest.Mock).mockResolvedValue(true);
  await act(async () => { renderer = create(createElement(RunDetail)); });
  await act(async () => { AppState.currentState = 'background'; listener('background'); });
  await act(async () => { AppState.currentState = 'active'; listener('active'); });
  expect(Tracking!.refreshHealthHeart).toHaveBeenCalledTimes(2);
});
