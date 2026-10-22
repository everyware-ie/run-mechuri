import { act, createElement, useEffect } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { Alert, Linking } from 'react-native';
import { getInfoAsync } from 'expo-file-system/legacy';
import InstagramStoryShare from '../../modules/instagram-story-share/src/InstagramStoryShareModule';
import { useInstagramShare } from './use-instagram-share';

let mockFocused = true;
jest.mock('expo-router', () => ({ useIsFocused: () => mockFocused }));
jest.mock('expo-file-system/legacy', () => ({ getInfoAsync: jest.fn() }));
jest.mock('../../modules/instagram-story-share/src/InstagramStoryShareModule', () => ({
  __esModule: true, default: { shareToStory: jest.fn() },
}));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const fileCheck = getInfoAsync as jest.Mock;
const send = InstagramStoryShare.shareToStory as jest.Mock;
const onUnavailable = jest.fn(), onShared = jest.fn();
let output: ReturnType<typeof useInstagramShare>;
function Harness({ path = 'file:///clip.mp4' }: { path?: string | null }) {
  const value = useInstagramShare({ outputPath: path, backgroundImagePath: 'file:///bg.jpg', onUnavailable, onShared });
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
  jest.clearAllMocks();
  mockFocused = true;
  fileCheck.mockReset().mockResolvedValue({ exists: true });
  send.mockReset().mockResolvedValue(undefined);
  jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  await act(async () => { renderer = create(createElement(Harness)); });
  mounted = true;
});
afterEach(async () => {
  if (mounted) await act(async () => renderer.unmount());
  jest.restoreAllMocks();
});
async function focus(value: boolean) {
  mockFocused = value;
  await act(async () => { renderer.update(createElement(Harness)); });
}

it('영상이 없거나 숨은 화면에서는 공유를 시작하지 않는다', async () => {
  await act(async () => { renderer.update(createElement(Harness, { path: null })); });
  await act(async () => { await output.share(); });
  await focus(false);
  await act(async () => { await output.share(); });
  expect(fileCheck).not.toHaveBeenCalled();
  expect(send).not.toHaveBeenCalled();
});

it('React 갱신 전 연속 탭과 파일 확인 중 재탭은 한 요청으로 처리한다', async () => {
  const job = deferred<{ exists: boolean }>();
  fileCheck.mockReturnValue(job.promise);
  let done!: Promise<void>;
  await act(async () => { done = output.share(); void output.share(); });
  expect(output.sharing).toBe(true);
  await act(async () => { await output.share(); });
  expect(fileCheck).toHaveBeenCalledTimes(1);
  await act(async () => { job.resolve({ exists: true }); await done; });
  expect(send.mock.calls).toEqual([['file:///clip.mp4', 'file:///bg.jpg']]);
  expect(onShared).toHaveBeenCalledTimes(1);
  expect(output.sharing).toBe(false);
});

it('네이티브 공유 중 연속 탭도 앱을 중복으로 열지 않는다', async () => {
  const job = deferred<void>();
  send.mockReturnValue(job.promise);
  let done!: Promise<void>;
  await act(async () => { done = output.share(); });
  await act(async () => { await output.share(); });
  expect(send).toHaveBeenCalledTimes(1);
  await act(async () => { job.resolve(); await done; });
  expect(onShared).toHaveBeenCalledTimes(1);
});

it('사라진 영상은 다시 만들도록 안내하고 공유를 호출하지 않는다', async () => {
  fileCheck.mockResolvedValue({ exists: false });
  await act(async () => { await output.share(); });
  expect(Alert.alert).toHaveBeenCalledWith('영상을 더 이상 찾을 수 없어요', expect.stringContaining('다시 편집'));
  expect(Linking.canOpenURL).not.toHaveBeenCalled();
  expect(send).not.toHaveBeenCalled();
  expect(onShared).not.toHaveBeenCalled();
});

it('미설치는 저장 안내로 연결하며 공유나 성공 처리를 하지 않는다', async () => {
  jest.mocked(Linking.canOpenURL).mockResolvedValue(false);
  await act(async () => { await output.share(); });
  expect(onUnavailable).toHaveBeenCalledTimes(1);
  expect(send).not.toHaveBeenCalled();
  expect(onShared).not.toHaveBeenCalled();
  expect(output.sharing).toBe(false);
});

it.each(['file', 'availability', 'send'])('%s 단계 오류도 처리하고 결과물을 유지하며 다시 시도할 수 있다', async (stage) => {
  const target = stage === 'file' ? fileCheck : stage === 'availability' ? jest.mocked(Linking.canOpenURL) : send;
  target.mockRejectedValueOnce(new Error('native failed'));
  await act(async () => { await expect(output.share()).resolves.toBeUndefined(); });
  expect(Alert.alert).toHaveBeenCalledWith('인스타그램으로 보내지 못했어요', expect.stringContaining('다시 공유'));
  expect(onShared).not.toHaveBeenCalled();
  expect(output.sharing).toBe(false);
  await act(async () => { await output.share(); });
  expect(onShared).toHaveBeenCalledTimes(1);
});

it.each(['file', 'availability'])('%s 확인 중 화면을 떠나면 늦은 완료가 인스타를 열지 않는다', async (stage) => {
  const job = deferred<unknown>();
  (stage === 'file' ? fileCheck : jest.mocked(Linking.canOpenURL)).mockReturnValue(job.promise as never);
  let done!: Promise<void>;
  await act(async () => { done = output.share(); });
  await focus(false);
  await act(async () => { job.resolve(stage === 'file' ? { exists: true } : true); await done; });
  expect(send).not.toHaveBeenCalled();
  expect(onShared).not.toHaveBeenCalled();
  expect(onUnavailable).not.toHaveBeenCalled();
});

it.each(['success', 'failure'])('숨은 화면의 공유 %s은 이동·안내를 실행하지 않는다', async (outcome) => {
  const job = deferred<void>();
  send.mockReturnValue(job.promise);
  let done!: Promise<void>;
  await act(async () => { done = output.share(); });
  await focus(false);
  await act(async () => {
    if (outcome === 'success') job.resolve(); else job.reject(new Error('late failed'));
    await done;
  });
  expect(onShared).not.toHaveBeenCalled();
  expect(Alert.alert).not.toHaveBeenCalled();
});

it('떠났다가 돌아와도 이전 요청은 무시하고 새 공유를 진행한다', async () => {
  const job = deferred<void>();
  send.mockReturnValueOnce(job.promise);
  let done!: Promise<void>;
  await act(async () => { done = output.share(); });
  await focus(false); await focus(true);
  await act(async () => { job.resolve(); await done; });
  expect(onShared).not.toHaveBeenCalled();
  await act(async () => { await output.share(); });
  expect(onShared).toHaveBeenCalledTimes(1);
});

it.each(['success', 'failure'])('언마운트 후 공유 %s은 상태·이동·안내를 갱신하지 않는다', async (outcome) => {
  const job = deferred<void>();
  send.mockReturnValue(job.promise);
  let done!: Promise<void>;
  await act(async () => { done = output.share(); });
  await act(async () => { renderer.unmount(); mounted = false; });
  await act(async () => {
    if (outcome === 'success') job.resolve(); else job.reject(new Error('late failed'));
    await done;
  });
  expect(onShared).not.toHaveBeenCalled();
  expect(Alert.alert).not.toHaveBeenCalled();
});
