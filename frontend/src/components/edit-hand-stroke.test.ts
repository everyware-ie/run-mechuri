import { act, createElement } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { PanResponder } from 'react-native';
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
jest.mock('@/hooks/use-draft-autosave', () => ({ useDraftAutosave: () => {} }));
jest.mock('@/components/hand-drawing-editor', () => ({ HandDrawingEditor: () => null }));
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
  const [draft, setDraft] = useState(mockInitial);
  return { draft, setHandDrawing: (handDrawing: object[]) => setDraft((previous: object) => ({ ...previous, handDrawing })),
    setPreset: jest.fn(), setTransform: jest.fn(), setRouteStyle: jest.fn(), setSmoothOptions: jest.fn(),
    setStampConfig: jest.fn(), setBackground: jest.fn(), loadDraft: setDraft, resetTransform: jest.fn() };
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
