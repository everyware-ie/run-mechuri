import { act, createElement } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { AppState, type AppStateStatus } from 'react-native';
import { HomeTabs } from './home-tabs';
import { Tracking } from '../../modules/run-tracking/src/RunTracking';
import type { HomeRunStatus } from '@/state/home-tabs';

let mockPathname = '/';
let mockEnabled = true;
let mockReport: (status: HomeRunStatus) => void;
jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  const Tabs = ({ children, ...props }: { children: unknown }) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mockReport = React.useContext(require('@/state/home-tabs').HomeTabsContext).reportRunStatus;
    return React.createElement('TabsNavigator', props, children);
  };
  Tabs.Screen = function MockTabScreen() { return null; };
  return { Tabs, usePathname: () => mockPathname, useFocusEffect: (callback: () => unknown) => React.useEffect(callback, [callback]) };
});
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('../../modules/run-tracking/src/RunTracking', () => ({ get trackingEnabled() { return mockEnabled; }, Tracking: { state: jest.fn(), prepare: jest.fn(), start: jest.fn() } }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const state = Tracking!.state as jest.Mock;
let renderer: ReactTestRenderer;
let listener: (value: AppStateStatus) => void;
const options = () => renderer.root.find(node => node.props.name === 'internal-run').props.options;
const navigator = () => renderer.root.findAll(node => node.props.backBehavior === 'initialRoute')[0].props;
const hidden = () => navigator().screenOptions.tabBarStyle.at(-1).display === 'none';
beforeEach(() => {
  jest.useFakeTimers(); jest.clearAllMocks(); mockEnabled = true; mockPathname = '/';
  Object.defineProperty(AppState, 'currentState', { configurable: true, writable: true, value: 'active' });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => { listener = callback; return { remove: jest.fn() }; });
});
afterEach(async () => { await act(async () => renderer?.unmount()); jest.restoreAllMocks(); jest.useRealTimers(); });

test('library reads native status without starting GPS and keeps both tab destinations', async () => {
  state.mockResolvedValue({ summary: { status: 'running' } });
  await act(async () => { renderer = create(createElement(HomeTabs)); });
  expect(hidden()).toBe(false);
  expect(options().href).toBe('/internal-run');
  expect(options().tabBarLabel).toBe('측정 중');
  state.mockResolvedValue({ summary: { status: 'paused' } });
  await act(async () => { jest.advanceTimersByTime(5000); });
  expect(options().tabBarLabel).toBe('일시정지');
  expect(Tracking!.prepare).not.toHaveBeenCalled(); expect(Tracking!.start).not.toHaveBeenCalled();
});

test('an old library reply cannot overwrite the run screen after a tab switch', async () => {
  let resolve!: (value: unknown) => void;
  state.mockReturnValueOnce(new Promise(yes => { resolve = yes; }));
  await act(async () => { renderer = create(createElement(HomeTabs)); });
  mockPathname = '/internal-run';
  await act(async () => { renderer.update(createElement(HomeTabs)); });
  await act(async () => { mockReport('running'); });
  expect(hidden()).toBe(true);
  await act(async () => { resolve({ summary: { status: 'paused' } }); });
  expect(options().tabBarLabel).toBe('측정 중');
  expect(state).toHaveBeenCalledTimes(1);
});

test('fresh idle state exposes preparation tabs and leaving a running screen preserves its state', async () => {
  mockPathname = '/internal-run';
  await act(async () => { renderer = create(createElement(HomeTabs)); });
  expect(hidden()).toBe(true);
  await act(async () => { mockReport(null); });
  expect(hidden()).toBe(false);
  await act(async () => { mockReport('running'); });
  expect(hidden()).toBe(true);
  state.mockResolvedValue({ summary: { status: 'paused' } });
  mockPathname = '/';
  await act(async () => { renderer.update(createElement(HomeTabs)); });
  expect(hidden()).toBe(false);
  await act(async () => { mockReport('running'); });
  expect(options().tabBarLabel).toBe('일시정지');
});

test('background reads cannot publish an obsolete status and foregrounding refreshes it', async () => {
  let resolve!: (value: unknown) => void;
  state.mockReturnValueOnce(new Promise(yes => { resolve = yes; })).mockResolvedValue({ summary: null });
  await act(async () => { renderer = create(createElement(HomeTabs)); });
  await act(async () => { AppState.currentState = 'background'; listener('background'); jest.advanceTimersByTime(10000); });
  expect(state).toHaveBeenCalledTimes(1);
  await act(async () => { AppState.currentState = 'active'; listener('active'); });
  await act(async () => { resolve({ summary: { status: 'running' } }); });
  expect(options().tabBarLabel).toBe('러닝');
});

test('builds without tracking hide tabs and never read native state', async () => {
  mockEnabled = false;
  await act(async () => { renderer = create(createElement(HomeTabs)); });
  expect(hidden()).toBe(true); expect(options().href).toBeNull();
  expect(state).not.toHaveBeenCalled(); expect(Tracking!.prepare).not.toHaveBeenCalled();
});
