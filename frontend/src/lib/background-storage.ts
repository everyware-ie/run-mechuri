import * as FileSystem from 'expo-file-system/legacy';
import type { PhotoCrop } from './photo-crop';

/**
 * 사용자가 고른 배경 소재. 이름은 사진이지만 영상도 담는다(배경 선택 FRD §5).
 * 초안과 보관함이 `backgroundPhoto`라는 이름으로 기기에 저장돼 있어서 이름을 바꾸지 않았다.
 */
export type PhotoBackground = {
  /** 사진이면 편집용 JPEG, 영상이면 보관한 영상 파일. */
  sourceUri: string;
  /** 방향을 반영한 화면 기준 크기(px). 영상도 같다. */
  width: number;
  height: number;
  crop: PhotoCrop;
  origin: 'gallery' | 'camera';
  /** 없으면 사진이다(영상 이전 저장분 호환). */
  media?: 'photo' | 'video';
  /** 영상의 첫 장면 이미지(원래 크기). 구도를 자르고 썸네일·공유 배경을 만든다. */
  posterUri?: string;
  durationSec?: number;
};

export function isVideoBackground(background?: PhotoBackground): background is PhotoBackground & { media: 'video'; posterUri: string } {
  return background?.media === 'video' && !!background.posterUri;
}

export const BACKGROUNDS_DIR = `${FileSystem.documentDirectory}backgrounds/`;

/** iOS 앱 업데이트로 Documents 앞의 컨테이너 UUID가 바뀌어도 같은 사진을 찾는다. */
export function resolveBackgroundPath(path: string): string {
  const marker = '/Documents/backgrounds/';
  const index = path.lastIndexOf(marker);
  return index >= 0 ? BACKGROUNDS_DIR + path.slice(index + marker.length) : path;
}

export function resolvePhotoBackground(photo?: PhotoBackground): PhotoBackground | undefined {
  if (!photo) return undefined;
  return {
    ...photo,
    sourceUri: resolveBackgroundPath(photo.sourceUri),
    ...(photo.posterUri ? { posterUri: resolveBackgroundPath(photo.posterUri) } : {}),
  };
}

export async function persistBackground(sourceUri: string, name: string): Promise<string> {
  await FileSystem.makeDirectoryAsync(BACKGROUNDS_DIR, { intermediates: true });
  const destination = BACKGROUNDS_DIR + name;
  if (!(await FileSystem.getInfoAsync(destination)).exists) {
    await FileSystem.copyAsync({ from: sourceUri, to: destination });
  }
  return destination;
}
