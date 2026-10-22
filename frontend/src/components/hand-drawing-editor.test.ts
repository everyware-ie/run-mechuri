import { act, createElement } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { AppState, PanResponder } from 'react-native';
import { HandDrawingEditor } from './hand-drawing-editor';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@shopify/react-native-skia', () => ({ Skia: { Path: { Make: () => ({ moveTo() {}, lineTo() {}, copy() { return this; } }) } } }));
jest.mock('react-native-reanimated', () => {
  const { useRef } = jest.requireActual('react');
  return { useSharedValue: (value: unknown) => useRef({ value, get() { return this.value; }, set(next: unknown) { this.value = next; } }).current };
});
jest.mock('./vertical-slider', () => ({ VerticalSlider: () => null }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let renderer: ReactTestRenderer;
const onChange = jest.fn(), onDone = jest.fn(), onPreviewChange = jest.fn();
const event = (x: number, y: number) => ({ nativeEvent: { locationX: x, locationY: y, touches: [{}] } });
const canvas = () => renderer.root.findByProps({ accessibilityLabel: '손그림 캔버스' }).props;
const props = () => ({ initial: [], canvasSize: { width: 360, height: 640 }, onPreviewChange, onChange, onDone });
const draw = async (x: number) => act(async () => {
  canvas().onTouchStart(event(x, 100)); canvas().onTouchMove(event(x + 30, 120)); canvas().onTouchEnd();
});
beforeEach(async () => {
  jest.clearAllMocks();
  jest.spyOn(PanResponder, 'create').mockImplementation(config => ({ panHandlers: {
    onTouchStart: config.onPanResponderGrant, onTouchMove: config.onPanResponderMove, onTouchEnd: config.onPanResponderRelease,
  } } as unknown as ReturnType<typeof PanResponder.create>));
  await act(async () => { renderer = create(createElement(HandDrawingEditor, props())); });
});
afterEach(async () => { await act(async () => renderer.unmount()); jest.restoreAllMocks(); });

it('손그림 되돌리기를 빠르게 연속으로 눌러도 각각의 획을 순서대로 복구한다', async () => {
  await draw(100); await draw(200);
  expect(onChange.mock.calls.at(-1)[0]).toHaveLength(2);
  const undo = renderer.root.findByProps({ accessibilityLabel: '손그림 되돌리기' }).props.onPress;
  await act(async () => { undo(); undo(); undo(); });
  expect(onChange.mock.calls.at(-1)[0]).toEqual([]);
  expect(renderer.root.findByProps({ accessibilityLabel: '손그림 되돌리기' }).props.disabled).toBe(true);
  expect(onChange).toHaveBeenCalledTimes(4);
  await draw(250);
  expect(onChange.mock.calls.at(-1)[0]).toHaveLength(1);
  expect(onChange.mock.calls.at(-1)[0][0].points).toHaveLength(2);
});

it('앱 전환으로 진행 중 획을 마친 뒤 완료해도 같은 획을 두 번 저장하지 않는다', async () => {
  const state = jest.spyOn(AppState, 'addEventListener');
  await act(async () => { renderer.unmount(); renderer = create(createElement(HandDrawingEditor, props())); });
  await act(async () => { canvas().onTouchStart(event(100, 100)); canvas().onTouchMove(event(140, 130)); });
  await act(async () => state.mock.calls[0][1]('background'));
  await act(async () => renderer.root.findByProps({ accessibilityLabel: '그리기 완료' }).props.onPress());
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange.mock.calls[0][0][0].points).toHaveLength(2);
  expect(onDone).toHaveBeenCalledTimes(1);
});
