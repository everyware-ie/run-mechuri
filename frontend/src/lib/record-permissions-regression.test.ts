import { act, createElement } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { AppState, Text, type AppStateStatus } from 'react-native';
import RecordScreen from '../app/record-selection';
import HealthKit from '../../modules/health-kit-bridge/src/HealthKitBridgeModule';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('expo-router', () => ({ useFocusEffect: (callback: () => unknown) => require('react').useEffect(callback, [callback]), router: { push: jest.fn() } }));
jest.mock('@/components/screen-header', () => ({ ScreenHeader: () => null }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@/components/internal-run-entry', () => ({ AppPermissionsLink: () => null }));
jest.mock('@/state/creation-flow', () => ({ useCreationFlow: () => ({ setSelectedRun: jest.fn() }) }));
jest.mock('../../modules/health-kit-bridge/src/HealthKitBridgeModule', () => ({ __esModule: true, default: { requestAuthorization: jest.fn(), getOutdoorRuns: jest.fn() } }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let renderer: ReactTestRenderer;
let listener: (status: AppStateStatus) => void;
const authorize = HealthKit.requestAuthorization as jest.Mock;
const runs = HealthKit.getOutdoorRuns as jest.Mock;
const text = () => renderer.root.findAllByType(Text).map(node => node.props.children).flat().join(' ');
beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(AppState, 'currentState', { configurable: true, writable: true, value: 'active' });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => { listener = callback; return { remove: jest.fn() }; });
  authorize.mockResolvedValue(true); runs.mockResolvedValue([]);
});
afterEach(async () => { await act(async () => renderer?.unmount()); jest.restoreAllMocks(); });
async function change(status: AppStateStatus) { await act(async () => { AppState.currentState = status; listener(status); }); }
test('settings return reloads data without requesting authorization again', async () => {
  await act(async () => { renderer = create(createElement(RecordScreen)); });
  expect(authorize).toHaveBeenCalledTimes(1);
  await change('background'); await change('active');
  expect(authorize).toHaveBeenCalledTimes(1); expect(runs).toHaveBeenCalledTimes(2);
  expect(text()).toContain('실외 러닝 기록이 없어요');
});
test('a permission sheet lifecycle coalesces refresh and does not loop requests', async () => {
  let resolve!: (value: boolean) => void;
  authorize.mockReturnValueOnce(new Promise(yes => { resolve = yes; }));
  await act(async () => { renderer = create(createElement(RecordScreen)); });
  await change('inactive'); await change('active');
  await act(async () => { resolve(true); });
  expect(authorize).toHaveBeenCalledTimes(1); expect(runs).toHaveBeenCalledTimes(1);
  expect(text()).toContain('실외 러닝 기록이 없어요');
});
test('empty read after settings return is not labelled as denied', async () => {
  await act(async () => { renderer = create(createElement(RecordScreen)); });
  await change('background'); await change('active');
  expect(text()).toContain('건강 데이터 접근이 허용되지 않았을 수 있어요');
  expect(text()).not.toContain('건강 데이터 접근이 필요해요');
  expect(text()).toContain('설정에서 권한 확인');
});
