import { act, createElement } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { AppState, Text, type AppStateStatus } from 'react-native';
import RunScreen from '../app/internal-run';
import { Tracking } from '../../modules/run-tracking/src/RunTracking';

// Jest hoists module factories before imports.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('expo-router', () => ({ useFocusEffect: (callback: () => unknown) => require('react').useEffect(callback, [callback]), router: { push: jest.fn() } }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@/components/run-map', () => ({ RunMap: () => null }));
jest.mock('@/components/screen-header', () => ({ ScreenHeader: () => null }));
jest.mock('@/components/run-tracking-ui', () => ({ RunDisclosure: () => null, RunMetric: () => null, RunStatus: () => null, RunAction: () => null, runUI: {} }));
jest.mock('../../modules/run-tracking/src/RunTracking', () => ({ trackingEnabled: true, Tracking: { state: jest.fn(), records: jest.fn(), prepare: jest.fn(), cancelPreparation: jest.fn() } }));
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
