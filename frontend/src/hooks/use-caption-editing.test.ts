import { act, createElement, useEffect, useMemo, useState } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import type { StampConfig } from '@/components/route-preview';
import { saveDraft, type Draft } from '@/lib/draft-store';
import { useCaptionEditing } from './use-caption-editing';
import { useDraftAutosave } from './use-draft-autosave';
import { useEditHistory } from './use-edit-history';
import type { EditSnapshot } from '@/lib/edit-history';

jest.mock('@/lib/draft-store', () => ({ saveDraft: jest.fn() }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const base: StampConfig = {
  mode: 'always', layout: 'corner', scale: 1, position: { x: 0, y: 0 }, caption: '', placeName: '한강',
  enabled: { distance: true, time: true, pace: true, heartRate: true, date: true, place: true },
  captions: [
    { id: 'first', text: '첫 문구', scale: 0.6, offset: { x: 120, y: -80 } },
    { id: 'second', text: '두 번째', scale: 1, offset: { x: -60, y: 90 } },
  ],
};
let api: ReturnType<typeof useCaptionEditing>;
let renderer: ReactTestRenderer;
const commit = jest.fn();
function Harness({ config = base, focused = true }: { config?: StampConfig; focused?: boolean }) {
  const editing = useCaptionEditing(config, commit);
  useEffect(() => { api = editing; });
  useDraftAutosave({ stampConfig: editing.stampForSave } as Omit<Draft, 'lastEditedAt'>, focused);
  return null;
}
const lastSaved = () => jest.mocked(saveDraft).mock.calls.at(-1)![0].stampConfig;
beforeEach(async () => {
  commit.mockReset();
  jest.mocked(saveDraft).mockReset().mockResolvedValue(undefined);
  await act(async () => { renderer = create(createElement(Harness)); });
});
afterEach(async () => { await act(async () => renderer.unmount()); });

it('완료 전 새 문구와 크기를 초안에 저장하되 확정값과 기록은 바꾸지 않는다', async () => {
  await act(async () => api.startNew());
  await act(async () => { api.changeText('한강 첫 달리기\n기분 좋은 아침'); api.changeScale(1.4); });
  expect(lastSaved().captions).toHaveLength(3);
  expect(lastSaved().captions!.at(-1)).toMatchObject({ text: '한강 첫 달리기\n기분 좋은 아침', scale: 1.4, offset: { x: 0, y: 0 } });
  expect(commit).not.toHaveBeenCalled();
  expect(base.captions).toHaveLength(2);
});

it('기존 문구를 쓰는 동안 위치와 다른 문구, 늦게 채워진 장소를 보존한다', async () => {
  await act(async () => api.startEdit('first'));
  await act(async () => { api.changeText('고친 문구'); api.changeScale(0.8); });
  await act(async () => renderer.update(createElement(Harness, { config: { ...base, placeName: '새 장소' } })));
  expect(lastSaved().captions![0]).toEqual({ ...base.captions![0], text: '고친 문구', scale: 0.8 });
  expect(lastSaved().captions![1]).toEqual(base.captions![1]);
  expect(lastSaved().placeName).toBe('새 장소');
});

it('입력 도중 모두 지운 문구는 저장에서 빠지고 새 빈 문구도 추가하지 않는다', async () => {
  await act(async () => api.startEdit('first'));
  await act(async () => api.changeText('   '));
  expect(lastSaved().captions).toEqual([base.captions![1]]);
  await act(async () => api.finish());
  await act(async () => api.startNew());
  expect(api.stampForSave).toBe(base);
});

it('마지막 입력·크기 변경과 완료가 같은 갱신에 묶여도 최신값으로 한 번 확정한다', async () => {
  await act(async () => api.startNew());
  await act(async () => { api.changeText('마지막 입력'); api.changeScale(1.2); api.finish(); api.finish(); });
  expect(commit).toHaveBeenCalledTimes(1);
  expect(commit.mock.calls[0][0].captions.at(-1)).toMatchObject({ text: '마지막 입력', scale: 1.2 });
  expect(api.editing).toBeNull();
});

it('3줄 입력 제한은 유지하고 완료는 한 단계로 묶는다', async () => {
  await act(async () => api.startNew());
  await act(async () => api.changeText('하나\n둘\n셋\n넷'));
  expect(api.editing).toMatchObject({ text: '하나\n둘\n셋', limited: true });
  await act(async () => api.changeText('하나\n둘'));
  expect(api.editing!.limited).toBe(false);
  expect(commit).not.toHaveBeenCalled();
  await act(async () => api.finish());
  expect(commit).toHaveBeenCalledTimes(1);
});

it('크기를 키워 줄 수가 늘어도 원문을 잘라내지 않는다', async () => {
  await act(async () => api.startNew());
  const text = '한강에서 달리는 아침 오늘도 기분 좋게 달렸습니다';
  await act(async () => api.changeText(text));
  await act(async () => api.changeScale(3));
  expect(api.editing!.text).toBe(text);
  expect(lastSaved().captions!.at(-1)!.text).toBe(text);
});

it('포커스를 잃은 편집 화면은 문구 입력 변경으로 초안을 다시 저장하지 않는다', async () => {
  await act(async () => api.startNew());
  await act(async () => renderer.update(createElement(Harness, { focused: false })));
  jest.mocked(saveDraft).mockClear();
  await act(async () => api.changeText('가려진 화면'));
  expect(saveDraft).not.toHaveBeenCalled();
});

it('여러 입력을 저장한 뒤 완료하면 실제 되돌리기 기록은 한 단계이고 이전 문구를 복구한다', async () => {
  let historyApi: ReturnType<typeof useEditHistory>;
  let restore: (snapshot: EditSnapshot) => void;
  function HistoryHarness() {
    const [config, setConfig] = useState(base);
    const editing = useCaptionEditing(config, setConfig);
    const snapshot = useMemo(() => ({ stampConfig: config } as EditSnapshot), [config]);
    const history = useEditHistory(snapshot);
    useDraftAutosave({ stampConfig: editing.stampForSave } as Omit<Draft, 'lastEditedAt'>, true);
    useEffect(() => {
      api = editing;
      historyApi = history;
      restore = previous => {
        history.skipNextChange();
        history.popHistory();
        setConfig(previous.stampConfig);
      };
    });
    return null;
  }
  await act(async () => { renderer.update(createElement(HistoryHarness)); });
  await act(async () => api.startEdit('first'));
  await act(async () => api.changeText('변경 중'));
  await act(async () => { api.changeText('변경 완료'); api.changeScale(1.2); });
  expect(lastSaved().captions![0].text).toBe('변경 완료');
  expect(historyApi!.history).toHaveLength(0);
  await act(async () => { api.finish(); api.finish(); });
  expect(historyApi!.history).toHaveLength(1);
  await act(async () => restore(historyApi!.history[0]));
  expect(lastSaved().captions).toEqual(base.captions);
  expect(historyApi!.history).toHaveLength(0);
});
