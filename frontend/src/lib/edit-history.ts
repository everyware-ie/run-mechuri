import { normalizeHandDrawing, type HandStroke } from '@/lib/hand-drawing';
import { normalizeRouteStyle, type RouteStyle } from '@/lib/editor-style';
import type { RoutePreset, RouteTransform, StampConfig } from '@/components/route-preview';
import type { PhotoBackground } from './background-storage';
import type { SmoothOptions } from './route-smoothing';

// result-editing FRD §4-3 되돌리기와 초기화. 되돌리기(↶)는 편집 전체를 한 단계씩 뒤로
// 돌린다. 편집 화면은 값이 확정될 때(손을 뗄 때)만 초안을 바꾸므로, 초안이 바뀔 때마다
// 바뀌기 전 모습을 한 단계로 쌓는다.

export type EditSnapshot = {
  backgroundImagePath: string | null;
  backgroundPhoto?: PhotoBackground;
  preset: RoutePreset;
  transform: RouteTransform;
  routeStyle?: RouteStyle;
  handDrawing?: HandStroke[];
  smoothOptions: SmoothOptions;
  stampConfig: StampConfig;
};

/** 기록을 무한히 쌓지 않는다. 오래된 단계부터 버린다. */
export const MAX_HISTORY = 60;

/** 쌓을 때. 가득 차면 가장 오래된 단계를 버린다. */
export function pushHistory(history: EditSnapshot[], snapshot: EditSnapshot): EditSnapshot[] {
  const next = [...history, snapshot];
  return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next;
}

// 초안에는 JSON으로 저장하는 값만 있다. 객체를 새로 만들거나 키 순서가 달라도 같은 편집값이다.
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length
      && a.every((value, index) => sameValue(value, b[index]));
  }
  const left = a as Record<string, unknown>, right = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...keys].every(key => sameValue(left[key], right[key]));
}

// 옛 저장분에서 빠져 있을 수 있는 기본값도 같은 편집값으로 본다.
const editableValues = (snapshot: EditSnapshot) => ({
  ...snapshot,
  routeStyle: normalizeRouteStyle(snapshot.routeStyle),
  handDrawing: normalizeHandDrawing(snapshot.handDrawing),
  stampConfig: { ...snapshot.stampConfig, placeName: undefined, font: snapshot.stampConfig.font === 'preset' ? undefined : snapshot.stampConfig.font,
    scale: snapshot.stampConfig.scale ?? 1, hidden: snapshot.stampConfig.hidden ?? false,
    layout: snapshot.stampConfig.layout ?? 'row' },
});

/** 값이 달라진 사용자 편집인지. 자동으로 채운 장소 이름만 바뀐 것은 단계로 쌓지 않는다. */
export function hasEditChanges(previous: EditSnapshot, current: EditSnapshot): boolean {
  return !sameValue(editableValues(previous), editableValues(current));
}
