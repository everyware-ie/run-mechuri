import { act, createElement } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { ActionSheetIOS, PanResponder, Platform } from 'react-native';
import EditScreen from '../app/edit';
import { IDENTITY_STAMP, IDENTITY_TRANSFORM } from '@/components/route-preview';

jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-router', () => ({ router: {}, useFocusEffect: jest.fn(), useIsFocused: () => true }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-location', () => ({ reverseGeocodeAsync: jest.fn().mockResolvedValue([]) }));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn().mockResolvedValue(undefined), ImpactFeedbackStyle: { Medium: 'medium' } }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
jest.mock('@/hooks/use-draft-autosave', () => ({ useDraftAutosave: () => jest.fn() }));
jest.mock('@/components/hand-drawing-editor', () => {
  const { createElement: element } = jest.requireActual('react');
  return { HandDrawingEditor: (props: object) => element('drawing-controls', props) };
});
jest.mock('@/components/route-color-picker', () => {
  const { createElement: element } = jest.requireActual('react');
  return { RouteColorPicker: (props: object) => element('route-color-picker', props) };
});
jest.mock('@/components/background-video', () => ({ CroppedBackgroundVideo: () => null }));
jest.mock('@/components/my-style-sheet', () => ({ MyStyleSheet: () => null }));
jest.mock('@shopify/react-native-skia', () => ({}));
jest.mock('react-native-worklets', () => ({}));
jest.mock('react-native-reanimated', () => {
  const { useRef } = jest.requireActual('react');
  return { __esModule: true, default: {}, useSharedValue: (value: number) => useRef({ value,
    get() { return this.value; }, set(next: number) { this.value = next; } }).current };
});
jest.mock('@/components/route-preview', () => {
  const real = jest.requireActual('@/components/route-preview');
  const { createElement: element } = jest.requireActual('react');
  return { ...real, RoutePreview: (props: object) => element('ink-preview', props) };
});
jest.mock('@/state/creation-flow', () => ({ useCreationFlow: () => {
  const { useState } = jest.requireActual('react');
  const { IDENTITY_TRANSFORM } = jest.requireActual('@/components/route-preview');
  const [draft, setDraft] = useState(mockInitial);
  return { draft, setHandDrawing: (handDrawing: object[]) => setDraft((previous: object) => ({ ...previous, handDrawing })),
    setPreset: jest.fn(), setTransform: (transform: object) => setDraft((previous: object) => ({ ...previous, transform })),
    setRouteStyle: (routeStyle: object) => setDraft((previous: object) => ({ ...previous, routeStyle })), setSmoothOptions: jest.fn(),
    setStampConfig: (stampConfig: object) => setDraft((previous: object) => ({ ...previous, stampConfig })),
    setBackground: jest.fn(), loadDraft: (partial: object) => setDraft((previous: object) => ({ ...previous, routeStyle: undefined, handDrawing: undefined, ...partial })),
    resetTransform: () => setDraft((previous: object) => ({ ...previous, transform: IDENTITY_TRANSFORM })) };
} }));
const mockInitial = {
  selectedRun: { id: 'qa', date: '2026-10-04', distanceMeters: 1000, durationSeconds: 360, averagePaceSecPerKm: 360, hasRoute: true },
  track: { coordinates: [{ latitude: 37, longitude: 127 }, { latitude: 37.01, longitude: 127.01 }] },
  backgroundImagePath: 'bg.jpg', preset: 'default-drawing', transform: IDENTITY_TRANSFORM,
  smoothOptions: { smooth: 0, corner: 0 },
  stampConfig: { ...IDENTITY_STAMP, placeName: '테스트', captions: [], hidden: true },
  handDrawing: [{ id: 'ink', brush: 'pen', color: '#FFFFFF', width: 12, points: [{ x: 300, y: 900 }, { x: 600, y: 900 }] }],
};
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let renderer: ReactTestRenderer;
const event = (x: number, y: number, second?: [number, number]) => ({ nativeEvent: {
  touches: [{ locationX: x, locationY: y, pageX: x, pageY: y }, ...(second ? [{ locationX: second[0], locationY: second[1], pageX: second[0], pageY: second[1] }] : [])],
} });
const preview = () => renderer.root.findByType('ink-preview' as never).props;
const handlers = () => renderer.root.findByProps({ accessibilityLabel: '결과물 미리보기. 끌어서 옮기고 두 손가락으로 크기를 바꿔요' }).props;
beforeEach(async () => {
  jest.spyOn(PanResponder, 'create').mockImplementation(config => ({ panHandlers: {
    onTouchStart: config.onPanResponderGrant, onTouchMove: config.onPanResponderMove, onTouchEnd: config.onPanResponderRelease,
  } } as unknown as ReturnType<typeof PanResponder.create>));
  await act(async () => { renderer = create(createElement(EditScreen)); });
  await act(async () => renderer.root.findAll(n => typeof n.props.onLayout === 'function')[0].props.onLayout({ nativeEvent: { layout: { width: 384, height: 656 } } }));
});
afterEach(async () => { await act(async () => renderer.unmount()); jest.restoreAllMocks(); });
it('실제 편집 화면의 탭·드래그는 해당 획을 선택하고 놓은 좌표를 한 번 저장한다', async () => {
  const pan = handlers();
  await act(async () => { pan.onTouchStart(event(150,300)); pan.onTouchEnd(); });
  expect(preview().selectedHandStrokeId).toBe('ink');
  await act(async () => { pan.onTouchStart(event(150,300)); pan.onTouchMove(event(210,390), { dx: 60, dy: 90 }); });
  expect(preview().handDrawing[0].offset).toBeUndefined();
  expect(preview().handStrokeEditing.x.value).toBe(180);
  expect(preview().handStrokeEditing.y.value).toBe(270);
  await act(async () => pan.onTouchEnd());
  expect(preview().handDrawing[0]).toMatchObject({ offset: { x: 180, y: 270 }, scale: 1 });
  expect(preview().handDrawing[0].points).toEqual(mockInitial.handDrawing[0].points);
});
it('핀치 후 한 손가락을 먼저 떼어도 크기가 원래 값으로 돌아가지 않는다', async () => {
  const pan = handlers();
  await act(async () => { pan.onTouchStart(event(150,300)); pan.onTouchEnd(); });
  await act(async () => { pan.onTouchStart(event(100,300,[200,300])); pan.onTouchMove(event(50,300,[250,300]), { dx: 0, dy: 0 }); });
  expect(preview().handStrokeEditing.scale.value).toBe(2);
  await act(async () => pan.onTouchMove(event(50,300), { dx: 0, dy: 0 }));
  expect(preview().handStrokeEditing.scale.value).toBe(2);
  await act(async () => pan.onTouchEnd());
  expect(preview().handDrawing[0].scale).toBe(2);
});
it('그리기 진입·복귀는 기존 미리보기와 크기를 유지하며 재생을 초기화하지 않는다', async () => {
  const canvas = renderer.root.findByType('ink-preview' as never);
  const size = { width: preview().viewWidth, height: preview().viewHeight };
  await act(async () => renderer.root.findByProps({ accessibilityLabel: '그리기' }).props.onPress());
  const controls = renderer.root.findByType('drawing-controls' as never);
  expect(controls.props.canvasSize).toEqual(size);
  expect(renderer.root.findAllByType('ink-preview' as never)).toEqual([canvas]);
  expect(preview()).toMatchObject({ playing: true, isInteracting: true, viewWidth: size.width, viewHeight: size.height });
  expect(handlers().pointerEvents).toBe('none');
  const active = { path: {}, brush: 'pen', color: '#FFFFFF', width: 12 };
  await act(async () => controls.props.onPreviewChange({ strokes: [], active }));
  expect(preview().handDrawing).toEqual([]);
  expect(preview().activeHandDrawing).toBe(active);
  await act(async () => controls.props.onDone());
  expect(renderer.root.findAllByType('ink-preview' as never)).toEqual([canvas]);
  expect(preview()).toMatchObject({ playing: true, isInteracting: false, viewWidth: size.width, viewHeight: size.height });
  expect(preview().activeHandDrawing).toBeUndefined();
  expect(preview().handDrawing).toEqual(mockInitial.handDrawing);
  expect(handlers().pointerEvents).toBe('auto');
});

