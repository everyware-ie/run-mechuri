import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadDiaryMarker, saveDiaryMarker } from './diary-marker-store';

jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn() }));
const getItem = AsyncStorage.getItem as jest.Mock;
beforeEach(() => jest.clearAllMocks());

test('quail is the default when nothing is saved or the value is unknown', async () => {
  getItem.mockResolvedValueOnce(null);
  expect(await loadDiaryMarker()).toBe('quail');
  getItem.mockResolvedValueOnce('dragon');
  expect(await loadDiaryMarker()).toBe('quail');
});

test('a saved choice is read back and a read failure falls back to quail', async () => {
  getItem.mockResolvedValueOnce('person');
  expect(await loadDiaryMarker()).toBe('person');
  getItem.mockRejectedValueOnce(new Error('storage unavailable'));
  expect(await loadDiaryMarker()).toBe('quail');
});

test('saving writes the choice', async () => {
  await saveDiaryMarker('person');
  expect(AsyncStorage.setItem).toHaveBeenCalledWith('runary.diary-marker.v1', 'person');
});
