import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearDraft, getDraft, saveDraft, type Draft } from './draft-store';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn(),
}));
jest.mock('@/components/route-preview', () => ({
  IDENTITY_SMOOTH: { smooth: 0, corner: 0 },
  IDENTITY_STAMP: { mode: 'always', position: { x: 0, y: 0 }, caption: '' },
}));
jest.mock('expo-file-system/legacy', () => ({ documentDirectory: 'file:///new/Documents/' }));
jest.mock('expo-asset', () => ({ Asset: {} }));

const draft: Omit<Draft, 'lastEditedAt'> = {
  run: { id: 'run', date: '2026-10-04', distanceMeters: 5000, durationSeconds: 1800,
    averagePaceSecPerKm: 360, hasRoute: true },
  track: { coordinates: [] }, backgroundImagePath: 'file:///bg.jpg', preset: 'default-drawing',
  transform: { x: 0, y: 0, scale: 1, rotationDeg: 0 }, smoothOptions: { smooth: 0, corner: 0 },
  stampConfig: { mode: 'always', layout: 'corner', placeName: '', position: { x: 0, y: 0 }, caption: '', captions: [],
    enabled: { distance: true, time: true, pace: true, heartRate: true, date: true, place: true } },
};
let stored: string | null;
beforeEach(() => {
  jest.clearAllMocks();
  stored = null;
  jest.mocked(AsyncStorage.setItem).mockImplementation(async (_key, value) => { stored = value; });
  jest.mocked(AsyncStorage.getItem).mockImplementation(async () => stored);
  jest.mocked(AsyncStorage.removeItem).mockImplementation(async () => { stored = null; });
});
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

it('앞선 저장이 늦어도 최신 편집값을 마지막에 남긴다', async () => {
  const gate = deferred();
  jest.mocked(AsyncStorage.setItem).mockImplementationOnce(async (_key, value) => { await gate.promise; stored = value; });
  const first = saveDraft(draft);
  const second = saveDraft({ ...draft, transform: { ...draft.transform, x: 100 } });
  await Promise.resolve(); await Promise.resolve();
  gate.resolve();
  await Promise.all([first, second]);
  expect((await getDraft())?.transform.x).toBe(100);
});

it('나가기 직후 읽기도 앞선 마지막 저장이 끝난 뒤 최신값을 읽는다', async () => {
  const gate = deferred();
  jest.mocked(AsyncStorage.setItem).mockImplementationOnce(async (_key, value) => { await gate.promise; stored = value; });
  const saving = saveDraft(draft);
  const reading = getDraft();
  await Promise.resolve(); await Promise.resolve();
  const readBeforeSave = jest.mocked(AsyncStorage.getItem).mock.calls.length;
  gate.resolve();
  await saving;
  expect((await reading)?.run.id).toBe('run');
  expect(readBeforeSave).toBe(0);
});

it('완성 후 삭제가 느린 저장 뒤에 적용되어 초안이 다시 생기지 않는다', async () => {
  const gate = deferred();
  jest.mocked(AsyncStorage.setItem).mockImplementationOnce(async (_key, value) => { await gate.promise; stored = value; });
  const saving = saveDraft(draft), clearing = clearDraft();
  await Promise.resolve(); await Promise.resolve();
  gate.resolve();
  await Promise.all([saving, clearing]);
  expect(await getDraft()).toBeNull();
});

it('지난 결과물 삭제 뒤 새 작업 저장은 새 초안으로 남는다', async () => {
  await saveDraft(draft);
  const clearing = clearDraft();
  const saving = saveDraft({ ...draft, run: { ...draft.run, id: 'new-run' } });
  await Promise.all([clearing, saving]);
  expect((await getDraft())?.run.id).toBe('new-run');
});

it('저장 실패를 호출자에게 알리면서 이후 저장·삭제를 막지 않는다', async () => {
  jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error('disk full'));
  await expect(saveDraft(draft)).rejects.toThrow('disk full');
  await saveDraft({ ...draft, transform: { ...draft.transform, y: 20 } });
  expect((await getDraft())?.transform.y).toBe(20);
  await clearDraft();
  expect(await getDraft()).toBeNull();
});

it('앱 컨테이너가 바뀐 옛 사진 경로와 누락된 기본 편집값을 계속 읽는다', async () => {
  stored = JSON.stringify({ ...draft, smoothOptions: undefined, stampConfig: undefined,
    backgroundImagePath: 'file:///old/Documents/backgrounds/bg.jpg',
    backgroundPhoto: { sourceUri: 'file:///old/Documents/backgrounds/photo.jpg', width: 100, height: 100,
      crop: { scale: 1, offsetX: 0, offsetY: 0 }, origin: 'gallery' } });
  const loaded = await getDraft();
  expect(loaded?.backgroundImagePath).toBe('file:///new/Documents/backgrounds/bg.jpg');
  expect(loaded?.backgroundPhoto?.sourceUri).toBe('file:///new/Documents/backgrounds/photo.jpg');
  expect(loaded?.smoothOptions).toEqual({ smooth: 0, corner: 0 });
  expect(loaded?.stampConfig.position).toEqual({ x: 0, y: 0 });
});

it('대기 중 객체가 바뀌어도 저장 요청 당시의 편집값을 남긴다', async () => {
  const value = { ...draft, transform: { ...draft.transform, x: 42 } };
  const saving = saveDraft(value);
  value.transform.x = 900;
  await saving;
  expect((await getDraft())?.transform.x).toBe(42);
});


it('스타일을 포함한 초안을 저장하고 다시 열어 모든 선택값을 유지한다', async () => {
  const value = { ...draft, routeStyle: { color: 'mint' as const, widthScale: 1.5 },
    stampConfig: { ...draft.stampConfig, font: 'pretendard' as const, textColor: 'black' as const } };
  await saveDraft(value);
  const loaded = await getDraft();
  expect(loaded?.routeStyle).toEqual(value.routeStyle);
  expect(loaded?.stampConfig).toEqual(value.stampConfig);
});


it('손그림 획과 좌표를 보관하고 오래된 초안은 빈 손그림으로 연다', async () => {
  await saveDraft(draft);
  expect((await getDraft())?.handDrawing).toEqual([]);
  const handDrawing = [{ id: 'ink', brush: 'neon' as const, color: '#8EF0CE', width: 24, points: [{ x: 1080, y: 1920 }], offset: { x: -400, y: -500 }, scale: 1.5 }];
  await saveDraft({ ...draft, handDrawing });
  expect((await getDraft())?.handDrawing).toEqual(handDrawing);
});


it('직접 고른 경로 색과 두께를 초안 저장·다시 열기에 유지한다', async () => {
  await saveDraft({ ...draft, routeStyle: { color: '#13ac72', widthScale: 1.4 } });
  expect((await getDraft())?.routeStyle).toEqual({ color: '#13AC72', widthScale: 1.4 });
});
