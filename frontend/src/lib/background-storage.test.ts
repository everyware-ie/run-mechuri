import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import type { DefaultBackground } from '@/constants/default-backgrounds';
import { BACKGROUNDS_DIR, persistBackground, persistDefaultBackground } from './background-storage';

jest.mock('expo-asset', () => ({ Asset: { fromModule: jest.fn() } }));
jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///Documents/', makeDirectoryAsync: jest.fn(),
  getInfoAsync: jest.fn(), copyAsync: jest.fn(), moveAsync: jest.fn(), deleteAsync: jest.fn(),
}));
const download = jest.fn();
const background: DefaultBackground = { id: 'evening', label: '저녁', source: 1 };
beforeEach(() => {
  jest.clearAllMocks();
  download.mockResolvedValue({ localUri: 'file:///asset.jpg', uri: 'file:///asset.jpg' });
  jest.mocked(Asset.fromModule).mockReturnValue({ downloadAsync: download } as unknown as Asset);
  jest.mocked(FileSystem.makeDirectoryAsync).mockResolvedValue(undefined);
  jest.mocked(FileSystem.getInfoAsync).mockImplementation(async uri => uri.includes('.pending-')
    ? { exists: true, isDirectory: false, uri, size: 100, modificationTime: 0 }
    : { exists: false, isDirectory: false, uri });
  jest.mocked(FileSystem.copyAsync).mockResolvedValue(undefined);
  jest.mocked(FileSystem.moveAsync).mockResolvedValue(undefined);
  jest.mocked(FileSystem.deleteAsync).mockResolvedValue(undefined);
});

it('화면 전환 후 같은 배경을 다시 골라도 파일 준비 하나가 끝날 때까지 함께 기다린다', async () => {
  let finishCopy!: () => void;
  const copying = new Promise<void>((resolve) => { finishCopy = resolve; });
  jest.mocked(FileSystem.copyAsync).mockReturnValue(copying);
  let applied = 0;
  const first = persistDefaultBackground(background).then((path) => { applied++; return path; });
  // 첫 작업이 파일 복사에 들어간 동안에도 두 번째 요청은 끝나면 안 된다.
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  const second = persistDefaultBackground(background).then((path) => { applied++; return path; });
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  expect(applied).toBe(0);
  finishCopy();
  expect(await Promise.all([first, second])).toEqual([BACKGROUNDS_DIR + 'evening.jpg', BACKGROUNDS_DIR + 'evening.jpg']);
  expect(download).toHaveBeenCalledTimes(1);
  expect(FileSystem.copyAsync).toHaveBeenCalledTimes(1);
});

it('다른 배경들은 각자 파일을 준비한다', async () => {
  const paths = await Promise.all([
    persistDefaultBackground(background),
    persistDefaultBackground({ ...background, id: 'noon', source: 2 }),
  ]);
  expect(paths).toEqual([BACKGROUNDS_DIR + 'evening.jpg', BACKGROUNDS_DIR + 'noon.jpg']);
  expect(FileSystem.copyAsync).toHaveBeenCalledTimes(2);
});

it('파일 준비에 실패해도 다음 선택은 새로 재시도한다', async () => {
  download.mockRejectedValueOnce(new Error('asset failed'));
  await expect(persistDefaultBackground(background)).rejects.toThrow('asset failed');
  await expect(persistDefaultBackground(background)).resolves.toBe(BACKGROUNDS_DIR + 'evening.jpg');
  expect(download).toHaveBeenCalledTimes(2);
});

it('이미 보관한 기본 배경은 다시 복사하지 않는다', async () => {
  jest.mocked(FileSystem.getInfoAsync).mockResolvedValue({ exists: true, isDirectory: false,
    uri: BACKGROUNDS_DIR + 'evening.jpg', size: 100, modificationTime: 0 });
  await expect(persistDefaultBackground(background)).resolves.toBe(BACKGROUNDS_DIR + 'evening.jpg');
  expect(FileSystem.copyAsync).not.toHaveBeenCalled();
});

