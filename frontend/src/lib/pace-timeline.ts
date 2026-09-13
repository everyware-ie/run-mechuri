// FRD: route-rendering §7-3. GPS 시각과 거리로 추정한 구간 페이스를 한 번 계산한다.
import { cumulativeDistances, type Point } from './route-projection';

export type TimedPoint = Point & { timestamp?: string };
export const PACE_TIMELINE_STEPS = 270; // 9초 × 30fps, 마지막 완성 값 포함
const WINDOW_METERS = 100;
const MAX_GAP_SECONDS = 15;

export function buildPaceTimeline(points: TimedPoint[], average: number): number[] {
  if (!(average > 0) || !Number.isFinite(average) || points.length < 2) return [];
  if (points.some(p => !Number.isFinite(p.latitude) || !Number.isFinite(p.longitude)
    || Math.abs(p.latitude) > 90 || Math.abs(p.longitude) > 180)) return [];
  const times = points.map(p => p.timestamp ? Date.parse(p.timestamp) / 1000 : NaN);
  const distances = cumulativeDistances(points);
  const total = distances.at(-1) ?? 0;
  if (!(total >= 30) || !Number.isFinite(total)) return [];
  const elapsed = [0], invalid = [0];
  let validSegments = 0;
  for (let i = 1; i < points.length; i++) {
    const dt = times[i] - times[i - 1], meters = distances[i] - distances[i - 1];
    // 긴 신호 공백·역행 시각·비현실적인 점프는 구간 페이스의 근거로 쓰지 않는다.
    const valid = Number.isFinite(dt) && dt > 0 && dt <= MAX_GAP_SECONDS && meters / dt <= 12;
    elapsed.push(elapsed[i - 1] + (valid ? dt : 0));
    invalid.push(invalid[i - 1] + (valid ? 0 : 1));
    if (valid && meters > 0) validSegments++;
  }
  if (!validSegments) return [];
  function endpoint(distance: number) {
    let lo = 1, hi = distances.length - 1;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (distances[mid] < distance) lo = mid + 1; else hi = mid; }
    const span = distances[lo] - distances[lo - 1];
    const fraction = span > 0 ? Math.max(0, Math.min(1, (distance - distances[lo - 1]) / span)) : 0;
    return { index: lo, seconds: elapsed[lo - 1] + (elapsed[lo] - elapsed[lo - 1]) * fraction };
  }
  const raw = Array.from({ length: PACE_TIMELINE_STEPS + 1 }, (_, frame) => {
    const center = total * frame / PACE_TIMELINE_STEPS;
    const left = Math.max(0, center - WINDOW_METERS / 2), right = Math.min(total, center + WINDOW_METERS / 2);
    const a = endpoint(left), b = endpoint(right);
    if (right - left < 30 || invalid[b.index] - invalid[a.index - 1] > 0) return average;
    const pace = (b.seconds - a.seconds) * 1000 / (right - left);
    return Number.isFinite(pace) && pace >= 1000 / 12 && pace <= 3600 ? pace : average;
  });
  return raw.map((_, frame) => {
    // 5프레임 창으로 GPS 잡음에 따른 숫자 떨림을 줄인다(프레임 중 계산하지 않음).
    const from = Math.max(0, frame - 2), to = Math.min(PACE_TIMELINE_STEPS, frame + 2);
    let sum = 0;
    for (let i = from; i <= to; i++) sum += raw[i];
    const pace = sum / (to - from + 1);
    // 마지막 0.5초는 최종 평균으로 부드럽게 합류한다.
    const t = Math.max(0, (frame - (PACE_TIMELINE_STEPS - 15)) / 15);
    const blend = t * t * (3 - 2 * t);
    return frame === PACE_TIMELINE_STEPS ? average : pace + (average - pace) * blend;
  });
}

export function paceAtProgress(samples: readonly number[], progress: number, average: number): number {
  if (samples.length < 2 || !Number.isFinite(progress) || progress >= 1) return average;
  const index = Math.max(0, progress) * (samples.length - 1);
  const lo = Math.floor(index), hi = Math.min(lo + 1, samples.length - 1);
  const value = samples[lo] + (samples[hi] - samples[lo]) * (index - lo);
  return Number.isFinite(value) && value > 0 ? value : average;
}
