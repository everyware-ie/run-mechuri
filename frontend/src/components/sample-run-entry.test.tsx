import { act, createElement } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';
import { router } from 'expo-router';
import { SampleRunEntry } from './sample-run-entry';
import { markConnectedOnce } from '@/lib/connection-store';
import { SAMPLE_HEART_ID } from '@/lib/sample-run';

const mockSelect = jest.fn();
jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void | (() => void)) => {
    const React = jest.requireActual<typeof import('react')>('react');
    React.useEffect(callback, [callback]);
  },
  router: { push: jest.fn(), replace: jest.fn() },
}));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@/state/creation-flow', () => ({ useCreationFlow: () => ({ setSelectedRun: mockSelect }) }));
jest.mock('@/lib/connection-store', () => ({ markConnectedOnce: jest.fn() }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let renderer: ReactTestRenderer;
const button = () => renderer.root.findAll(node => node.props.testID === 'sample-run-entry' && typeof node.props.onPress === 'function')[0];
beforeEach(() => { jest.clearAllMocks(); mockSelect.mockResolvedValue(undefined); });
afterEach(async () => { await act(async () => renderer?.unmount()); });

it('첫 체험은 하트 트랙을 준비하고 홈을 남긴 채 배경 선택으로 간다', async () => {
  await act(async () => { renderer = create(createElement(SampleRunEntry, { fromWelcome: true })); });
  await act(async () => { button().props.onPress(); });
  expect(mockSelect).toHaveBeenCalledWith(expect.objectContaining({ id: SAMPLE_HEART_ID }), expect.objectContaining({ coordinates: expect.any(Array) }), expect.any(Function));
  expect(markConnectedOnce).toHaveBeenCalledTimes(1);
  expect(router.replace).toHaveBeenCalledWith('/');
  expect(router.push).toHaveBeenCalledWith('/background-selection');
  expect(jest.mocked(router.replace).mock.invocationCallOrder[0]).toBeLessThan(jest.mocked(router.push).mock.invocationCallOrder[0]);
});

it('빠르게 연속 누르면 하나만 시작하고 실패 뒤에는 다시 시도할 수 있다', async () => {
  let reject!: (error: Error) => void;
  mockSelect.mockReturnValueOnce(new Promise((_resolve, no) => { reject = no; }));
  await act(async () => { renderer = create(createElement(SampleRunEntry)); });
  await act(async () => {
    const press = button().props.onPress;
    press(); press();
  });
  expect(mockSelect).toHaveBeenCalledTimes(1);
  expect(router.push).not.toHaveBeenCalled();
  await act(async () => { reject(new Error('storage unavailable')); });
  expect(renderer.root.findAllByType(Text).some(n => String(n.props.children).includes('샘플을 준비하지 못했어요'))).toBe(true);
  await act(async () => { button().props.onPress(); });
  expect(mockSelect).toHaveBeenCalledTimes(2);
  expect(router.push).toHaveBeenCalledTimes(1);
  expect(markConnectedOnce).not.toHaveBeenCalled();
});

it('다른 기록의 좌표 조회 중에는 샘플 시작으로 생성 상태를 덮어쓰지 않는다', async () => {
  await act(async () => { renderer = create(createElement(SampleRunEntry, { disabled: true })); });
  expect(button().props.disabled).toBe(true);
  await act(async () => { button().props.onPress(); });
  expect(mockSelect).not.toHaveBeenCalled();
  expect(router.push).not.toHaveBeenCalled();
});

it('샘플 준비 중 화면을 닫으면 늦은 완료가 다음 화면을 열지 않는다', async () => {
  let finish!: () => void;
  mockSelect.mockReturnValueOnce(new Promise<void>(resolve => { finish = resolve; }));
  await act(async () => { renderer = create(createElement(SampleRunEntry)); });
  await act(async () => { button().props.onPress(); });
  const isCurrent = mockSelect.mock.calls[0][2];
  expect(isCurrent()).toBe(true);
  await act(async () => renderer.unmount());
  expect(isCurrent()).toBe(false);
  await act(async () => { finish(); });
  expect(router.push).not.toHaveBeenCalled();
});
