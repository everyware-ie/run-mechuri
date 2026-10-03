// result-editing FRD §4-1 손댄 것을 만진다. 편집 화면에서 손가락을 댄 곳에 따라 무엇을 움직이고,
// 탭하면 무엇을 하는지 정한다. 화면 좌표 계산은 edit.tsx가 하고, 규칙만 여기 둔다. 조작 규칙을
// 바꿀 때 서로 어긋나지 않게 테스트로 묶어 둔다(edit-gesture.test.ts).
//
// 2026-10-04 실기기 확인: "러닝 데이터를 선택했는데 경로가 움직인다". 탭하면 선택되게 바꾼 뒤에도
// 끌기는 손가락이 닿은 곳만 봤다. 러닝 데이터의 탭 영역은 글자 주변으로 좁아서(2026-09-16) 글자
// 사이를 짚으면 경로가 움직였다. 그래서 글자를 직접 짚지 않은 끌기는 선택된 대상을 움직인다.

export type EditTarget = 'route' | 'stamp' | 'caption';
/** 손가락이 닿은 글자. 글자가 아닌 곳이면 null. */
export type TextHit = 'stamp' | 'caption' | null;

/** 지금 선택된 대상. 열려 있는 시트의 대상이다. 배경 시트나 닫힌 상태면 null. */
export function selectedTarget(tool: string | null): EditTarget | null {
  return tool === 'route' || tool === 'stamp' || tool === 'caption' ? tool : null;
}

/** 끌기·핀치가 움직일 대상. 글자를 직접 짚으면 그 글자, 아니면 선택된 대상, 그것도 없으면 경로 그림. */
export function dragTargetFor(hit: TextHit, selected: EditTarget | null): EditTarget {
  return hit ?? selected ?? 'route';
}

export type TapAction = { kind: 'open'; target: EditTarget } | { kind: 'close' } | { kind: 'none' };

/** 탭. 글자면 그 시트를 열고, 경로 그림 영역이면 경로 시트를 연다. 빈 곳이면 열린 시트를 닫는다. */
export function tapActionFor(hit: TextHit, onRoute: boolean, toolOpen: boolean): TapAction {
  if (hit) return { kind: 'open', target: hit };
  if (onRoute) return { kind: 'open', target: 'route' };
  return toolOpen ? { kind: 'close' } : { kind: 'none' };
}
