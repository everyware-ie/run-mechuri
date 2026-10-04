// result-editing FRD §4-1 손댄 것을 만진다. 편집 화면에서 손가락을 댄 곳에 따라 무엇을 움직이고,
// 탭하면 무엇을 하고, 아래 동그라미에 놓으면 무엇이 되는지 정한다. 화면 좌표 계산은 edit.tsx가
// 하고 규칙만 여기 둔다. 조작 규칙을 바꿀 때 서로 어긋나지 않게 테스트로 묶어 둔다
// (edit-gesture.test.ts).
//
// 2026-10-04 실기기 확인에서 나온 것들:
// - "러닝 데이터를 선택했는데 경로가 움직인다": 글자를 직접 짚지 않은 끌기는 선택된 대상을 움직인다.
// - 문구는 인스타처럼 화면에 바로 쓰고 여러 개다. 탭하면 그 문구를 고쳐 쓰고, 아래 휴지통에 놓으면
//   지운다. 러닝 데이터는 같은 자리에 놓으면 숨긴다.
// - "아무것도 선택되지 않은 상태에서 경로의 선택 범위가 너무 크다": 아무것도 선택하지 않았으면 경로
//   그림 영역(점선 상자) 안에서 끌 때만 경로 그림이 움직인다. 빈 곳을 끌면 아무것도 움직이지 않는다.

export type EditTarget = { kind: 'ink'; id: string } | { kind: 'route' } | { kind: 'stamp' } | { kind: 'caption'; id: string };
/** 손가락이 닿은 글자. 글자가 아닌 곳이면 null. */
export type TextHit = { kind: 'ink'; id: string } | { kind: 'stamp' } | { kind: 'caption'; id: string } | null;
/** 시트로 고르는 대상. 문구는 시트 없이 화면에서 바로 고쳐 쓴다. */
export type SheetTarget = 'route' | 'stamp';

/** 지금 선택된 대상. 열려 있는 시트의 대상이다. 배경 시트나 닫힌 상태면 null. */
export function selectedTarget(tool: string | null): SheetTarget | null {
  return tool === 'route' || tool === 'stamp' ? tool : null;
}

/**
 * 끌기·핀치가 움직일 대상. 글자를 직접 짚으면 그 글자, 아니면 선택된 대상, 선택된 것이 없으면 경로
 * 그림 영역 안일 때만 경로 그림. 아무것도 아니면 null이다.
 */
export function dragTargetFor(hit: TextHit, selected: SheetTarget | { kind: 'ink'; id: string } | null, onRoute: boolean): EditTarget | null {
  if (hit) return hit;
  if (typeof selected === 'object' && selected) return selected;
  if (selected) return { kind: selected };
  return onRoute ? { kind: 'route' } : null;
}

export type TapAction =
  | { kind: 'open'; tool: SheetTarget }
  | { kind: 'editCaption'; id: string }
  | { kind: 'editInk'; id: string }
  | { kind: 'close' }
  | { kind: 'none' };

/** 탭. 문구면 그 자리에서 고쳐 쓰고, 러닝 데이터·경로 그림 영역이면 그 시트를 연다. 빈 곳이면 열린 시트를 닫는다. */
export function tapActionFor(hit: TextHit, onRoute: boolean, toolOpen: boolean): TapAction {
  if (hit?.kind === 'ink') return { kind: 'editInk', id: hit.id };
  if (hit?.kind === 'caption') return { kind: 'editCaption', id: hit.id };
  if (hit?.kind === 'stamp') return { kind: 'open', tool: 'stamp' };
  if (onRoute) return { kind: 'open', tool: 'route' };
  return toolOpen ? { kind: 'close' } : { kind: 'none' };
}

/** 끄는 동안 아래에 나오는 동그라미의 역할. 러닝 데이터는 숨기고 문구는 지운다. 경로 그림은 없다. */
export function dropZoneFor(target: EditTarget): 'hide' | 'delete' | null {
  if (target.kind === 'stamp') return 'hide';
  if (target.kind === 'caption' || target.kind === 'ink') return 'delete';
  return null;
}
