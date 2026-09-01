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

export type StampMode = 'always' | 'after' | 'hidden';

export type RenderClipOptions = {
  points: RoutePoint[];
  /** 기기 로컬 파일 경로 (file://). 배경 사진. */
  backgroundImagePath: string;
  /** 저장할 파일 이름 (확장자 없이). */
  outputFileName: string;
  preset: RoutePreset;
  transform: RouteTransform;
  /** result-editing FRD §5 다듬기 세기. 0~100, 기본 0(무보정). */
  smooth: number;
  /** result-editing FRD §5 고급 설정: 모서리 라운딩. 0~100, 기본 0(무보정). */
  corner: number;
  /** result-editing FRD §7 · route-rendering FRD §7 각인 */
  stampMode: StampMode;
  stampItems: { distance: boolean; time: boolean; pace: boolean; heartRate: boolean };
  stampX: number;
  stampY: number;
  /** 각인 값 계산용. 그려진 선 길이가 아니라 기록된 값을 쓴다(§7-3). */
  distanceMeters: number;
  durationSeconds: number;
  averagePaceSecPerKm: number;
  /** 데이터가 없으면 null(§2-3, 빈 자리를 남기지 않는다 — 항목 자체가 빠진다). */
  averageHeartRate: number | null;
};

/** export-and-share FRD §2-3. progress는 0~1. */
export type RenderProgressEvent = { progress: number };

export type RenderClipResult = {
  /** 완성된 mp4의 로컬 파일 경로 (file://). */
  outputPath: string;
};