it('복사가 중간에 실패해 파일이 남아도 다음 선택에서 미완성 배경을 재사용하지 않는다', async () => {
  const files = new Map<string, number>();
  jest.mocked(FileSystem.getInfoAsync).mockImplementation(async uri => files.has(uri)
    ? { exists: true, isDirectory: false, uri, size: files.get(uri)!, modificationTime: 0 }
    : { exists: false, isDirectory: false, uri });
  jest.mocked(FileSystem.copyAsync).mockImplementationOnce(async ({ to }) => { files.set(to, 7); throw new Error('out of space'); })
    .mockImplementation(async ({ to }) => { files.set(to, 100); });
  jest.mocked(FileSystem.moveAsync).mockImplementation(async ({ from, to }) => { files.set(to, files.get(from)!); files.delete(from); });
  jest.mocked(FileSystem.deleteAsync).mockImplementation(async uri => { files.delete(uri); });
  await expect(persistBackground('file:///asset.jpg', 'partial.jpg')).rejects.toThrow('out of space');
  await expect(persistBackground('file:///asset.jpg', 'partial.jpg')).resolves.toBe(BACKGROUNDS_DIR + 'partial.jpg');
  expect(FileSystem.copyAsync).toHaveBeenCalledTimes(2);
  expect(files.get(BACKGROUNDS_DIR + 'partial.jpg')).toBe(100);
  expect([...files.keys()].some(path => path.includes('.pending-'))).toBe(false);
});

it('같은 확정 파일의 동시 복사는 하나만 실행하고 완료 전 경로를 반환하지 않는다', async () => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  jest.mocked(FileSystem.copyAsync).mockReturnValue(pending);
  let completed = 0;
  const first = persistBackground('file:///photo.jpg', 'same.jpg').then(path => { completed++; return path; });
  const second = persistBackground('file:///photo.jpg', 'same.jpg').then(path => { completed++; return path; });
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  expect(completed).toBe(0);
  release();
  expect(await Promise.all([first, second])).toEqual([BACKGROUNDS_DIR + 'same.jpg', BACKGROUNDS_DIR + 'same.jpg']);
  expect(FileSystem.copyAsync).toHaveBeenCalledTimes(1);
  expect(FileSystem.moveAsync).toHaveBeenCalledTimes(1);
});

it('확정 파일명으로 옮기지 못해도 임시 파일만 정리하고 다시 시도한다', async () => {
  jest.mocked(FileSystem.moveAsync).mockRejectedValueOnce(new Error('rename failed'));
  await expect(persistBackground('file:///photo.jpg', 'retry.jpg')).rejects.toThrow('rename failed');
  expect(jest.mocked(FileSystem.deleteAsync).mock.calls.every(([uri]) => uri.includes('retry.jpg.pending-'))).toBe(true);
  await expect(persistBackground('file:///photo.jpg', 'retry.jpg')).resolves.toBe(BACKGROUNDS_DIR + 'retry.jpg');
  expect(FileSystem.copyAsync).toHaveBeenCalledTimes(2);
});

it('비어 있는 보관 파일은 다시 만들고, 복사 결과가 비었으면 완료로 반환하지 않는다', async () => {
  jest.mocked(FileSystem.getInfoAsync).mockImplementation(async uri => ({ exists: true, isDirectory: false, uri,
    size: uri.includes('.pending-') ? 100 : 0, modificationTime: 0 }));
  await expect(persistBackground('file:///photo.jpg', 'empty.jpg')).resolves.toBe(BACKGROUNDS_DIR + 'empty.jpg');
  expect(FileSystem.copyAsync).toHaveBeenCalledTimes(1);
  jest.mocked(FileSystem.getInfoAsync).mockResolvedValue({ exists: true, isDirectory: false, uri: 'empty', size: 0, modificationTime: 0 });
  await expect(persistBackground('file:///photo.jpg', 'bad-source.jpg')).rejects.toThrow('복사가 완료되지');
  expect(FileSystem.moveAsync).toHaveBeenCalledTimes(1);
});
