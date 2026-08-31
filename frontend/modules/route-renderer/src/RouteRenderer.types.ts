// FRD: docs/specs/frd/route-rendering.md, docs/specs/frd/result-editing.md

export type RoutePoint = {
  latitude: number;
  longitude: number;
};

export type RoutePreset = 'default-drawing' | 'light-runner' | 'segment-lighting';

/** result-editing FRD §4: 렌더러 초기값(회전0·화면맞춤·가운데)을 사용자가 바꾼 값. */
export type RouteTransform = {
  x: number;
  y: number;
  scale: number;
  rotationDeg: number;
};

export type RenderClipOptions = {
  points: RoutePoint[];
  /** 기기 로컬 파일 경로 (file://). 배경 사진. */
  backgroundImagePath: string;
  /** 저장할 파일 이름 (확장자 없이). */
  outputFileName: string;
  preset: RoutePreset;
  transform: RouteTransform;
};

export type RenderClipResult = {
  /** 완성된 mp4의 로컬 파일 경로 (file://). */
  outputPath: string;
};
