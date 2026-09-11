import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { photoCropRect } from './photo-crop';
import type { PhotoBackground } from './background-storage';

/** 기기 방향을 적용한 편집용 JPEG. 고해상도 사진은 긴 변 4096px 이내로 보관한다. */
export async function preparePhoto(uri: string, width: number, height: number) {
  const context = ImageManipulator.manipulate(uri);
  if (Math.max(width, height) > 4096) {
    context.resize(width >= height ? { width: 4096 } : { height: 4096 });
  }
  try {
    const image = await context.renderAsync();
    try { return await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.95 }); }
    finally { image.release(); }
  } finally { context.release(); }
}

export async function renderPhotoBackground(photo: PhotoBackground) {
  const context = ImageManipulator.manipulate(photo.sourceUri);
  context.crop(photoCropRect(photo.width, photo.height, photo.crop));
  context.resize({ width: 1080, height: 1920 });
  try {
    const image = await context.renderAsync();
    try { return await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.95 }); }
    finally { image.release(); }
  } finally { context.release(); }
}
