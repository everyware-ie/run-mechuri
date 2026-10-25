import { act } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { AppState, Text } from 'react-native';
import InternalRunScreen from '../app/internal-run';
import { RunAction } from '@/components/run-tracking-ui';
import { Tracking, type TrackingState } from '../../modules/run-tracking/src/RunTracking';

jest.mock('expo-router', () => ({ router: { push: jest.fn() }, Redirect: () => null,
  useFocusEffect: (callback: () => void | (() => void)) => {
    const React = jest.requireActual<typeof import('react')>('react');
    React.useEffect(callback, [callback]);
  },
}));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@/components/run-map', () => ({ RunMap: () => null }));
jest.mock('@/components/screen-header', () => ({ ScreenHeader: () => null }));
jest.mock('../../modules/run-tracking/src/RunTracking', () => ({ trackingEnabled: true, Tracking: {
  state: jest.fn(), records: jest.fn(), prepare: jest.fn(), resume: jest.fn(), pause: jest.fn(),
  resumeImmediately: jest.fn(), cancelPreparation: jest.fn(), watchAutoSync: true, watchDisplayOnly: true,
} }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let renderer: ReactTestRenderer;
const paused = { phase: 'paused', summary: { id: 'same-run', status: 'paused', duration: 120, distance: 300, steps: 250 },
  watchState: 'off', locationPermission: 4, preciseLocation: true } as TrackingState;
const button = (title: string) => renderer.root.findAllByType(RunAction).find(node => node.props.title === title)!;
beforeEach(() => {
  jest.useFakeTimers(); jest.clearAllMocks(); AppState.currentState = 'active';
  Tracking!.resumeImmediately = jest.fn().mockResolvedValue(undefined);
  jest.mocked(Tracking!.state).mockResolvedValue(paused);
  jest.mocked(Tracking!.records).mockResolvedValue({ records: [], damaged: [] });
  jest.mocked(Tracking!.cancelPreparation).mockResolvedValue(undefined);
});
afterEach(async () => { await act(async () => renderer?.unmount()); jest.useRealTimers(); });

it.each(['paused', 'interrupted'] as const)('%s 기록은 자동 재개 없이 버튼 한 번으로 GPS 대기를 건너뛴다', async status => {
  jest.mocked(Tracking!.state).mockResolvedValue({ ...paused, summary: { ...paused.summary!, status } });
  await act(async () => { renderer = create(<InternalRunScreen />); });
  expect(Tracking!.resumeImmediately).not.toHaveBeenCalled();
  expect(Tracking!.prepare).not.toHaveBeenCalled();
  expect(renderer.root.findAllByType(Text).map(node => node.props.children).flat().join(' ')).not.toContain('GPS를 준비해 주세요');
  await act(async () => { button('이어서 달리기').props.onPress(); });
  expect(Tracking!.resumeImmediately).toHaveBeenCalledTimes(1);
  expect(Tracking!.resume).not.toHaveBeenCalled();
  expect(Tracking!.prepare).not.toHaveBeenCalled();
});

it('즉시 재개가 없는 이전 네이티브 앱은 기존 준비 흐름을 유지한다', async () => {
  Tracking!.resumeImmediately = undefined;
  await act(async () => { renderer = create(<InternalRunScreen />); });
  await act(async () => { button('GPS 준비').props.onPress(); });
  expect(Tracking!.prepare).toHaveBeenCalledTimes(1);
  expect(Tracking!.resume).not.toHaveBeenCalled();
});

it('권한 오류를 표시하고 재개 요청을 자동으로 반복하지 않는다', async () => {
  jest.mocked(Tracking!.resumeImmediately!).mockRejectedValueOnce(new Error('위치와 정확한 위치를 확인해 주세요.'));
  await act(async () => { renderer = create(<InternalRunScreen />); });
  await act(async () => { button('이어서 달리기').props.onPress(); });
  await act(async () => { jest.advanceTimersByTime(3000); });
  expect(Tracking!.resumeImmediately).toHaveBeenCalledTimes(1);
  expect(renderer.root.findAllByType(Text).map(node => node.props.children).flat().join(' ')).toContain('위치와 정확한 위치를 확인해 주세요.');
});
