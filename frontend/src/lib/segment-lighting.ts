import { cumulativeDistances, segmentUnitMeters, type Point } from './route-projection';

/** 구간은 실제 기록 거리로 나누고, 화면 선 위에서는 이 비율로 표시한다. */
export function lightingDistanceMeters(recordMeters: number | undefined, points: Point[]): number {
  if (recordMeters !== undefined && Number.isFinite(recordMeters) && recordMeters > 0) return recordMeters;
  const meters = cumulativeDistances(points).at(-1) ?? 0;
  return Number.isFinite(meters) && meters > 0 ? meters : 0;
}

export function lightingSegments(meters: number) {
  if (!Number.isFinite(meters) || meters <= 0) return [];
  const unit = segmentUnitMeters(meters);
  return Array.from({ length: Math.ceil(meters / unit) }, (_, index) => ({
    startFraction: index * unit / meters,
    endFraction: Math.min(meters, (index + 1) * unit) / meters,
    endMeters: Math.min(meters, (index + 1) * unit),
  }));
}

// 1080×1920 캔버스 기준. 선 두께 10보다 크며 밝은 사진에서도 테두리가 남는다.
export const SEGMENT_DOT_RADIUS = 12;
export const SEGMENT_DOT_BORDER = 4;
export const SEGMENT_DOT_OUTLINE = 'rgba(11,13,16,0.85)';
