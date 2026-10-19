import type { RunRecord, Track } from '../../modules/health-kit-bridge/src/HealthKitBridge.types';
import type { RunSummary, RunPoint } from '../../modules/run-tracking/src/RunTracking';

export const RUNARY_RECORD_PREFIX = 'runary:';
export function runaryRecordID(id: string): string | null {
  return id.startsWith(RUNARY_RECORD_PREFIX) ? id.slice(RUNARY_RECORD_PREFIX.length) : null;
}
export function runaryRecord(summary: RunSummary): RunRecord {
  return { id: RUNARY_RECORD_PREFIX + summary.id, source: 'runary',
    date: new Date(summary.started * 1000).toISOString(), distanceMeters: summary.distance,
    durationSeconds: summary.duration, averagePaceSecPerKm: summary.averagePace ?? null,
    ...(summary.averageHeartRate != null && summary.averageHeartRate > 0 ? { averageHeartRate: summary.averageHeartRate } : {}),
    hasRoute: summary.status === 'completed' && summary.hasDrawableRoute === true };
}
export function runaryTrack(detail: { summary: RunSummary; points: RunPoint[] }): { run: RunRecord; track: Track } {
  if (detail.summary.status !== 'completed') throw new Error('러닝을 종료하고 저장한 뒤 선택해 주세요.');
  const coordinates: Track['coordinates'] = [];
  let segment = 0, previous: RunPoint | undefined, interrupted = false;
  for (const point of detail.points) {
    if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude) || !Number.isFinite(point.time)
      || Math.abs(point.latitude) > 90 || Math.abs(point.longitude) > 180 || !Number.isSafeInteger(point.segment)) {
      interrupted = true; continue;
    }
    if (previous && point.time <= previous.time) { interrupted = true; continue; }
    if (previous && (interrupted || point.segment !== previous.segment)) segment++;
    coordinates.push({ latitude: point.latitude, longitude: point.longitude, timestamp: new Date(point.time * 1000).toISOString(), segment });
    previous = point; interrupted = false;
  }
  const drawable = coordinates.some((p, i) => i > 0 && p.segment === coordinates[i - 1].segment
    && (p.latitude !== coordinates[i - 1].latitude || p.longitude !== coordinates[i - 1].longitude));
  if (!drawable) throw new Error('그릴 수 있는 경로가 없는 기록이에요.');
  return { run: { ...runaryRecord(detail.summary), hasRoute: true }, track: { coordinates } };
}
export function mergeRunRecords(health: RunRecord[], own: RunRecord[]) {
  return [...health, ...own].sort((a, b) => Date.parse(b.date) - Date.parse(a.date) || a.id.localeCompare(b.id));
}
