import { act, createElement } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { Alert, AppState, Text, type AppStateStatus } from 'react-native';
import { router } from 'expo-router';
import { markConnectedOnce } from '@/lib/connection-store';
import { InternalRunEntry } from './internal-run-entry';
import { Tracking } from '../../modules/run-tracking/src/RunTracking';

// Jest hoists this factory before imports; load React inside the factory.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('expo-router', () => ({ router: { push: jest.fn(), navigate: jest.fn(), replace: jest.fn() }, useFocusEffect: (callback: () => unknown) => require('react').useEffect(callback, [callback]) }));
jest.mock('@/lib/connection-store', () => ({ markConnectedOnce: jest.fn() }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('../../modules/run-tracking/src/RunTracking', () => ({ trackingEnabled: true, trackingDiagnosticsEnabled: false, Tracking: { state: jest.fn(), prepare: jest.fn(), start: jest.fn() } }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const state = Tracking!.state as jest.Mock;
let renderer: ReactTestRenderer;
let listener: (value: AppStateStatus) => void;
const text = () => renderer.root.findAllByType(Text).map(node => node.props.children).flat().join(' ');
const entry = () => renderer.root.findAll(node => node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function')[0];
function deferred() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise(yes => { resolve = yes; });
  return { promise, resolve };
}
beforeEach(() => {
  jest.useFakeTimers(); jest.clearAllMocks();
  (markConnectedOnce as jest.Mock).mockResolvedValue(undefined);
  Object.defineProperty(AppState, 'currentState', { configurable: true, writable: true, value: 'active' });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => { listener = callback; return { remove: jest.fn() }; });
});
afterEach(async () => { await act(async () => renderer?.unmount()); jest.restoreAllMocks(); jest.useRealTimers(); });
test('native pause and completion change the mounted home card without starting sensors', async () => {
  state.mockResolvedValue({ summary: { status: 'running' } });
  await act(async () => { renderer = create(createElement(InternalRunEntry)); });
  expect(text()).toContain('측정 중');
  expect(text()).not.toContain('팀 테스트');
  state.mockResolvedValue({ summary: { status: 'paused' } });
  await act(async () => { jest.advanceTimersByTime(5000); });
  expect(text()).toContain('일시정지');
  state.mockResolvedValue({ summary: null });
  await act(async () => { jest.advanceTimersByTime(5000); });
  expect(text()).toContain('러닝 시작');
  expect(Tracking!.prepare).not.toHaveBeenCalled(); expect(Tracking!.start).not.toHaveBeenCalled();
});
test('background polls stop and a stale reply cannot replace the foreground status', async () => {
  const old = deferred();
  state.mockReturnValueOnce(old.promise).mockResolvedValue({ summary: { status: 'interrupted' } });
  await act(async () => { renderer = create(createElement(InternalRunEntry)); });
  await act(async () => { AppState.currentState = 'background'; listener('background'); jest.advanceTimersByTime(10000); });
  expect(state).toHaveBeenCalledTimes(1);
  await act(async () => { AppState.currentState = 'active'; listener('active'); });
  expect(text()).toContain('중단됨');
  await act(async () => { old.resolve({ summary: { status: 'running' } }); });
  expect(text()).toContain('중단됨');
});
test('a transient state read failure retries on the next foreground poll', async () => {
  state.mockRejectedValueOnce(new Error('temporary')).mockResolvedValue({ summary: { status: 'paused' } });
  await act(async () => { renderer = create(createElement(InternalRunEntry)); });
  await act(async () => { jest.advanceTimersByTime(5000); });
  expect(text()).toContain('일시정지');
});

test('welcome entry completes the introduction and replaces it once without starting sensors', async () => {
  state.mockResolvedValue({ summary: null });
  await act(async () => { renderer = create(createElement(InternalRunEntry, { fromWelcome: true })); });
  await act(async () => { const button = entry(); button.props.onPress(); button.props.onPress(); });
  expect(markConnectedOnce).toHaveBeenCalledTimes(1);
  expect(router.replace).toHaveBeenCalledWith('/internal-run');
  expect(router.replace).toHaveBeenCalledTimes(1);
  expect(Tracking!.prepare).not.toHaveBeenCalled(); expect(Tracking!.start).not.toHaveBeenCalled();
});

test('failed welcome persistence keeps navigation unchanged and permits retry', async () => {
  state.mockResolvedValue({ summary: null });
  (markConnectedOnce as jest.Mock).mockRejectedValueOnce(new Error('storage'));
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await act(async () => { renderer = create(createElement(InternalRunEntry, { fromWelcome: true })); });
  await act(async () => { entry().props.onPress(); });
  expect(router.replace).not.toHaveBeenCalled(); expect(alert).toHaveBeenCalledTimes(1);
  await act(async () => { entry().props.onPress(); });
  expect(router.replace).toHaveBeenCalledTimes(1);
});
