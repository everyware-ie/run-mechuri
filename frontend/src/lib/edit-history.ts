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
  smoothOptions: SmoothOptions;
  stampConfig: StampConfig;
};

/** 기록을 무한히 쌓지 않는다. 오래된 단계부터 버린다. */
export const MAX_HISTORY = 60;

/** 문구만 바뀌었는지. 글자를 칠 때마다 한 단계씩 쌓이지 않게 한 번의 입력으로 묶는 데 쓴다. */
export function isCaptionOnlyChange(previous: EditSnapshot, next: EditSnapshot) {
  if (previous.backgroundImagePath !== next.backgroundImagePath
    || previous.backgroundPhoto !== next.backgroundPhoto
    || previous.preset !== next.preset
    || previous.transform !== next.transform
    || previous.smoothOptions !== next.smoothOptions) return false;
  const { caption: a, ...restA } = previous.stampConfig;
  const { caption: b, ...restB } = next.stampConfig;
  return a !== b && JSON.stringify(restA) === JSON.stringify(restB);
}

/** 쌓을 때. 가득 차면 가장 오래된 단계를 버린다. */
export function pushHistory(history: EditSnapshot[], snapshot: EditSnapshot): EditSnapshot[] {
  const next = [...history, snapshot];
  return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next;
}
