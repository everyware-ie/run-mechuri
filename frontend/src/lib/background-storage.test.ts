import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import type { DefaultBackground } from '@/constants/default-backgrounds';
import { BACKGROUNDS_DIR, persistDefaultBackground } from './background-storage';

jest.mock('expo-asset', () => ({ Asset: { fromModule: jest.fn() } }));
jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///Documents/', makeDirectoryAsync: jest.fn(),
  getInfoAsync: jest.fn(), copyAsync: jest.fn(),
}));
const download = jest.fn();
const background: DefaultBackground = { id: 'evening', label: '저녁', source: 1 };
beforeEach(() => {
  jest.clearAllMocks();
  download.mockResolvedValue({ localUri: 'file:///asset.jpg', uri: 'file:///asset.jpg' });
  jest.mocked(Asset.fromModule).mockReturnValue({ downloadAsync: download } as unknown as Asset);
  jest.mocked(FileSystem.makeDirectoryAsync).mockResolvedValue(undefined);
  jest.mocked(FileSystem.getInfoAsync).mockResolvedValue({ exists: false, isDirectory: false, uri: 'file:///asset.jpg' });
  jest.mocked(FileSystem.copyAsync).mockResolvedValue(undefined);
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
