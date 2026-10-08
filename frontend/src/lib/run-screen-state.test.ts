import { act, createElement } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { AppState, Text, type AppStateStatus } from 'react-native';
import RunScreen from '../app/internal-run';
import { RunAction } from '@/components/run-tracking-ui';
import { Tracking } from '../../modules/run-tracking/src/RunTracking';

// Jest hoists module factories before imports.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('expo-router', () => ({ useFocusEffect: (callback: () => unknown) => require('react').useEffect(callback, [callback]), router: { push: jest.fn() } }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@/components/run-map', () => ({ RunMap: () => null }));
jest.mock('@/components/screen-header', () => ({ ScreenHeader: () => null }));
jest.mock('@/components/run-tracking-ui', () => ({ RunDisclosure: () => null, RunMetric: () => null, RunStatus: () => null, RunAction: () => null, runUI: {} }));
jest.mock('../../modules/run-tracking/src/RunTracking', () => ({ trackingEnabled: true, Tracking: { state: jest.fn(), records: jest.fn(), startWithHeartSource: jest.fn(), prepare: jest.fn(), cancelPreparation: jest.fn() } }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const state = Tracking!.state as jest.Mock;
const snapshot = { summary: null, phase: 'idle', locationPermission: 0, preciseLocation: false };
let renderer: ReactTestRenderer;
let listener: (status: AppStateStatus) => void;
const text = () => renderer.root.findAllByType(Text).map(node => node.props.children).flat().join(' ');
beforeEach(() => {
  jest.clearAllMocks(); jest.useFakeTimers();
  Object.defineProperty(AppState, 'currentState', { configurable: true, writable: true, value: 'active' });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => { listener = callback; return { remove: jest.fn() }; });
  (Tracking!.records as jest.Mock).mockResolvedValue({ records: [], damaged: [] });
  (Tracking!.cancelPreparation as jest.Mock).mockResolvedValue(undefined);
});
afterEach(async () => { await act(async () => renderer?.unmount()); jest.restoreAllMocks(); jest.useRealTimers(); });
test('a recovered poll removes the read error without requiring a new action', async () => {
  state.mockRejectedValueOnce(new Error('temporary')).mockResolvedValue(snapshot);
  await act(async () => { renderer = create(createElement(RunScreen)); });
  expect(text()).toContain('러닝 상태를 확인하지 못했어요.');
  await act(async () => { jest.advanceTimersByTime(1000); });
  expect(text()).not.toContain('러닝 상태를 확인하지 못했어요.');
});
test('a read started before backgrounding cannot start GPS or publish its delayed reply', async () => {
  let resolve!: (value: unknown) => void;
  state.mockReturnValueOnce(new Promise(yes => { resolve = yes; })).mockResolvedValue(snapshot);
  await act(async () => { renderer = create(createElement(RunScreen)); });
  await act(async () => { AppState.currentState = 'background'; listener('background'); });
  await act(async () => { resolve({ ...snapshot, locationPermission: 4, preciseLocation: true }); });
  expect(Tracking!.prepare).not.toHaveBeenCalled();
  await act(async () => { jest.advanceTimersByTime(5000); });
  expect(state).toHaveBeenCalledTimes(1);
  await act(async () => { AppState.currentState = 'active'; listener('active'); });
  expect(state).toHaveBeenCalledTimes(2);
  expect(text()).not.toContain('러닝 상태를 확인하지 못했어요.');
});

test('new runs only read HealthKit and expose no heart source options', async () => {
  const ready = { ...snapshot, phase: 'ready' };
  state.mockResolvedValue(ready);
  (Tracking!.startWithHeartSource as jest.Mock).mockResolvedValue(ready);
  await act(async () => { renderer = create(createElement(RunScreen)); });
  expect(renderer.root.findAll(node => node.props.accessibilityRole === 'radio')).toHaveLength(0);
  expect(text()).not.toContain('Runary 워치 직접 측정');
  expect(text()).toContain('워치에서 Runary를 열면');
  const start = renderer.root.findAllByType(RunAction).find(node => node.props.title === '러닝 시작')!;
  await act(async () => { start.props.onPress(); });
  expect(Tracking!.startWithHeartSource).toHaveBeenCalledWith('health');
});

test('HealthKit runs show Watch installation needs without requiring manual reconnect or direct collection', async () => {
  state.mockResolvedValue({ ...snapshot, summary: { id: 'test', status: 'running', heartSource: 'health', watchEnabled: false, duration: 0, distance: 0 }, watchState: 'notInstalled' });
  await act(async () => { renderer = create(createElement(RunScreen)); });
  expect(text()).toContain('워치 앱 설치·업데이트 필요');
  expect(text()).not.toContain('워치 다시 연결');
  expect(text()).not.toContain('워치에서 측정 시작을 확인');
});

test('a pending Watch start does not restart native GPS preparation from the screen poll', async () => {
  state.mockResolvedValue({ ...snapshot, phase: 'preparing', watchStartPending: true, locationPermission: 4, preciseLocation: true });
  await act(async () => { renderer = create(createElement(RunScreen)); });
  expect(Tracking!.prepare).not.toHaveBeenCalled();
  expect(text()).toContain('워치에서 요청한 러닝을 GPS 준비 후 자동으로 시작해요.');
});

test('an imported but delayed heart displays its average and measured time while waiting for fresh data', async () => {
  state.mockResolvedValue({ ...snapshot, summary: { id: 'test', status: 'running', heartSource: 'health', duration: 0, distance: 0,
    heartRate: null, averageHeartRate: 66, lastHeart: new Date(2026, 9, 7, 22, 58).getTime() / 1000 }, healthHeartState: 'reading' });
  await act(async () => { renderer = create(createElement(RunScreen)); });
  expect(text()).toContain('건강 앱에서 불러온 평균 심박 66 bpm · 마지막 측정 22:58');
  expect(text()).toContain('최신 심박을 기다리고 있어요.');
  expect(text()).not.toContain('건강 앱에 새 심박이 저장되기를 기다려요.');
});
