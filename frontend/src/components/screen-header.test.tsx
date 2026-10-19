import { act, createElement } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { router } from 'expo-router';
import { ScreenHeader } from './screen-header';

jest.mock('expo-router', () => ({ router: {
  canGoBack: jest.fn(), back: jest.fn(), replace: jest.fn(),
} }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let renderer: ReactTestRenderer;
const buttons = () => renderer.root.findAll(node => node.props.accessibilityLabel === '뒤로' && typeof node.props.onPress === 'function');
beforeEach(() => jest.clearAllMocks());
afterEach(async () => { await act(async () => renderer?.unmount()); });

it('이전 화면이 있으면 기본 뒤로가기로 돌아간다', async () => {
  jest.mocked(router.canGoBack).mockReturnValue(true);
  await act(async () => { renderer = create(createElement(ScreenHeader)); });
  await act(async () => { buttons()[0].props.onPress(); });
  expect(router.back).toHaveBeenCalledTimes(1);
  expect(router.replace).not.toHaveBeenCalled();
});

it('직접 진입해 이전 화면이 없으면 잘못된 뒤로가기 대신 홈으로 간다', async () => {
  jest.mocked(router.canGoBack).mockReturnValue(false);
  await act(async () => { renderer = create(createElement(ScreenHeader)); });
  await act(async () => { buttons()[0].props.onPress(); });
  expect(router.back).not.toHaveBeenCalled();
  expect(router.replace).toHaveBeenCalledWith('/');
});

it('화면별 취소 처리가 있으면 기본 이동을 실행하지 않는다', async () => {
  const onBack = jest.fn();
  await act(async () => { renderer = create(createElement(ScreenHeader, { onBack })); });
  await act(async () => { buttons()[0].props.onPress(); });
  expect(onBack).toHaveBeenCalledTimes(1);
  expect(router.canGoBack).not.toHaveBeenCalled();
  expect(router.back).not.toHaveBeenCalled();
  expect(router.replace).not.toHaveBeenCalled();
});

it('홈처럼 onBack이 null인 화면에는 뒤로가기 버튼을 만들지 않는다', async () => {
  await act(async () => { renderer = create(createElement(ScreenHeader, { onBack: null })); });
  expect(buttons()).toHaveLength(0);
});
