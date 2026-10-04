import { act, createElement } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { RouteStyleControls, TextStyleControls } from './editor-style-controls';

jest.mock('./slider', () => {
  const { createElement: element } = jest.requireActual<typeof import('react')>('react');
  return { Slider: (props: object) => element('line-width-slider', props) };
});
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let renderer: ReactTestRenderer;
afterEach(async () => { if (renderer) await act(async () => renderer.unmount()); });

it('두께는 미리보기만 바꾸다가 손을 뗄 때 한 번 확정하며 선택한 색을 유지한다', async () => {
  const onChange = jest.fn(), onSlidingComplete = jest.fn(), onSlidingStart = jest.fn();
  await act(async () => { renderer = create(createElement(RouteStyleControls, {
    value: { color: 'mint', widthScale: 1 }, onChange, onSlidingComplete, onSlidingStart,
  })); });
  const slider = renderer.root.findByProps({ accessibilityLabel: '선 두께' });
  await act(async () => { slider.props.onSlidingStart(); slider.props.onChange(130); slider.props.onChange(160); });
  expect(onSlidingStart).toHaveBeenCalledTimes(1);
  expect(onChange).toHaveBeenLastCalledWith({ color: 'mint', widthScale: 1.6 });
  expect(onSlidingComplete).not.toHaveBeenCalled();
  await act(async () => slider.props.onSlidingComplete(160));
  expect(onSlidingComplete).toHaveBeenCalledTimes(1);
  expect(onSlidingComplete).toHaveBeenCalledWith({ color: 'mint', widthScale: 1.6 });
});

it('색 선택은 기존 두께를 지우지 않고 바로 확정한다', async () => {
  const onSlidingComplete = jest.fn();
  await act(async () => { renderer = create(createElement(RouteStyleControls, {
    value: { widthScale: 1.4 }, onChange: jest.fn(), onSlidingComplete, onSlidingStart: jest.fn(),
  })); });
  await act(async () => renderer.root.findByProps({ accessibilityLabel: '선 색 보라' }).props.onPress());
  expect(onSlidingComplete).toHaveBeenCalledWith({ color: 'violet', widthScale: 1.4 });
});

it('폰트·글자 색을 따로 바꿔도 다른 선택을 지우지 않는다', async () => {
  const onChange = jest.fn();
  await act(async () => { renderer = create(createElement(TextStyleControls, {
    value: { font: 'pretendard', textColor: 'black' }, onChange,
  })); });
  await act(async () => renderer.root.findByProps({ accessibilityLabel: '폰트 Noto Sans KR' }).props.onPress());
  expect(onChange).toHaveBeenLastCalledWith({ font: 'noto', textColor: 'black' });
  await act(async () => renderer.root.findByProps({ accessibilityLabel: '글자 색 흰색' }).props.onPress());
  expect(onChange).toHaveBeenLastCalledWith({ font: 'pretendard', textColor: 'white' });
});
