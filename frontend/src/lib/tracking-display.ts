import type { RunPoint, RunSummary } from '../../modules/run-tracking/src/RunTracking';

export function runTime(value: number): string {
  const seconds = Math.max(0, Math.floor(value));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
export function runPace(value?: number | null): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return '—';
  const rounded = Math.round(value);
  return `${Math.floor(rounded / 60)}′${String(rounded % 60).padStart(2, '0')}″`;
}
export function runNumber(value?: number | null): string { return value == null ? '—' : String(Math.round(value)); }
export const runStatus = { running: '측정 중', paused: '일시정지', interrupted: '중단됨', saving: '저장 대기', completed: '완료' };
export function diagnosticSummary(run: RunSummary, version: string, device: string): string {
  // Allowlist: no coordinate arrays, raw heart samples, IDs or place metadata.
  return [
    'Runary 내부 러닝 진단', `계산 기준: internal-v${run.metricVersion}`,
    `GPS 준비: ${run.preparedAt != null && run.readyAt != null ? Math.max(0, run.readyAt - run.preparedAt).toFixed(1) + '초' : '미확인'}`,  `빌드: ${version}`, `기기: ${device}`,
    `상태: ${runStatus[run.status]}`, `거리: ${(run.distance / 1000).toFixed(2)} km`,
    `시간: ${runTime(run.duration)} / 총 경과 ${runTime(run.elapsed)}`,
    `GPS: 수신 ${run.rawCount}, 채택 ${run.acceptedCount}, 제외 ${JSON.stringify(run.rejected)}`,
    `정확도 평균: ${run.meanAccuracy?.toFixed(1) ?? '미측정'} m`,
    `최대 공백: 좌표 ${run.maxSampleGap.toFixed(1)}초 / 수신 ${run.maxReceiptGap.toFixed(1)}초`,
    `좌표 수신: 전면 ${run.foregroundCount} / 백그라운드 ${run.backgroundCount}`,
    `워치 사용: ${run.watchEnabled ? '예' : '아니오'}, 심박 수신: ${run.lastHeart != null ? '있음' : '없음'}, 동작 수신: ${run.lastMotion != null ? '있음' : '없음'}`,
    `경로 누락 가능성: ${run.incomplete ? '있음' : '없음'}`,
    `배터리: ${run.batteryStart != null ? Math.round(run.batteryStart * 100) : '—'}% → ${run.batteryEnd != null ? Math.round(run.batteryEnd * 100) : '—'}%, 충전 ${run.charging ? '있음' : '없음'}, 저전력 모드 ${run.lowPower ? '있음' : '없음'}`,
    `오류: ${run.errors.join(', ') || '없음'}`, `사용자 메모: ${run.feedback || '없음'}`,
  ].join('\n');
}
export function runPaths(points: RunPoint[]): string[] {
  if (!points.length) return [];
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (const p of points) { minLat = Math.min(minLat, p.latitude); maxLat = Math.max(maxLat, p.latitude); minLon = Math.min(minLon, p.longitude); maxLon = Math.max(maxLon, p.longitude); }
  const lonScale = Math.cos((minLat + maxLat) / 2 * Math.PI / 180);
  const xSpan = (maxLon - minLon) * lonScale, ySpan = maxLat - minLat;
  const scale = 240 / Math.max(xSpan, ySpan, 0.000001);
  const groups = new Map<number, string[]>();
  for (const p of points) {
    const x = 150 + ((p.longitude - minLon) * lonScale - xSpan / 2) * scale;
    const y = 150 + (maxLat - p.latitude - ySpan / 2) * scale;
    const group = groups.get(p.segment) ?? [];
    group.push(`${group.length ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`); groups.set(p.segment, group);
  }
  return [...groups.values()].map(p => p.join(' '));
}
