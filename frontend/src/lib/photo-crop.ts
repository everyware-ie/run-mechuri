export type PhotoCrop = { zoom: number; centerX: number; centerY: number };
export const INITIAL_PHOTO_CROP: PhotoCrop = { zoom: 1, centerX: 0.5, centerY: 0.5 };

/** 중심은 원본 사진 기준 0..1. 어느 구도에서도 9:16 틀에 빈 곳이 생기지 않는다. */
export function constrainPhotoCrop(width: number, height: number, crop: PhotoCrop): PhotoCrop {
  'worklet';
  const zoom = Math.max(1, Math.min(6, crop.zoom));
  const visibleWidth = Math.min(width, height * 9 / 16) / zoom;
  const visibleHeight = Math.min(height, width * 16 / 9) / zoom;
  const halfX = visibleWidth / width / 2;
  const halfY = visibleHeight / height / 2;
  return {
    zoom,
    centerX: Math.max(halfX, Math.min(1 - halfX, crop.centerX)),
    centerY: Math.max(halfY, Math.min(1 - halfY, crop.centerY)),
  };
}

export function photoCropRect(width: number, height: number, crop: PhotoCrop) {
  const safe = constrainPhotoCrop(width, height, crop);
  const cropWidth = Math.max(1, Math.round(Math.min(width, height * 9 / 16) / safe.zoom));
  const cropHeight = Math.max(1, Math.round(Math.min(height, width * 16 / 9) / safe.zoom));
  return {
    originX: Math.max(0, Math.min(width - cropWidth, Math.round(safe.centerX * width - cropWidth / 2))),
    originY: Math.max(0, Math.min(height - cropHeight, Math.round(safe.centerY * height - cropHeight / 2))),
    width: cropWidth,
    height: cropHeight,
  };
}
