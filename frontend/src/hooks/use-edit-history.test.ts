import { act, createElement, useEffect } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';

import { useEditHistory } from './use-edit-history';
import type { EditSnapshot } from '@/lib/edit-history';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const initial: EditSnapshot = {
  backgroundImagePath: 'bg.jpg', preset: 'default-drawing',
  transform: { x: 0, y: 0, scale: 1, rotationDeg: 0 }, smoothOptions: { smooth: 0, corner: 0 },
  stampConfig: { mode: 'always', layout: 'corner',
    enabled: { distance: true, time: true, pace: true, date: true, heartRate: true, place: true },
    caption: '', captions: [], placeName: '', position: { x: 0, y: 0 }, scale: 1 },
};

let output: ReturnType<typeof useEditHistory>;
function Harness({ snapshot }: { snapshot: EditSnapshot }) {
  const value = useEditHistory(snapshot);
  useEffect(() => { output = value; }, [value]);
  return null;
}
let renderer: ReactTestRenderer;
const renderSnapshot = async (snapshot: EditSnapshot) => {
  await act(async () => { renderer.update(createElement(Harness, { snapshot })); });
};
beforeEach(async () => {
  await act(async () => { renderer = create(createElement(Harness, { snapshot: initial })); });
});
afterEach(async () => { await act(async () => renderer.unmount()); });

it('같은 값의 조작을 사이에 넣어도 한 번의 되돌리기로 이전 편집에 도달한다', async () => {
  const moved = { ...initial, transform: { ...initial.transform, x: 120 } };
  await renderSnapshot(moved);
  await renderSnapshot({ ...moved, transform: { ...moved.transform }, stampConfig: { ...moved.stampConfig } });
  expect(output.history).toEqual([initial]);
  const previous = output.history[0];
  await act(async () => {
    output.skipNextChange();
    output.popHistory();
    renderer.update(createElement(Harness, { snapshot: previous }));
  });
  expect(output.history).toEqual([]);
});

it('장소가 자동으로 채워져도 기존 되돌리기 단계는 그대로이고 그 뒤 편집은 채워진 상태를 기록한다', async () => {
  const withPlace = { ...initial, stampConfig: { ...initial.stampConfig, placeName: '한강' } };
  await renderSnapshot(withPlace);
  expect(output.history).toEqual([]);
  await renderSnapshot({ ...withPlace, preset: 'light-runner' });
  expect(output.history).toEqual([withPlace]);
});

it('장소 자동 채우기와 사용자 이동이 한 렌더에 반영되어도 이동 이력이 남는다', async () => {
  await renderSnapshot({ ...initial, transform: { ...initial.transform, y: -90 },
    stampConfig: { ...initial.stampConfig, placeName: '한강' } });
  expect(output.history).toEqual([initial]);
});

it('초기 문구 전환을 생략한 뒤 문구 추가·삭제와 배경 변경을 순서대로 기록한다', async () => {
  const migrated = { ...initial, stampConfig: { ...initial.stampConfig,
    captions: [{ id: 'a', text: '옛 문구', scale: 1, offset: { x: 0, y: 0 } }] } };
  await act(async () => {
    output.skipNextChange();
    renderer.update(createElement(Harness, { snapshot: migrated }));
  });
  expect(output.history).toEqual([]);
  const withBackground = { ...migrated, backgroundImagePath: 'new-bg.jpg' };
  await renderSnapshot(withBackground);
  const deleted = { ...withBackground, stampConfig: { ...withBackground.stampConfig, captions: [] } };
  await renderSnapshot(deleted);
  expect(output.history).toEqual([migrated, withBackground]);
});
