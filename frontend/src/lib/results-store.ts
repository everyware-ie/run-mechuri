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

// FRD: docs/specs/frd/home-and-library.md §2
//
// §2-3: 트랙 좌표·배경 참조·편집값을 전부 앱이 들고 있는다 — 원본 HealthKit 기록이
// 지워져도 "다시 편집"·"같은 기록으로 새로 만들기"가 되게 하려면 이게 다 있어야 한다.

export type SavedResult = {
  id: string;
  /** §2-2 "같은 기록으로 새로 만들기"용. HealthKit 워크아웃 id. */
  run: RunRecord;
  /** 러닝을 한 날 (§2-1: 만든 날이 아니다) — run.date와 같지만 정렬용으로 따로 둔다 */
  runDate: string;
  distanceMeters: number;
  track: Track;
  preset: RoutePreset;
  transform: RouteTransform;
  /** result-editing FRD §5. v2 저장분엔 없을 수 있어 listResults에서 기본값을 채운다. */
  smoothOptions: SmoothOptions;
  /** result-editing FRD §7. 마찬가지로 없을 수 있어 기본값을 채운다. */
  stampConfig: StampConfig;
  /** 배경은 참조가 약하다(§2-3) — 파일이 사라지면 화면에서 기본 이미지로 되돌린다 */
  backgroundImagePath: string;
  backgroundPhoto?: PhotoBackground;
  outputPath: string;
  createdAt: string;
};

const STORAGE_KEY = 'mechuri.results.v2';

// 목록 읽기부터 쓰기 완료까지 순서를 보장해 서로의 변경을 덮어쓰지 않게 한다.
let storageTail: Promise<void> = Promise.resolve();
function inStorageOrder<T>(operation: () => Promise<T>): Promise<T> {
  const result = storageTail.then(operation);
  storageTail = result.then(() => undefined, () => undefined);
  return result;
}

// 대기열 내부에서 부르는 읽기. 공개 listResults를 다시 호출하면 자기 완료를 기다리게 된다.
async function readResults(): Promise<SavedResult[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  const results: SavedResult[] = JSON.parse(raw);
  const withDefaults = results.map((r) => ({
    ...r,
    backgroundImagePath: resolveBackgroundPath(r.backgroundImagePath),
    backgroundPhoto: resolvePhotoBackground(r.backgroundPhoto),
    smoothOptions: r.smoothOptions ?? IDENTITY_SMOOTH,
    stampConfig: r.stampConfig ?? IDENTITY_STAMP,
  }));
  // §2-1: 정렬은 최신순, 러닝한 날 기준. 같은 기록으로 여러 결과물을 만들면(§2-2
  // "같은 기록으로 새로 만들기") runDate가 완전히 같아지는데, 그 동률은 FRD가
  // 정해두지 않은 부분이라 만든 시각(createdAt)이 최근인 것을 위로 둔다 — "러닝한
  // 날 기준 최신순"이라는 1차 기준 자체는 그대로다.
  return withDefaults.sort((a, b) => {
    if (a.runDate !== b.runDate) return a.runDate < b.runDate ? 1 : -1;
    return a.createdAt < b.createdAt ? 1 : -1;
  });
}

export async function listResults(): Promise<SavedResult[]> {
  return inStorageOrder(readResults);
}

export async function addResult(result: SavedResult): Promise<void> {
  // 대기 중 호출자가 객체를 변경해도 요청한 시점의 편집값을 보관한다.
  const serialized = JSON.stringify(result);
  await inStorageOrder(async () => {
    const existing = await readResults();
    const updated = [JSON.parse(serialized) as SavedResult, ...existing];
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  });
}

export async function deleteResult(id: string): Promise<void> {
  await inStorageOrder(async () => {
    const existing = await readResults();
    const updated = existing.filter((r) => r.id !== id);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  });
}

export async function getResult(id: string): Promise<SavedResult | null> {
  const existing = await listResults();
  return existing.find((r) => r.id === id) ?? null;
}
