import AsyncStorage from '@react-native-async-storage/async-storage';

import { IDENTITY_SMOOTH, type RoutePreset, type RouteTransform } from '@/components/route-preview';
import type { SmoothOptions } from '@/lib/route-smoothing';

import type { RunRecord, Track } from '../../modules/health-kit-bridge/src/HealthKitBridge.types';

// FRD: docs/specs/frd/home-and-library.md §3
//
// §3-1: 맨 위에 "이어서 만들기" 하나만. 여러 개면 하나만 올라온다 → 자리가 하나뿐이니
// 배열이 아니라 단일 슬롯으로 둔다. 새로 편집을 시작하면 이전 것을 덮어쓴다.
// §3-2: 나머지 미완성은 노출하지 않는다(데이터를 버리는 게 아니라 "목록에 안 세운다"는
// 뜻이지만, v0는 슬롯이 하나뿐이라 자연히 그렇게 된다).

export type Draft = {
  run: RunRecord;
  track: Track;
  backgroundImagePath: string;
  preset: RoutePreset;
  transform: RouteTransform;
  /** result-editing FRD §5. v1 저장분엔 없을 수 있어 getDraft에서 기본값을 채운다. */
  smoothOptions: SmoothOptions;
  /** §3-1: "마지막으로 편집한 것"이 올라온다. 러닝한 날이 아니라 이 값 기준. */
  lastEditedAt: string;
};

const STORAGE_KEY = 'mechuri.draft.v1';

export async function getDraft(): Promise<Draft | null> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  return { smoothOptions: IDENTITY_SMOOTH, ...parsed };
}

export async function saveDraft(draft: Omit<Draft, 'lastEditedAt'>): Promise<void> {
  const full: Draft = { ...draft, lastEditedAt: new Date().toISOString() };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(full));
}

export async function clearDraft(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