it.each([
  ['경로', '경로 그림 크기', 'transform'],
  ['러닝 데이터', '러닝 데이터 크기', 'stampConfig'],
] as const)('%s 배치 복원 메뉴의 취소는 유지하고 실행은 배치만 복원하며 되돌릴 수 있다', async (label, sizeLabel, field) => {
  const originalOS = Platform.OS;
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
  const menu = jest.spyOn(ActionSheetIOS, 'showActionSheetWithOptions').mockImplementation(() => {});
  try {
    await act(async () => renderer.root.findByProps({ accessibilityLabel: label }).props.onPress());
    await act(async () => renderer.root.findByProps({ accessibilityLabel: sizeLabel }).props.onSlidingComplete(150));
    const before = preview()[field];
    expect(before.scale).toBe(1.5);
    const unrelated = field === 'transform' ? preview().stampConfig : preview().transform;
    await act(async () => renderer.root.findByProps({ accessibilityLabel: `${label} 더 보기` }).props.onPress());
    expect(preview()[field]).toEqual(before);
    await act(async () => menu.mock.calls[0][1](1));
    expect(preview()[field]).toEqual(before);
    await act(async () => renderer.root.findByProps({ accessibilityLabel: `${label} 더 보기` }).props.onPress());
    await act(async () => menu.mock.calls[1][1](0));
    expect(preview()[field].scale).toBe(1);
    if (field === 'stampConfig') expect(preview().stampConfig).toEqual({ ...before, position: { x: 0, y: 0 }, scale: 1 });
    else expect(preview().transform).toEqual(IDENTITY_TRANSFORM);
    expect(field === 'transform' ? preview().stampConfig : preview().transform).toEqual(unrelated);
    expect(preview().handDrawing).toEqual(mockInitial.handDrawing);
    await act(async () => renderer.root.findByProps({ accessibilityLabel: `${label} 편집 되돌리기` }).props.onPress());
    expect(preview()[field]).toEqual(before);
  } finally {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: originalOS });
  }
});


