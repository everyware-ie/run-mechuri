import type { VideoCrop } from '../../modules/route-renderer/src/RouteRenderer.types';
import type { PhotoBackground } from './background-storage';
import { photoCropRect } from './photo-crop';

// 배경 선택 FRD §5 영상 처리. 네이티브 렌더러(VideoBackground.swift)와 같은 규칙이다.

/** §5-1: 클립(기본 12초)은 영상 앞에서부터 쓴다. 속도 조절 여유를 두고 앞 20초만 보관한다. */
export const VIDEO_KEEP_SECONDS = 20;

/** §5-2: 이보다 짧은 영상은 반복하지 않고 마지막 장면에서 멈춘다. */
export const VIDEO_FREEZE_UNDER_SECONDS = 3;

export function freezesAtEnd(durationSec?: number): boolean {
  return durationSec !== undefined && durationSec > 0 && durationSec < VIDEO_FREEZE_UNDER_SECONDS;
}

/** 렌더러에 넘길 자르기 영역. 미리보기·첫 장면 이미지와 같은 계산을 쓴다. */
export function videoCrop(video: Pick<PhotoBackground, 'width' | 'height' | 'crop'>): VideoCrop {
  return photoCropRect(video.width, video.height, video.crop);
}
