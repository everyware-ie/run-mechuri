import { act, createElement } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { HandStrokeBrushes, HandStrokeControls } from './hand-stroke-controls';

jest.mock('./slider', () => {
  const { createElement: element } = jest.requireActual<typeof import('react')>('react');
  return { Slider: (props: object) => element('ink-width-slider', props) };
});
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let renderer: ReactTestRenderer;
afterEach(async () => { if (renderer) await act(async () => renderer.unmount()); });
it('붓과 색은 해당 속성만 바꾸고 굵기는 놓을 때 확정한다', async () => {
  const onChange = jest.fn(), onWidthChange = jest.fn(), onWidthCommit = jest.fn();
  await act(async () => { renderer = create(createElement(HandStrokeControls, {
    stroke: { id: 'one', brush: 'pen', color: '#FFFFFF', width: 12, scale: 2, offset: { x: 80, y: 40 }, points: [{ x: 50, y: 50 }] },
    onChange, onWidthStart: jest.fn(), onWidthChange, onWidthCommit,
  })); });
  await act(async () => renderer.root.findByProps({ accessibilityLabel: '선택한 손그림 색 #FFADD5' }).props.onPress());
  expect(onChange).toHaveBeenLastCalledWith({ color: '#FFADD5' });
  const slider = renderer.root.findByProps({ accessibilityLabel: '선택한 손그림 굵기' });
  await act(async () => { slider.props.onChange(24); slider.props.onChange(30); });
  expect(onWidthChange).toHaveBeenLastCalledWith(30);
  expect(onWidthCommit).not.toHaveBeenCalled();
  await act(async () => slider.props.onSlidingComplete(30));
  expect(onWidthCommit).toHaveBeenCalledTimes(1);
  expect(onWidthCommit).toHaveBeenCalledWith(30);

});

it('상단 붓 선택은 선택한 획의 종류만 바꾼다', async () => {
  const onChange = jest.fn();
  await act(async () => { renderer = create(createElement(HandStrokeBrushes, { brush: 'pen', onChange })); });
  await act(async () => renderer.root.findByProps({ accessibilityLabel: '선택한 손그림 네온' }).props.onPress());
  expect(onChange).toHaveBeenLastCalledWith('neon');
});