it('자유 색상 후보는 편집 이력을 만들지 않고 완료한 색만 한 번 되돌린다', async () => {
  await act(async () => renderer.root.findByProps({ accessibilityLabel: '경로' }).props.onPress());
  await act(async () => renderer.root.find(n => n.props.accessibilityRole === 'tab' && typeof n.props.onPress === 'function' && n.findAll(t => t.props.children === '선 스타일').length > 0).props.onPress());
  const open = async () => act(async () => renderer.root.findByProps({ accessibilityLabel: '더 많은 색' }).props.onPress());
  await open();
  let picker = renderer.root.findByType('route-color-picker' as never);
  await act(async () => { picker.props.onPreview('#0088CC'); picker.props.onPreview('#13AC72'); });
  expect(preview().routeStyle.color).toBe('#13AC72');
  expect(renderer.root.findByProps({ accessibilityLabel: '경로 편집 되돌리기' }).props.disabled).toBe(true);
  await act(async () => picker.props.onFinish(null));
  expect(preview().routeStyle.color).toBeUndefined();
  expect(renderer.root.findByProps({ accessibilityLabel: '경로 편집 되돌리기' }).props.disabled).toBe(true);
  await open();
  picker = renderer.root.findByType('route-color-picker' as never);
  await act(async () => { picker.props.onPreview('#13AC72'); picker.props.onFinish('#13AC72'); });
  expect(preview().routeStyle.color).toBe('#13AC72');
  await act(async () => renderer.root.findByProps({ accessibilityLabel: '경로 편집 되돌리기' }).props.onPress());
  expect(preview().routeStyle.color).toBeUndefined();
  expect(renderer.root.findByProps({ accessibilityLabel: '경로 편집 되돌리기' }).props.disabled).toBe(true);
  expect(preview().handDrawing).toEqual(mockInitial.handDrawing);
});
