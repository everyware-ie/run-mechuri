import { act, createElement } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { AppState, Text, type AppStateStatus } from 'react-native';
import { router } from 'expo-router';
import RecordScreen from '../app/record-selection';
import HealthKit from '../../modules/health-kit-bridge/src/HealthKitBridgeModule';
import { Tracking } from '../../modules/run-tracking/src/RunTracking';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('expo-router', () => ({ useFocusEffect: (callback: () => unknown) => require('react').useEffect(callback, [callback]), router: { push: jest.fn() } }));
jest.mock('@/components/screen-header', () => ({ ScreenHeader: () => null }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@/components/internal-run-entry', () => ({ AppPermissionsLink: () => null }));
const mockSelect = jest.fn();
jest.mock('@/state/creation-flow', () => ({ useCreationFlow: () => ({ setSelectedRun: mockSelect }) }));
jest.mock('../../modules/health-kit-bridge/src/HealthKitBridgeModule', () => ({ __esModule: true, default: { requestAuthorization: jest.fn(), getOutdoorRuns: jest.fn(), getRoute: jest.fn() } }));
jest.mock('../../modules/run-tracking/src/RunTracking', () => ({ trackingEnabled: true, Tracking: { editorRoutes: true, records: jest.fn(), detail: jest.fn() } }));
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
  (Tracking!.records as jest.Mock).mockResolvedValue({ records: [], damaged: [] });
  authorize.mockResolvedValue(true); runs.mockResolvedValue([]);
  mockSelect.mockResolvedValue(undefined);
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

const realRun = { id: 'real-run', date: '2026-10-02T00:00:00Z', distanceMeters: 1000,
  durationSeconds: 360, averagePaceSecPerKm: 360, hasRoute: true };
function selectionButtons() {
  const buttons = renderer.root.findAll(node => typeof node.props.onPress === 'function');
  const sample = buttons.find(node => node.props.testID === 'sample-run-entry')!;
  const real = buttons.find(node => node.findAllByType(Text).some(text => String(text.props.children).includes('10월 2일')))!;
  return { sample: sample.props.onPress, real: real.props.onPress };
}
test('sample preparation blocks a real-record tap before the screen rerenders', async () => {
  runs.mockResolvedValue([realRun]);
  let done!: () => void;
  mockSelect.mockReturnValueOnce(new Promise<void>(resolve => { done = resolve; }));
  await act(async () => { renderer = create(createElement(RecordScreen)); });
  const buttons = selectionButtons();
  await act(async () => { buttons.sample(); buttons.real(); });
  expect(HealthKit.getRoute).not.toHaveBeenCalled();
  await act(async () => { done(); });
  expect(mockSelect).toHaveBeenCalledTimes(1);
  expect(mockSelect.mock.calls[0][0].id).toBe('sample:heart:v1');
  expect(router.push).toHaveBeenCalledTimes(1);
});
test('real route loading blocks sample and duplicate record taps before rerender', async () => {
  runs.mockResolvedValue([realRun]);
  let done!: (track: { coordinates: [] }) => void;
  jest.mocked(HealthKit.getRoute).mockReturnValueOnce(new Promise(resolve => { done = resolve; }));
  await act(async () => { renderer = create(createElement(RecordScreen)); });
  const buttons = selectionButtons();
  await act(async () => { buttons.real(); buttons.real(); buttons.sample(); });
  expect(HealthKit.getRoute).toHaveBeenCalledTimes(1);
  expect(mockSelect).not.toHaveBeenCalled();
  await act(async () => { done({ coordinates: [] }); });
  expect(mockSelect).toHaveBeenCalledTimes(1);
  expect(mockSelect.mock.calls[0][0].id).toBe('real-run');
  expect(router.push).toHaveBeenCalledTimes(1);
});

const ownRun = { id: 'own-run', started: Date.parse('2026-10-18T00:00:00Z') / 1000, status: 'completed',
  duration: 1800, distance: 5100, averagePace: 352.94, hasDrawableRoute: true, acceptedCount: 2 };
const ownDetail = { summary: ownRun, points: [
  { latitude: 0, longitude: 0, time: ownRun.started, segment: 0 },
  { latitude: 0, longitude: 0.001, time: ownRun.started + 20, segment: 0 },
] };
function ownButton() {
  return renderer.root.findAll(node => node.props.accessibilityRole === 'button' && typeof node.props.onPress === 'function')
    .find(node => node.findAllByType(Text).some(text => String(text.props.children).includes('10월 18일')))!;
}
test('local records remain selectable while health authorization is pending', async () => {
  authorize.mockReturnValueOnce(new Promise(() => {}));
  (Tracking!.records as jest.Mock).mockResolvedValue({ records: [ownRun], damaged: [] });
  (Tracking!.detail as jest.Mock).mockResolvedValue(ownDetail);
  await act(async () => { renderer = create(createElement(RecordScreen)); });
  expect(ownButton().props.disabled).toBe(false);
  await act(async () => { await ownButton().props.onPress(); });
  expect(mockSelect.mock.calls[0][0].id).toBe('runary:own-run');
  expect(HealthKit.getRoute).not.toHaveBeenCalled();
});
test('failed health lookup cannot hide a valid local record', async () => {
  runs.mockRejectedValueOnce(new Error('health unavailable'));
  (Tracking!.records as jest.Mock).mockResolvedValue({ records: [ownRun], damaged: [] });
  await act(async () => { renderer = create(createElement(RecordScreen)); });
  expect(ownButton().props.disabled).toBe(false);
  expect(text()).toContain('건강 앱 기록을 불러오지 못했어요');
});
test('local read failure leaves health records usable', async () => {
  (Tracking!.records as jest.Mock).mockRejectedValueOnce(new Error('storage unavailable'));
  runs.mockResolvedValue([realRun]);
  await act(async () => { renderer = create(createElement(RecordScreen)); });
  expect(selectionButtons().real).toBeDefined();
  expect(text()).toContain('Runary 기록을 불러오지 못했어요');
});
test('unfinished and non-drawable local records do not enter the selection list', async () => {
  (Tracking!.records as jest.Mock).mockResolvedValue({ records: [{ ...ownRun, status: 'paused' }, { ...ownRun, id: 'no-route', hasDrawableRoute: false }], damaged: ['damaged'] });
  await act(async () => { renderer = create(createElement(RecordScreen)); });
  expect(ownButton()).toBeUndefined();
  expect(text()).toMatch(/좌표가 없는 기록\s+1\s*건/);
  expect(text()).toMatch(/Runary 기록\s+1\s*건을 읽지 못했어요/);
});
test('local selection locks other records and supports retry after a deleted source', async () => {
  runs.mockResolvedValue([realRun]);
  (Tracking!.records as jest.Mock).mockResolvedValue({ records: [ownRun], damaged: [] });
  (Tracking!.detail as jest.Mock).mockRejectedValueOnce(new Error('source deleted'));
  await act(async () => { renderer = create(createElement(RecordScreen)); });
  await act(async () => { await ownButton().props.onPress(); });
  expect(mockSelect).not.toHaveBeenCalled();
  expect(ownButton().props.disabled).toBe(false);
  let finish!: (detail: typeof ownDetail) => void;
  (Tracking!.detail as jest.Mock).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  const ownPress = ownButton().props.onPress, buttons = selectionButtons();
  await act(async () => { ownPress(); ownPress(); buttons.real(); buttons.sample(); });
  expect(Tracking!.detail).toHaveBeenCalledTimes(2);
  expect(HealthKit.getRoute).not.toHaveBeenCalled();
  await act(async () => { finish(ownDetail); });
  expect(mockSelect).toHaveBeenCalledTimes(1);
  expect(router.push).toHaveBeenCalledTimes(1);
});
