import * as FileSystem from 'expo-file-system/legacy';
import type { PhotoCrop } from './photo-crop';

export type PhotoBackground = {
  sourceUri: string;
  width: number;
  height: number;
  crop: PhotoCrop;
  origin: 'gallery' | 'camera';
};

export const BACKGROUNDS_DIR = `${FileSystem.documentDirectory}backgrounds/`;

/** iOS 앱 업데이트로 Documents 앞의 컨테이너 UUID가 바뀌어도 같은 사진을 찾는다. */
export function resolveBackgroundPath(path: string): string {
  const marker = '/Documents/backgrounds/';
  const index = path.lastIndexOf(marker);
  return index >= 0 ? BACKGROUNDS_DIR + path.slice(index + marker.length) : path;
}

export function resolvePhotoBackground(photo?: PhotoBackground): PhotoBackground | undefined {
  return photo ? { ...photo, sourceUri: resolveBackgroundPath(photo.sourceUri) } : undefined;
}

export async function persistBackground(sourceUri: string, name: string): Promise<string> {
  await FileSystem.makeDirectoryAsync(BACKGROUNDS_DIR, { intermediates: true });
  const destination = BACKGROUNDS_DIR + name;
  if (!(await FileSystem.getInfoAsync(destination)).exists) {
    await FileSystem.copyAsync({ from: sourceUri, to: destination });
  }
  return destination;
}
