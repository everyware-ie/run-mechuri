import AsyncStorage from '@react-native-async-storage/async-storage';

import { IDENTITY_SMOOTH, type RoutePreset, type RouteTransform } from '@/components/route-preview';
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
  /** 배경은 참조가 약하다(§2-3) — 파일이 사라지면 화면에서 기본 이미지로 되돌린다 */
  backgroundImagePath: string;
  outputPath: string;
  createdAt: string;
};

const STORAGE_KEY = 'mechuri.results.v2';

export async function listResults(): Promise<SavedResult[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  const results: SavedResult[] = JSON.parse(raw);
  const withDefaults = results.map((r) => ({ ...r, smoothOptions: r.smoothOptions ?? IDENTITY_SMOOTH }));
  // §2-1: 정렬은 최신순, 러닝한 날 기준
  return withDefaults.sort((a, b) => (a.runDate < b.runDate ? 1 : -1));
}

export async function addResult(result: SavedResult): Promise<void> {
  const existing = await listResults();
  const updated = [result, ...existing];
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}

export async function deleteResult(id: string): Promise<void> {
  const existing = await listResults();
  const updated = existing.filter((r) => r.id !== id);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}

export async function getResult(id: string): Promise<SavedResult | null> {
  const existing = await listResults();
  return existing.find((r) => r.id === id) ?? null;
}
