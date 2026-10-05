import { act, createElement } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { RouteColorPicker } from './route-color-picker';
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
jest.mock('expo-modules-core', () => {
  const { createElement: element } = jest.requireActual<typeof import('react')>('react');
  return { ...jest.requireActual('expo-modules-core'), requireNativeViewManager: () => (props: object) => element('native-route-color-picker', props) };
});
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let renderer: ReactTestRenderer;
afterEach(async () => { if (renderer) await act(async () => renderer.unmount()); });

it.each([true, false])('완료만 저장하며 늦은 이벤트·화면 닫힘에 중복 저장하지 않는다: %s', async save => {
  const onPreview = jest.fn(), onFinish = jest.fn();
  await act(async () => { renderer = create(createElement(RouteColorPicker, { color: '#8EF0CE', onPreview, onFinish })); });
  const picker = renderer.root.findByType('native-route-color-picker' as never);
  await act(async () => picker.props.onColorChange({ nativeEvent: { color: '#13ac72' } }));
  expect(onPreview).toHaveBeenLastCalledWith('#13AC72');
  await act(async () => renderer.root.findByProps({ accessibilityLabel: save ? '색상 선택 완료' : '색상 선택 취소', accessibilityRole: 'button' }).props.onPress());
  await act(async () => picker.props.onColorChange({ nativeEvent: { color: '#FF0000' } }));
  await act(async () => renderer.unmount());
  expect(onFinish).toHaveBeenCalledTimes(1);
  expect(onFinish).toHaveBeenCalledWith(save ? '#13AC72' : null);
  expect(onPreview).toHaveBeenCalledTimes(1);
});

it('화면을 떠나면 미확정 색을 취소한다', async () => {
  const onFinish = jest.fn();
  await act(async () => { renderer = create(createElement(RouteColorPicker, { color: '#8EF0CE', onPreview: jest.fn(), onFinish })); });
  await act(async () => renderer.unmount());
  expect(onFinish).toHaveBeenCalledTimes(1);
  expect(onFinish).toHaveBeenCalledWith(null);
});
