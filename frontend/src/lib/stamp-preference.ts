import AsyncStorage from '@react-native-async-storage/async-storage';

import type { StampLayout } from '@/components/route-preview';

// FRD: result-editing §7 각인과 문구. 기존 초안/결과물과 분리된 기기 내 선택 이력.
const STORAGE_KEY = 'mechuri.stamp-layout.v1';
export const FIRST_STAMP_LAYOUT: StampLayout = 'corner';
const VALID_LAYOUTS: readonly StampLayout[] = ['corner', 'glass', 'rail', 'stack', 'bar', 'line', 'row'];
let selectedLayout: StampLayout | undefined;
let pendingRead: Promise<StampLayout> | undefined;
let pendingWrite: Promise<void> = Promise.resolve();

export function getPreferredStampLayout(): Promise<StampLayout> {
  if (selectedLayout !== undefined) return Promise.resolve(selectedLayout);
  pendingRead ??= AsyncStorage.getItem(STORAGE_KEY)
    .then((stored) => {
      // 저장소를 읽는 동안 사용자가 새로 선택했다면 그 선택이 우선이다.
      selectedLayout ??= VALID_LAYOUTS.includes(stored as StampLayout)
        ? stored as StampLayout : FIRST_STAMP_LAYOUT;
      return selectedLayout;
    })
    .catch((error) => {
      console.warn('Could not load stamp preference', error);
      selectedLayout ??= FIRST_STAMP_LAYOUT;
      return selectedLayout;
    });
  return pendingRead;
}

/** 프리셋을 직접 누른 순간에만 호출한다. 불러오기·위치 조정은 선택 이력이 아니다. */
export function rememberStampLayout(layout: StampLayout): void {
  selectedLayout = layout;
  pendingWrite = pendingWrite
    .then(() => AsyncStorage.setItem(STORAGE_KEY, layout))
    .catch((error) => console.warn('Could not save stamp preference', error));
}
