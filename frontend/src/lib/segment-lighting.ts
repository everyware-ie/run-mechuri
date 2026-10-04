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

// 1080×1920 기준. 선이 굵어져도 표식은 완만하게 커져 그림보다 앞서 보이지 않는다.
export function segmentMarkerSize(widthScale: number) {
  const scale = Math.sqrt(widthScale);
  return { radius: 9 * scale, coreRadius: 3.2 * scale, haloRadius: 26 * scale };
}
