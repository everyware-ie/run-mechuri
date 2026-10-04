import AsyncStorage from '@react-native-async-storage/async-storage';
import { addResult, deleteResult, getResult, listResults, type SavedResult } from './results-store';

jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn() }));
jest.mock('@/components/route-preview', () => ({
  IDENTITY_SMOOTH: { smooth: 0, corner: 0 },
  IDENTITY_STAMP: { mode: 'always', position: { x: 0, y: 0 }, caption: '' },
}));
jest.mock('expo-file-system/legacy', () => ({ documentDirectory: 'file:///new/Documents/' }));
jest.mock('expo-asset', () => ({ Asset: {} }));

function result(id: string, runDate = '2026-10-04', createdAt = '2026-10-04T10:00:00Z'): SavedResult {
  return {
    id, runDate, createdAt, distanceMeters: 5000,
    run: { id: 'run', date: runDate, distanceMeters: 5000, durationSeconds: 1800,
      averagePaceSecPerKm: 360, hasRoute: true },
    track: { coordinates: [] }, backgroundImagePath: 'file:///bg.jpg', outputPath: `file:///${id}.mp4`,
    preset: 'default-drawing', transform: { x: 0, y: 0, scale: 1, rotationDeg: 0 },
    smoothOptions: { smooth: 0, corner: 0 },
    stampConfig: { mode: 'always', layout: 'corner', placeName: '', position: { x: 0, y: 0 }, caption: '',
      enabled: { distance: true, time: true, pace: true, heartRate: true, date: true, place: true } },
  };
}
let stored: string | null;
beforeEach(() => {
  jest.clearAllMocks();
  stored = null;
  jest.mocked(AsyncStorage.getItem).mockImplementation(async () => stored);
  jest.mocked(AsyncStorage.setItem).mockImplementation(async (_key, value) => { stored = value; });
});
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

it('동시에 추가한 결과물을 모두 보존한다', async () => {
  await Promise.all([addResult(result('a')), addResult(result('b')), addResult(result('c'))]);
  expect((await listResults()).map(r => r.id).sort()).toEqual(['a', 'b', 'c']);
});

it.each(['add-first', 'delete-first'])('추가와 삭제가 겹쳐도 새 항목과 삭제 의도를 보존한다: %s', async (order) => {
  stored = JSON.stringify([result('old'), result('keep')]);
  const jobs = order === 'add-first'
    ? [addResult(result('new')), deleteResult('old')]
    : [deleteResult('old'), addResult(result('new'))];
  await Promise.all(jobs);
  expect((await listResults()).map(r => r.id).sort()).toEqual(['keep', 'new']);
});

it('여러 삭제가 겹쳐도 삭제된 다른 항목이 다시 나타나지 않는다', async () => {
  stored = JSON.stringify([result('a'), result('b'), result('keep')]);
  await Promise.all([deleteResult('a'), deleteResult('b')]);
  expect((await listResults()).map(r => r.id)).toEqual(['keep']);
});

it.each(['add-first', 'delete-first'])('같은 항목 추가·삭제는 호출한 순서대로 적용한다: %s', async (order) => {
  await Promise.all(order === 'add-first'
    ? [addResult(result('same')), deleteResult('same')]
    : [deleteResult('same'), addResult(result('same'))]);
  expect((await listResults()).map(r => r.id)).toEqual(order === 'add-first' ? [] : ['same']);
});

it('홈 목록과 상세 조회는 앞선 저장 완료 뒤 최신 결과물을 읽는다', async () => {
  const gate = deferred();
  jest.mocked(AsyncStorage.setItem).mockImplementationOnce(async (_key, value) => { await gate.promise; stored = value; });
  const writing = addResult(result('new'));
  const listing = listResults(), reading = getResult('new');
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  gate.resolve();
  await writing;
  expect((await listing).map(r => r.id)).toEqual(['new']);
  expect((await reading)?.id).toBe('new');
});

it('저장 실패는 호출자에게 반환하고 다음 저장·삭제는 계속한다', async () => {
  const failure = new Error('disk full');
  jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(failure);
  const failing = expect(addResult(result('failed'))).rejects.toBe(failure);
  const succeeding = addResult(result('saved'));
  await Promise.all([failing, succeeding]);
  expect((await listResults()).map(r => r.id)).toEqual(['saved']);
  await deleteResult('saved');
  expect(await listResults()).toEqual([]);
});

it('조회 실패 뒤에도 이후 요청은 계속한다', async () => {
  jest.mocked(AsyncStorage.getItem).mockRejectedValueOnce(new Error('read failed'));
  await expect(listResults()).rejects.toThrow('read failed');
  await addResult(result('saved'));
  expect((await getResult('saved'))?.id).toBe('saved');
});

it('대기 중 입력 객체가 바뀌어도 요청 당시 편집값을 저장한다', async () => {
  const value = result('new');
  const writing = addResult(value);
  value.transform.x = 900;
  await writing;
  expect((await getResult('new'))?.transform.x).toBe(0);
});

it('기존 저장 키·날짜 정렬·옛 편집값과 사진 경로 보완을 유지한다', async () => {
  stored = JSON.stringify([
    { ...result('legacy', '2026-09-01'), smoothOptions: undefined, stampConfig: undefined,
      backgroundImagePath: 'file:///old/Documents/backgrounds/bg.jpg' },
    result('older', '2026-10-04', '2026-10-04T09:00:00Z'),
    result('newer', '2026-10-04', '2026-10-04T11:00:00Z'),
  ]);
  const values = await listResults();
  expect(values.map(r => r.id)).toEqual(['newer', 'older', 'legacy']);
  expect(values[2].backgroundImagePath).toBe('file:///new/Documents/backgrounds/bg.jpg');
  expect(values[2].smoothOptions).toEqual({ smooth: 0, corner: 0 });
  expect(values[2].stampConfig.position).toEqual({ x: 0, y: 0 });
  expect(AsyncStorage.getItem).toHaveBeenCalledWith('mechuri.results.v2');
});


it('결과물과 다시 편집할 값에 선·글자 스타일을 함께 보관한다', async () => {
  const value = { ...result('styled'), routeStyle: { color: 'violet' as const, widthScale: .7 },
    stampConfig: { ...result('styled').stampConfig, font: 'noto' as const, textColor: 'white' as const } };
  await addResult(value);
  const loaded = await getResult(value.id);
  expect(loaded?.routeStyle).toEqual(value.routeStyle);
  expect(loaded?.stampConfig).toEqual(value.stampConfig);
});


it('완성한 손그림은 다시 편집할 때 같은 붓·좌표로 남고 기존 결과물은 빈 손그림이다', async () => {
  await addResult(result('old'));
  expect((await getResult('old'))?.handDrawing).toEqual([]);
  const handDrawing = [{ id: 'ink', brush: 'neon' as const, color: '#8EF0CE', width: 24, points: [{ x: 900, y: 1800 }] }];
  await addResult({ ...result('new'), handDrawing });
  expect((await getResult('new'))?.handDrawing).toEqual(handDrawing);
});
