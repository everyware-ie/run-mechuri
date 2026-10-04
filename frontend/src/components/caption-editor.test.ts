import { act, createElement } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { CaptionEditor } from './caption-editor';

jest.mock('@/components/vertical-slider', () => {
  const { createElement: element } = jest.requireActual<typeof import('react')>('react');
  return { VerticalSlider: (props: object) => element('caption-size-slider', props) };
});
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let renderer: ReactTestRenderer;
afterEach(async () => { if (renderer) await act(async () => renderer.unmount()); });

// FRD §2-1: 크기 슬라이더를 잡는 동안만 미리보기를 멈추고 손을 떼면 이어 간다.
it('문구 크기 조작의 시작·종료를 미리보기 일시 정지에 연결한다', async () => {
  const onInteractionChange = jest.fn();
  const onScaleChange = jest.fn();
  await act(async () => {
    renderer = create(createElement(CaptionEditor, {
      text: '문구', scale: 1, fitScale: 0.4, keyboardHeight: 0, topInset: 44, limited: false,
      onChangeText: jest.fn(), onScaleChange, onDone: jest.fn(), onInteractionChange,
    } as React.ComponentProps<typeof CaptionEditor>));
  });
  const slider = renderer.root.findByProps({ accessibilityLabel: '문구 크기' });
  await act(async () => slider.props.onSlidingStart?.());
  expect(onInteractionChange).toHaveBeenLastCalledWith(true);
  await act(async () => slider.props.onChange(140));
  expect(onScaleChange).toHaveBeenLastCalledWith(1.4);
  await act(async () => slider.props.onSlidingComplete(150));
  expect(onScaleChange).toHaveBeenLastCalledWith(1.5);
  expect(onInteractionChange.mock.calls).toEqual([[true], [false]]);
});

it('문구 입력이 닫히면 미리보기의 조작 중 상태를 남기지 않는다', async () => {
  const onInteractionChange = jest.fn();
  await act(async () => {
    renderer = create(createElement(CaptionEditor, {
      text: '문구', scale: 1, fitScale: 0.4, keyboardHeight: 0, topInset: 44, limited: false,
      onChangeText: jest.fn(), onScaleChange: jest.fn(), onDone: jest.fn(), onInteractionChange,
    } as React.ComponentProps<typeof CaptionEditor>));
  });
  onInteractionChange.mockClear();
  await act(async () => renderer.unmount());
  expect(onInteractionChange).toHaveBeenLastCalledWith(false);
});
