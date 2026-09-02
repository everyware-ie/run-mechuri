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
export type StampLayout = 'row' | 'hero';

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
  /** 각인 배치 프리셋 (시안 S6). */
  stampLayout: StampLayout;
  stampItems: {
    distance: boolean;
    time: boolean;
    pace: boolean;
    heartRate: boolean;
    /** 시안 S6에서 추가(2026-09-01). */
    date: boolean;
    place: boolean;
  };
  stampX: number;
  stampY: number;
  /** 각인 묶음 크기 배율(2026-09-02 추가). 기본 1. */
  stampScale?: number;
  /** 시안 S6 "한 줄 문구". 빈 문자열이면 안 그린다. */
  caption: string;
  /** '장소' 각인 값 (역지오코딩 결과). 빈 문자열이면 장소 항목은 안 나온다. */
  placeName: string;
  /** '날짜' 각인 값 계산용 — 러닝한 날 (ISO). */
  runDate: string;
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
