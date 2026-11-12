import AsyncStorage from '@react-native-async-storage/async-storage';

// FRD: diary §4 뛴 날 표시 선택. 기본은 메추리다.
export type DiaryMarker = 'quail' | 'person';
export const DEFAULT_DIARY_MARKER: DiaryMarker = 'quail';
const STORAGE_KEY = 'runary.diary-marker.v1';

export async function loadDiaryMarker(): Promise<DiaryMarker> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    return stored === 'quail' || stored === 'person' ? stored : DEFAULT_DIARY_MARKER;
  } catch {
    return DEFAULT_DIARY_MARKER;
  }
}

export async function saveDiaryMarker(marker: DiaryMarker): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, marker);
}
