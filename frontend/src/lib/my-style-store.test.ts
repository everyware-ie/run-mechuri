import AsyncStorage from '@react-native-async-storage/async-storage';
import { applyMyStyle, captureMyStyle, deleteMyStyle, listMyStyles, MAX_MY_STYLES, saveMyStyle } from './my-style-store';
import type { EditSnapshot } from './edit-history';
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn() }));
const snapshot: EditSnapshot = {
  backgroundImagePath: 'file:///Documents/backgrounds/noon.jpg', preset: 'light-runner',
  transform: { x: 100, y: -90, scale: 1.7, rotationDeg: 30 },
  smoothOptions: { smooth: 35, corner: 70 }, routeStyle: { color: 'mint', widthScale: 1.4 },
  handDrawing: [{ id: 'a', brush: 'pen', color: '#FFFFFF', width: 12, points: [{ x: 50, y: 50 }] }],
  stampConfig: { mode: 'always', layout: 'glass', caption: '나의 문구', position: { x: 70, y: 200 }, scale: 2,
    placeName: '개인 장소', font: 'noto', textColor: 'black', enabled: { distance: true, time: false, pace: true, date: false, heartRate: true, place: false } },
};
let stored: string | null;
beforeEach(() => {
  jest.clearAllMocks(); stored = null;
  jest.mocked(AsyncStorage.getItem).mockImplementation(async () => stored);
  jest.mocked(AsyncStorage.setItem).mockImplementation(async (_key, value) => { stored = value; });
});
it('스타일에 다듬기를 포함하고 기록·위치·문구·손그림·사진 경로를 저장하지 않는다', () => {
  const style = captureMyStyle(snapshot, '  민트  ');
  expect(style.backgroundId).toBe('noon'); expect(style.smoothOptions).toEqual({ smooth: 35, corner: 70 });
  expect(style.name).toBe('민트');
  for (const privateValue of ['개인 장소', '나의 문구', 'handDrawing', 'rotationDeg', 'Documents']) expect(JSON.stringify(style)).not.toContain(privateValue);
});
it('개인 배경의 스타일을 적용해도 대상 사진·구도·문구·손그림·크기가 유지된다', () => {
  const photo = { sourceUri: 'file:///private.jpg', width: 2000, height: 2000, origin: 'gallery' as const, crop: { zoom: 1, centerX: .5, centerY: .5 } };
  const style = captureMyStyle({ ...snapshot, backgroundPhoto: photo }, '사진 스타일');
  expect(style.backgroundId).toBeNull();
  const target = { ...snapshot, backgroundPhoto: photo, preset: 'default-drawing' as const, smoothOptions: { smooth: 0, corner: 0 } };
  const applied = applyMyStyle(target, style);
  expect(applied.backgroundPhoto).toBe(photo); expect(applied.transform).toBe(target.transform);
  expect(applied.handDrawing).toBe(target.handDrawing); expect(applied.stampConfig.caption).toBe('나의 문구');
  expect(applied.stampConfig.position).toBe(target.stampConfig.position); expect(applied.stampConfig.scale).toBe(2);
  expect(applied.smoothOptions).toEqual({ smooth: 35, corner: 70 });
  const builtin = applyMyStyle(target, style, 'file:///noon.jpg');
  expect(builtin.backgroundPhoto).toBeUndefined(); expect(builtin.backgroundImagePath).toBe('file:///noon.jpg');
});
it('동시에 저장·삭제해도 다른 스타일을 잃지 않고 보관한 값으로 다시 읽는다', async () => {
  const a = captureMyStyle(snapshot, '첫째'), b = captureMyStyle(snapshot, '둘째');
  await Promise.all([saveMyStyle(a), saveMyStyle(b), deleteMyStyle(a.id)]);
  expect(await listMyStyles()).toEqual([b]);
});
it('20개 한도와 실패한 쓰기 후 재시도에서 기존 스타일을 보존한다', async () => {
  jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error('disk'));
  await expect(saveMyStyle(captureMyStyle(snapshot, '실패'))).rejects.toThrow('disk');
  expect(await listMyStyles()).toEqual([]);
  for (let i = 0; i < MAX_MY_STYLES; i++) await saveMyStyle(captureMyStyle(snapshot, `스타일 ${i}`));
  await expect(saveMyStyle(captureMyStyle(snapshot, '넘침'))).rejects.toThrow('style-limit');
  expect(await listMyStyles()).toHaveLength(20);
});
it('깨진 저장값은 오류로 알려 기존 데이터를 덮어쓰지 않는다', async () => {
  stored = '{';
  await expect(saveMyStyle(captureMyStyle(snapshot, '새 값'))).rejects.toThrow();
  expect(stored).toBe('{'); expect(AsyncStorage.setItem).not.toHaveBeenCalled();
});
