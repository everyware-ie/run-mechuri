import AsyncStorage from '@react-native-async-storage/async-storage';

// FRD: docs/specs/frd/home-and-library.md §2
// v0: 편집을 건너뛰므로 "미완성"(§3) 개념이 없다 — 렌더링이 끝나면 곧 완성된 결과물이다.

export type SavedResult = {
  id: string;
  /** 러닝을 한 날 (§2-1: 만든 날이 아니다) */
  runDate: string;
  distanceMeters: number;
  outputPath: string;
  createdAt: string;
};

const STORAGE_KEY = 'mechuri.results.v1';

export async function listResults(): Promise<SavedResult[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  const results: SavedResult[] = JSON.parse(raw);
  // §2-1: 정렬은 최신순, 러닝한 날 기준
  return results.sort((a, b) => (a.runDate < b.runDate ? 1 : -1));
}

export async function addResult(result: SavedResult): Promise<void> {
  const existing = await listResults();
  const updated = [result, ...existing];
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}
