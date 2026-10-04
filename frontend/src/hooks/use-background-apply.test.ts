import { act, createElement, useEffect } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import type { DefaultBackground } from '@/constants/default-backgrounds';
import { useBackgroundApply } from './use-background-apply';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const background = { id: 'evening', label: '저녁', source: 1 } as DefaultBackground;
const other = { ...background, id: 'noon' } as DefaultBackground;
function deferred() {
  let resolve!: (value: string) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<string>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const prepare = jest.fn<Promise<string>, [DefaultBackground]>();
const onApply = jest.fn();
const onError = jest.fn();
let output: ReturnType<typeof useBackgroundApply>;
function Harness() {
  const value = useBackgroundApply({ prepare, onApply, onError });
  useEffect(() => { output = value; }, [value]);
  return null;
}
let renderer: ReactTestRenderer;
let mounted: boolean;
beforeEach(async () => {
  jest.clearAllMocks();
  prepare.mockReset();
  await act(async () => { renderer = create(createElement(Harness)); });
  mounted = true;
});
afterEach(async () => { if (mounted) await act(async () => renderer.unmount()); });

it('React 갱신 전 연속 탭과 완료 판정에서도 작업 중임을 즉시 인식한다', async () => {
  const job = deferred();
  prepare.mockReturnValue(job.promise);
  let done!: Promise<void>;
  await act(async () => {
    done = output.apply(background);
    expect(output.isPending()).toBe(true);
    void output.apply(other);
  });
  expect(prepare).toHaveBeenCalledTimes(1);
  expect(output.pendingId).toBe(background.id);
  await act(async () => { job.resolve('evening.jpg'); await done; });
  expect(onApply).toHaveBeenCalledWith('evening.jpg');
  expect(output.isPending()).toBe(false);
  expect(output.pendingId).toBeNull();
});

it('갤러리 이동·나가기·되돌리기로 취소된 배경은 늦게 끝나도 반영하지 않는다', async () => {
  const job = deferred();
  prepare.mockReturnValue(job.promise);
  let done!: Promise<void>;
  await act(async () => { done = output.apply(background); });
  await act(async () => { output.cancel(); });
  await act(async () => { job.resolve('old.jpg'); await done; });
  expect(onApply).not.toHaveBeenCalled();
  expect(output.pendingId).toBeNull();
});

it('취소된 작업이 실패해도 떠난 화면의 오류 안내를 띄우지 않는다', async () => {
  const job = deferred();
  prepare.mockReturnValue(job.promise);
  let done!: Promise<void>;
  await act(async () => { done = output.apply(background); output.cancel(); });
  await act(async () => { job.reject(new Error('old failed')); await done; });
  expect(onError).not.toHaveBeenCalled();
});

it.each(['성공', '실패'])('취소한 작업의 늦은 %s이 새 작업의 대기 상태와 선택을 덮지 않는다', async (result) => {
  const oldJob = deferred(), newJob = deferred();
  prepare.mockReturnValueOnce(oldJob.promise).mockReturnValueOnce(newJob.promise);
  let oldDone!: Promise<void>, newDone!: Promise<void>;
  await act(async () => { oldDone = output.apply(background); });
  await act(async () => { output.cancel(); newDone = output.apply(other); });
  await act(async () => {
    if (result === '성공') oldJob.resolve('old.jpg'); else oldJob.reject(new Error('old failed'));
    await oldDone;
  });
  expect(output.pendingId).toBe(other.id);
  expect(output.isPending()).toBe(true);
  expect(onApply).not.toHaveBeenCalled();
  expect(onError).not.toHaveBeenCalled();
  await act(async () => { newJob.resolve('new.jpg'); await newDone; });
  expect(onApply.mock.calls).toEqual([['new.jpg']]);
  expect(output.pendingId).toBeNull();
});

it('현재 작업 실패는 한 번 알리고 배경을 유지하며 재시도할 수 있다', async () => {
  prepare.mockRejectedValueOnce(new Error('copy failed')).mockResolvedValueOnce('retry.jpg');
  await act(async () => { await output.apply(background); });
  expect(onError).toHaveBeenCalledTimes(1);
  expect(onApply).not.toHaveBeenCalled();
  expect(output.pendingId).toBeNull();
  await act(async () => { await output.apply(background); });
  expect(onApply).toHaveBeenCalledWith('retry.jpg');
});

it.each(['성공', '실패'])('편집 화면이 사라진 뒤 늦은 %s은 상태나 안내를 바꾸지 않는다', async (result) => {
  const job = deferred();
  prepare.mockReturnValue(job.promise);
  let done!: Promise<void>;
  await act(async () => { done = output.apply(background); });
  await act(async () => { renderer.unmount(); mounted = false; });
  await act(async () => {
    if (result === '성공') job.resolve('late.jpg'); else job.reject(new Error('late failed'));
    await done;
  });
  expect(onApply).not.toHaveBeenCalled();
  expect(onError).not.toHaveBeenCalled();
});
