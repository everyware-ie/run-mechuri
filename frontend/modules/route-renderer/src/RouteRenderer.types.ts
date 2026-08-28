// FRD: docs/specs/frd/route-rendering.md

export type RoutePoint = {
  latitude: number;
  longitude: number;
};

/**
 * v0 스코프: 기본 이미지 배경 + "기본 드로잉" 프리셋 하나만.
 * 프리셋 3개·다듬기·각인·배경 영상은 관통 이후.
 */
export type RenderClipOptions = {
  points: RoutePoint[];
  /** 기기 로컬 파일 경로 (file://). 배경 사진. */
  backgroundImagePath: string;
  /** 저장할 파일 이름 (확장자 없이). */
  outputFileName: string;
};

export type RenderClipResult = {
  /** 완성된 mp4의 로컬 파일 경로 (file://). */
  outputPath: string;
};
