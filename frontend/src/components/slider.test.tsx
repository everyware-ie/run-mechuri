import { act } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { PanResponder, type PanResponderCallbacks } from 'react-native';
import { Slider } from './slider';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let renderer: ReactTestRenderer;
let handlers: PanResponderCallbacks;
beforeEach(() => {
  jest.spyOn(PanResponder, 'create').mockImplementation(callbacks => {
    handlers = callbacks;
    return { panHandlers: {} };
  });
});
afterEach(async () => { await act(async () => renderer?.unmount()); jest.restoreAllMocks(); });
const event = (locationX: number) => ({ nativeEvent: { locationX } } as Parameters<NonNullable<PanResponderCallbacks['onPanResponderGrant']>>[0]);
const gesture = (dx: number) => ({ dx } as Parameters<NonNullable<PanResponderCallbacks['onPanResponderMove']>>[1]);
async function layout() {
  await act(async () => { renderer.root.findAll(node => typeof node.props.onLayout === 'function')[0].props.onLayout({ nativeEvent: { layout: { width: 300 } } }); });
}

it('영상 탐색은 누른 지점에서 시작해 드래그하고 범위를 벗어나지 않는다', async () => {
  const change = jest.fn(), finish = jest.fn(), start = jest.fn();
  await act(async () => { renderer = create(<Slider value={0} tapToSeek onChange={change} onSlidingStart={start} onSlidingComplete={finish} />); });
  await layout();
  await act(async () => { handlers.onPanResponderGrant?.(event(150), gesture(0)); });
  expect(start).toHaveBeenCalledTimes(1);
  expect(change).toHaveBeenLastCalledWith(50);
  await act(async () => { handlers.onPanResponderMove?.(event(150), gesture(60)); });
  expect(change).toHaveBeenLastCalledWith(70);
  await act(async () => { handlers.onPanResponderMove?.(event(150), gesture(900)); handlers.onPanResponderRelease?.(event(150), gesture(900)); });
  expect(change).toHaveBeenLastCalledWith(100);
  expect(finish).toHaveBeenLastCalledWith(100);
});

it('기존 편집 슬라이더는 누른 곳으로 뛰지 않고 이전 값에서 드래그한다', async () => {
  const change = jest.fn();
  await act(async () => { renderer = create(<Slider value={20} onChange={change} />); });
  await layout();
  await act(async () => { handlers.onPanResponderGrant?.(event(250), gesture(0)); });
  expect(change).not.toHaveBeenCalled();
  await act(async () => { handlers.onPanResponderMove?.(event(250), gesture(30)); });
  expect(change).toHaveBeenLastCalledWith(30);
});
