import { act } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { Alert, AppState, Modal, Text } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { ResultVideoPreview } from './result-video-preview';
import { Slider } from './slider';

const mockPlayer = { play: jest.fn(), pause: jest.fn(), replay: jest.fn(), release: jest.fn(), status: 'readyToPlay', muted: false, audioMixingMode: '', loop: true, staysActiveInBackground: true, playing: false, currentTime: 0, duration: 12 };
const mockSources = jest.fn();
let mockStatus = 'readyToPlay';
jest.mock('expo', () => ({ useEvent: (_player: unknown, event: string) => event === 'statusChange' ? { status: mockStatus }
  : event === 'playingChange' ? { isPlaying: mockPlayer.playing } : { currentTime: mockPlayer.currentTime } }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-router', () => ({ useFocusEffect: (effect: () => void) => {
  const React = jest.requireActual<typeof import('react')>('react');
  React.useEffect(effect, [effect]);
} }));
jest.mock('expo-video', () => ({
  VideoView: 'TestVideoView',
  useVideoPlayer: (uri: string, setup: (player: typeof mockPlayer) => void) => {
    const React = jest.requireActual<typeof import('react')>('react');
    const [player] = React.useState(() => { mockSources(uri); setup(mockPlayer); return mockPlayer; });
    React.useEffect(() => () => player.release(), [player]);
    return player;
  },
}));
jest.mock('expo-file-system/legacy', () => ({ getInfoAsync: jest.fn() }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let renderer: ReactTestRenderer;
const uri = 'file:///Documents/clips/saved.mp4';
const press = (label: string) => renderer.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function')[0].props.onPress();
const video = () => renderer.root.findAll(node => node.type === ('TestVideoView' as unknown));
const renderPreview = () => <ResultVideoPreview uri={uri} size={300}><Text>thumbnail</Text></ResultVideoPreview>;

beforeEach(() => {
  jest.clearAllMocks(); mockStatus = 'readyToPlay';
  mockPlayer.playing = false; mockPlayer.currentTime = 0;
  mockPlayer.play.mockImplementation(() => { mockPlayer.playing = true; });
  mockPlayer.pause.mockImplementation(() => { mockPlayer.playing = false; });
  mockPlayer.replay.mockImplementation(() => { mockPlayer.currentTime = 0; mockPlayer.playing = true; });
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
  jest.mocked(FileSystem.getInfoAsync).mockResolvedValue({ exists: true, isDirectory: false, uri, modificationTime: 0, size: 100 });
});
afterEach(async () => { await act(async () => renderer?.unmount()); jest.restoreAllMocks(); });

it('버튼을 누를 때만 보관 영상을 열고 원래 비율과 영상 밖 전용 컨트롤로 재생한다', async () => {
  await act(async () => { renderer = create(renderPreview()); });
  expect(mockSources).not.toHaveBeenCalled();
  await act(async () => { await press('영상 재생'); });
  expect(FileSystem.getInfoAsync).toHaveBeenCalledWith(uri);
  expect(mockSources).toHaveBeenCalledWith(uri);
  expect(mockPlayer.play).toHaveBeenCalledTimes(1);
  expect(video()[0].props).toMatchObject({ contentFit: 'contain', nativeControls: false, allowsPictureInPicture: false, pointerEvents: 'none' });
  expect(renderer.root.findAllByType(Modal)).toHaveLength(0);
  expect(mockPlayer).toMatchObject({ muted: true, audioMixingMode: 'mixWithOthers', staysActiveInBackground: false });
  await act(async () => { press('영상 정지'); });
  expect(mockPlayer.pause).toHaveBeenCalled();
  expect(mockPlayer.release).toHaveBeenCalledTimes(1);
  expect(video()).toHaveLength(0);
  expect(renderer.root.findAllByType(Text).some(node => node.props.children === 'thumbnail')).toBe(true);
});

it('없는 파일은 안내하며 다시 시도할 수 있다', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.mocked(FileSystem.getInfoAsync).mockResolvedValueOnce({ exists: false, uri, isDirectory: false });
  await act(async () => { renderer = create(renderPreview()); });
  await act(async () => { await press('영상 재생'); });
  expect(alert).toHaveBeenCalledWith('영상을 찾을 수 없어요', expect.any(String));
  expect(mockSources).not.toHaveBeenCalled();
  await act(async () => { await press('영상 재생'); });
  expect(video()).toHaveLength(1);
});

it('파일 확인 실패도 재시도할 수 있고 중복 탭을 막는다', async () => {
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  let reject!: (error: Error) => void;
  jest.mocked(FileSystem.getInfoAsync).mockReturnValueOnce(new Promise((_resolve, no) => { reject = no; }));
  await act(async () => { renderer = create(renderPreview()); });
  await act(async () => { press('영상 재생'); press('영상 재생'); });
  expect(FileSystem.getInfoAsync).toHaveBeenCalledTimes(1);
  await act(async () => { reject(new Error('unavailable')); });
  expect(Alert.alert).toHaveBeenCalledWith('영상을 열지 못했어요', expect.any(String));
  await act(async () => { await press('영상 재생'); });
  expect(video()).toHaveLength(1);
});

it('파일 확인 중 화면을 떠나면 늦은 응답으로 플레이어를 열지 않는다', async () => {
  let resolve!: (info: FileSystem.FileInfo) => void;
  jest.mocked(FileSystem.getInfoAsync).mockReturnValueOnce(new Promise(ok => { resolve = ok; }));
  await act(async () => { renderer = create(renderPreview()); });
  await act(async () => { press('영상 재생'); });
  await act(async () => renderer.unmount());
  await act(async () => { resolve({ exists: true, isDirectory: false, uri, modificationTime: 0, size: 100 }); });
  expect(mockSources).not.toHaveBeenCalled();
});

it('앱 비활성화 시 재생을 멈추고 재생 오류에도 닫을 수 있다', async () => {
  const addListener = jest.spyOn(AppState, 'addEventListener');
  await act(async () => { renderer = create(renderPreview()); });
  await act(async () => { await press('영상 재생'); });
  const onChange = addListener.mock.calls.find(call => call[0] === 'change')![1];
  await act(async () => { onChange('background'); });
  expect(mockPlayer.pause).toHaveBeenCalled();
  mockStatus = 'error';
  await act(async () => { renderer.update(renderPreview()); });
  expect(renderer.root.findAllByType(Text).some(node => node.props.children === '영상을 재생하지 못했어요.')).toBe(true);
  await act(async () => { press('영상 정지'); });
  expect(mockPlayer.release).toHaveBeenCalledTimes(1);
});

it('전용 버튼으로 일시정지·재개·처음부터 재생하고 끝난 영상도 다시 재생한다', async () => {
  await act(async () => { renderer = create(renderPreview()); });
  await act(async () => { await press('영상 재생'); });
  await act(async () => { press('영상 일시정지'); renderer.update(renderPreview()); });
  expect(mockPlayer.playing).toBe(false);
  await act(async () => { press('영상 재생'); renderer.update(renderPreview()); });
  expect(mockPlayer.playing).toBe(true);
  mockPlayer.currentTime = 7;
  await act(async () => { press('영상 처음부터 재생'); });
  expect(mockPlayer.currentTime).toBe(0);
  expect(mockPlayer.playing).toBe(true);
  mockPlayer.currentTime = 12; mockPlayer.playing = false;
  await act(async () => { renderer.update(renderPreview()); });
  await act(async () => { press('영상 재생'); });
  expect(mockPlayer.currentTime).toBe(0);
  expect(mockPlayer.playing).toBe(true);
});

it('재생바로 위치를 옮기면 이전 재생 상태를 유지하고 앱 전환 뒤에는 재개하지 않는다', async () => {
  const addListener = jest.spyOn(AppState, 'addEventListener');
  await act(async () => { renderer = create(renderPreview()); });
  await act(async () => { await press('영상 재생'); });
  const slider = () => renderer.root.findByType(Slider);
  expect(slider().props.tapToSeek).toBe(true);
  await act(async () => { slider().props.onSlidingStart(); });
  expect(mockPlayer.playing).toBe(false);
  await act(async () => { slider().props.onChange(50); slider().props.onSlidingComplete(50); });
  expect(mockPlayer.currentTime).toBe(6);
  expect(mockPlayer.playing).toBe(true);
  mockPlayer.playing = false;
  await act(async () => { renderer.update(renderPreview()); });
  await act(async () => { slider().props.onSlidingStart(); slider().props.onChange(25); slider().props.onSlidingComplete(25); });
  expect(mockPlayer.currentTime).toBe(3);
  expect(mockPlayer.playing).toBe(false);
  mockPlayer.playing = true;
  await act(async () => { slider().props.onSlidingStart(); });
  const onChange = addListener.mock.calls.find(call => call[0] === 'change')![1];
  await act(async () => { onChange('background'); slider().props.onSlidingComplete(70); });
  expect(mockPlayer.playing).toBe(false);
});
