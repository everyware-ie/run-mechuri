import { cumulativeDistances } from './route-projection';
import type { RunRecord, Track } from '../../modules/health-kit-bridge/src/HealthKitBridge.types';

// FRD: docs/specs/frd/sample-record-experience.md §2 샘플 데이터
export const SAMPLE_HEART_ID = 'sample:heart:v1';
export const SAMPLE_PLACE_NAME = '샘플 코스';
const SAMPLE_DATE = '2026-10-01T00:00:00.000Z';
const SAMPLE_DISTANCE_METERS = 5000;
const SAMPLE_DURATION_SECONDS = 1800;

export function isSampleRun(run: Pick<RunRecord, 'id'> | null | undefined): boolean {
  return run?.id === SAMPLE_HEART_ID;
}

/** 모양 검토에서 선택한 하트. 실제 위치나 건강 기록과 무관한 합성 좌표다. */
export function createSampleRun(): { run: RunRecord; track: Track } {
  const rough = Array.from({ length: 481 }, (_, index) => {
    const t = Math.PI + index / 480 * 2 * Math.PI;
    return {
      latitude: (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 111195,
      longitude: 16 * Math.sin(t) ** 3 / 111195,
    };
  });
  const roughLength = cumulativeDistances(rough).at(-1)!;
  const scaled = rough.map(point => ({
    latitude: point.latitude * SAMPLE_DISTANCE_METERS / roughLength,
    longitude: point.longitude * SAMPLE_DISTANCE_METERS / roughLength,
  }));
  const distances = cumulativeDistances(scaled);
  const distanceMeters = distances.at(-1)!;
  const started = Date.parse(SAMPLE_DATE);
  return {
    run: {
      id: SAMPLE_HEART_ID,
      date: SAMPLE_DATE,
      distanceMeters,
      durationSeconds: SAMPLE_DURATION_SECONDS,
      averagePaceSecPerKm: SAMPLE_DURATION_SECONDS / (distanceMeters / 1000),
      hasRoute: true,
    },
    track: {
      coordinates: scaled.map((point, index) => ({
        ...point,
        timestamp: new Date(started + SAMPLE_DURATION_SECONDS * 1000 * distances[index] / distanceMeters).toISOString(),
      })),
    },
  };
}
