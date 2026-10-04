import { act, createElement, useLayoutEffect } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { CreationFlowProvider, useCreationFlow } from './creation-flow';

jest.mock('@/components/route-preview', () => ({
  IDENTITY_TRANSFORM: { x: 0, y: 0, scale: 1, rotationDeg: 0 },
  IDENTITY_SMOOTH: { smooth: 0, corner: 0 },
  IDENTITY_STAMP: { layout: 'row', mode: 'always', position: { x: 0, y: 0 }, caption: '', captions: [] },
}));
jest.mock('@/lib/stamp-preference', () => ({ FIRST_STAMP_LAYOUT: 'corner', getPreferredStampLayout: async () => 'corner' }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let current: ReturnType<typeof useCreationFlow>;
let renderer: ReactTestRenderer;
function Probe() {
  const value = useCreationFlow();
  useLayoutEffect(() => { current = value; });
  return null;
}
beforeEach(async () => {
  await act(async () => { renderer = create(createElement(CreationFlowProvider, null, createElement(Probe))); });
});
afterEach(async () => { await act(async () => renderer.unmount()); });

it('경로·러닝 데이터 프리셋 교체와 위치 초기화가 선택한 스타일을 지우지 않는다', async () => {
  await act(async () => {
    current.setRouteStyle({ color: 'pink', widthScale: 1.4 });
    current.setStampConfig({ ...current.draft.stampConfig, font: 'pretendard', textColor: 'black' });
  });
  await act(async () => {
    current.setPreset('segment-lighting');
    current.setStampConfig({ ...current.draft.stampConfig, layout: 'glass' });
    current.resetTransform();
  });
  expect(current.draft.routeStyle).toEqual({ color: 'pink', widthScale: 1.4 });
  expect(current.draft.stampConfig.font).toBe('pretendard');
  expect(current.draft.stampConfig.textColor).toBe('black');
});

it('옛 초안·결과물에 들어갈 때 직전 작업의 스타일을 가져오지 않는다', async () => {
  await act(async () => current.setRouteStyle({ color: 'pink', widthScale: 1.4 }));
  await act(async () => current.loadDraft({ preset: 'default-drawing' }));
  expect(current.draft.routeStyle).toBeUndefined();
});
