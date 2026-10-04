import { act, createElement, useEffect } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { useSaveToPhotos } from './use-save-to-photos';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const permission = jest.fn();
const nativeSave = jest.fn();
const loadLibrary = jest.fn();
let output: ReturnType<typeof useSaveToPhotos>;
function Harness({ path }: { path?: string }) {
  const value = useSaveToPhotos(path, loadLibrary);
  useEffect(() => { output = value; }, [value]);
  return null;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
let renderer: ReactTestRenderer;
let mounted: boolean;
beforeEach(async () => {
  permission.mockReset().mockResolvedValue({ status: 'granted' });
  nativeSave.mockReset().mockResolvedValue(undefined);
  loadLibrary.mockReset().mockResolvedValue({ requestPermissionsAsync: permission, saveToLibraryAsync: nativeSave });
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  await act(async () => { renderer = create(createElement(Harness, { path: 'file:///clip.mp4' })); });
  mounted = true;
});
afterEach(async () => {
  if (mounted) await act(async () => renderer.unmount());
  jest.restoreAllMocks();
});

it('영상이 없으면 권한이나 저장을 요청하지 않는다', async () => {
  await act(async () => { renderer.update(createElement(Harness)); });
  await act(async () => { await output.saveToPhotos(); });
  expect(permission).not.toHaveBeenCalled();
  expect(nativeSave).not.toHaveBeenCalled();
  expect(output.saving).toBe(false);
});

it('React 갱신 전 연속 탭과 권한 대기 중 재탭은 저장을 한 번만 실행한다', async () => {
  const job = deferred<{ status: string }>();
  permission.mockReturnValue(job.promise);
  let done!: Promise<void>;
  await act(async () => { done = output.saveToPhotos(); void output.saveToPhotos(); });
  expect(output.saving).toBe(true);
  await act(async () => { await output.saveToPhotos(); });
  expect(permission).toHaveBeenCalledTimes(1);
  expect(permission).toHaveBeenCalledWith(true);
  await act(async () => { job.resolve({ status: 'granted' }); await done; });
  expect(nativeSave.mock.calls).toEqual([['file:///clip.mp4']]);
  expect(output.saveStatus).toBe('기기에 저장했어요');
  expect(output.saving).toBe(false);
});

it('네이티브 저장 중 탭도 같은 파일을 중복 저장하지 않는다', async () => {
  const job = deferred<void>();
  nativeSave.mockReturnValue(job.promise);
  let done!: Promise<void>;
  await act(async () => { done = output.saveToPhotos(); });
  await act(async () => { await output.saveToPhotos(); });
  expect(nativeSave).toHaveBeenCalledTimes(1);
  await act(async () => { job.resolve(); await done; });
  expect(output.saving).toBe(false);
});

it('권한 거부 시 저장하지 않고 허용 후 다시 시도할 수 있다', async () => {
  permission.mockResolvedValueOnce({ status: 'denied' });
  await act(async () => { await output.saveToPhotos(); });
  expect(nativeSave).not.toHaveBeenCalled();
  expect(output.saveStatus).toContain('권한');
  expect(output.saving).toBe(false);
  await act(async () => { await output.saveToPhotos(); });
  expect(nativeSave).toHaveBeenCalledTimes(1);
  expect(output.saveStatus).toBe('기기에 저장했어요');
});

it.each(['load', 'permission', 'save'])('%s 단계의 오류도 안내하고 다시 시도할 수 있다', async (stage) => {
  (stage === 'load' ? loadLibrary : stage === 'permission' ? permission : nativeSave).mockRejectedValueOnce(new Error('native failed'));
  await act(async () => { await expect(output.saveToPhotos()).resolves.toBeUndefined(); });
  expect(output.saveStatus).toContain('다시 시도');
  expect(output.saving).toBe(false);
  if (stage !== 'save') expect(nativeSave).not.toHaveBeenCalled();
  await act(async () => { await output.saveToPhotos(); });
  expect(output.saveStatus).toBe('기기에 저장했어요');
});

it.each(['success', 'failure'])('화면을 떠난 뒤 늦은 %s은 UI를 갱신하지 않고 저장 처리는 마친다', async (outcome) => {
  const job = deferred<void>();
  nativeSave.mockReturnValue(job.promise);
  let done!: Promise<void>;
  await act(async () => { done = output.saveToPhotos(); });
  await act(async () => { renderer.unmount(); mounted = false; });
  await act(async () => {
    if (outcome === 'success') job.resolve(); else job.reject(new Error('late failed'));
    await expect(done).resolves.toBeUndefined();
  });
  expect(output.saveStatus).toBeNull();
  const oldCount = nativeSave.mock.calls.length;
  await output.saveToPhotos();
  expect(nativeSave).toHaveBeenCalledTimes(oldCount);
});
