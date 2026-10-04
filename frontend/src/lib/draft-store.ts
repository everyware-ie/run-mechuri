import { normalizeRouteStyle, type RouteStyle } from '@/lib/editor-style';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  IDENTITY_SMOOTH,
  IDENTITY_STAMP,
  type RoutePreset,
  type RouteTransform,
  type StampConfig,
} from '@/components/route-preview';
import { resolveBackgroundPath, resolvePhotoBackground, type PhotoBackground } from './background-storage';
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
  backgroundPhoto?: PhotoBackground;
  preset: RoutePreset;
  transform: RouteTransform;
  routeStyle?: RouteStyle;
  /** result-editing FRD §5. v1 저장분엔 없을 수 있어 getDraft에서 기본값을 채운다. */
  smoothOptions: SmoothOptions;
  /** result-editing FRD §7. 마찬가지로 없을 수 있어 기본값을 채운다. */
  stampConfig: StampConfig;
  /** §3-1: "마지막으로 편집한 것"이 올라온다. 러닝한 날이 아니라 이 값 기준. */
  lastEditedAt: string;
};

const STORAGE_KEY = 'mechuri.draft.v1';

// 홈으로 돌아가 읽거나 완성 후 지울 때도 앞서 요청한 저장을 기다린다.
// 저장소의 완료 순서에 의존하지 않으며, 한 작업의 실패는 이후 작업을 막지 않는다.
let storageTail: Promise<void> = Promise.resolve();
function inStorageOrder<T>(operation: () => Promise<T>): Promise<T> {
  const result = storageTail.then(operation);
  storageTail = result.then(() => undefined, () => undefined);
  return result;
}

export async function getDraft(): Promise<Draft | null> {
  return inStorageOrder(async () => {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return { smoothOptions: IDENTITY_SMOOTH, stampConfig: IDENTITY_STAMP, ...parsed,
      routeStyle: normalizeRouteStyle(parsed.routeStyle),
      backgroundImagePath: resolveBackgroundPath(parsed.backgroundImagePath),
      backgroundPhoto: resolvePhotoBackground(parsed.backgroundPhoto),
    };
  });
}

export async function saveDraft(draft: Omit<Draft, 'lastEditedAt'>): Promise<void> {
  const full: Draft = { ...draft, lastEditedAt: new Date().toISOString() };
  // 대기하는 동안 호출자가 객체를 바꿔도 이 저장 요청은 요청 당시의 값이다.
  const serialized = JSON.stringify(full);
  await inStorageOrder(() => AsyncStorage.setItem(STORAGE_KEY, serialized));
}

export async function clearDraft(): Promise<void> {
  await inStorageOrder(() => AsyncStorage.removeItem(STORAGE_KEY));
}
