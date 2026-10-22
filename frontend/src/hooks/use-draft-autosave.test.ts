import { act, createElement, useEffect } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { saveDraft, type Draft } from '@/lib/draft-store';
import { useDraftAutosave } from './use-draft-autosave';

jest.mock('@/lib/draft-store', () => ({ saveDraft: jest.fn() }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// 자동 저장의 활성 화면 판정을 검사한다. 저장 형식은 draft-store.test.ts가 별도로 검사한다.
const draft = { backgroundImagePath: 'bg.jpg' } as Omit<Draft, 'lastEditedAt'>;
let persist: ReturnType<typeof useDraftAutosave>;
function Harness({ focused, value }: { focused: boolean; value: typeof draft | null }) {
  const save = useDraftAutosave(value, focused);
  useEffect(() => { persist = save; }, [save]);
  return null;
}
let renderer: ReactTestRenderer;
beforeEach(() => { jest.mocked(saveDraft).mockReset().mockResolvedValue(undefined); });
afterEach(async () => { if (renderer) await act(async () => renderer.unmount()); });

it('보이는 편집 화면의 변경은 저장한다', async () => {
  await act(async () => { renderer = create(createElement(Harness, { focused: true, value: draft })); });
  expect(saveDraft).toHaveBeenCalledWith(draft);
});

it('공유 화면 뒤에 남은 편집값 갱신은 완료 후 지운 초안을 다시 저장하지 않는다', async () => {
  await act(async () => { renderer = create(createElement(Harness, { focused: true, value: draft })); });
  jest.mocked(saveDraft).mockClear();
  await act(async () => { renderer.update(createElement(Harness, { focused: false, value: draft })); });
  await act(async () => { renderer.update(createElement(Harness, { focused: false, value: { ...draft, backgroundImagePath: 'late.jpg' } })); });
  expect(saveDraft).not.toHaveBeenCalled();
});

it('생성을 취소하고 돌아오면 유지한 초안을 다시 저장한다', async () => {
  await act(async () => { renderer = create(createElement(Harness, { focused: false, value: draft })); });
  jest.mocked(saveDraft).mockClear();
  await act(async () => { renderer.update(createElement(Harness, { focused: true, value: draft })); });
  expect(saveDraft).toHaveBeenCalledWith(draft);
});

it('재료가 없는 화면은 저장하지 않고 저장 실패는 처리한다', async () => {
  const error = new Error('storage failed');
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    await act(async () => { renderer = create(createElement(Harness, { focused: true, value: null })); });
    expect(saveDraft).not.toHaveBeenCalled();
    jest.mocked(saveDraft).mockRejectedValueOnce(error);
    await act(async () => { renderer.update(createElement(Harness, { focused: true, value: draft })); });
    expect(warn).toHaveBeenCalledWith('Draft save failed', error);
  } finally { warn.mockRestore(); }
});

it('포커스를 잃기 직전 명시적 저장은 아직 React에 반영되지 않은 마지막 값을 남긴다', async () => {
  await act(async () => { renderer = create(createElement(Harness, { focused: true, value: draft })); });
  jest.mocked(saveDraft).mockClear();
  const latest = { ...draft, backgroundImagePath: 'last.jpg' };
  await act(async () => {
    persist(latest);
    renderer.update(createElement(Harness, { focused: false, value: draft }));
  });
  expect(jest.mocked(saveDraft).mock.calls).toEqual([[latest]]);
});
