// FRD: docs/specs/frd/route-rendering.md §4, §5-4
// Swift 렌더러(modules/route-renderer)의 투영·거리 계산과 같은 로직을 TS로도 둔다.
// 이유: 편집 화면의 실시간 미리보기는 mp4를 다시 구울 수 없어(§2-2 "즉시 반영") RN 쪽에서
// 직접 그려야 하고, 최종 결과물과 같은 모양이 나오려면 같은 투영 공식을 써야 한다.
//
// 캔버스 좌표계는 최종 출력 규격과 동일한 1080x1920을 기준으로 삼는다(§9).
// 편집에서 만든 변형값(x/y/scale/rotation)을 그대로 네이티브 렌더러에 넘길 수 있게 하기 위함.

export type Point = { latitude: number; longitude: number };
export type CanvasPoint = { x: number; y: number };

export const CANVAS_WIDTH = 1080;
export const CANVAS_HEIGHT = 1920;
const MARGIN_RATIO = 0.08; // §4 제안값: 짧은 축 기준 8%

export function projectPoints(points: Point[]): CanvasPoint[] {
  if (points.length === 0) return [];
  const lats = points.map((p) => p.latitude);
  const lons = points.map((p) => p.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const midLat = (minLat + maxLat) / 2;
  const lonScale = Math.cos((midLat * Math.PI) / 180);

  const spanX = (maxLon - minLon) * lonScale;
  const spanY = maxLat - minLat;
  const span = Math.max(spanX, spanY, 0.000001);

  const shortSide = Math.min(CANVAS_WIDTH, CANVAS_HEIGHT);
  const usable = shortSide * (1 - MARGIN_RATIO * 2);
  const scale = usable / span;

  const raw = points.map((p) => ({
    x: (p.longitude - minLon) * lonScale * scale,
    y: (maxLat - p.latitude) * scale, // 북쪽=위=작은 y
  }));

  const rawMinX = Math.min(...raw.map((p) => p.x));
  const rawMaxX = Math.max(...raw.map((p) => p.x));
  const rawMinY = Math.min(...raw.map((p) => p.y));
  const rawMaxY = Math.max(...raw.map((p) => p.y));
  const rawCenterX = (rawMinX + rawMaxX) / 2;
  const rawCenterY = (rawMinY + rawMaxY) / 2;

  const centerX = CANVAS_WIDTH / 2;
  const centerY = CANVAS_HEIGHT / 2;

  return raw.map((p) => ({
    x: p.x - rawCenterX + centerX,
    y: p.y - rawCenterY + centerY,
  }));
}

function haversineMeters(a: Point, b: Point): number {
  const earthRadius = 6_371_000;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function cumulativeDistances(points: Point[]): number[] {
  const result = [0];
  for (let i = 1; i < points.length; i++) {
    result.push(result[i - 1] + haversineMeters(points[i - 1], points[i]));
  }
  return result;
}

/** §5-4: 진행률은 거리(호 길이) 기준. 점 인덱스가 아니다.
 *
 * 편집 화면 애니메이션은 이 함수를 매 프레임(최대 60fps) 부른다 — 예전엔 여기서
 * 순회(O(n))로 targetDistance가 속한 구간을 찾았는데, 긴 경로일수록·애니메이션
 * 후반부일수록 매 프레임 배열을 거의 끝까지 훑어야 해서 실기기에서 눈에 띄는
 * 끊김의 원인이 됐다(2026-09-01). `cumulative`는 항상 오름차순이므로 이분 탐색으로
 * 바꿔 O(log n)으로 줄였다 — 반환값은 이전과 동일하다. */
export function pointsUpToDistance(
  targetDistance: number,
  projected: CanvasPoint[],
  cumulative: number[]
): CanvasPoint[] {
  if (projected.length === 0) return [];
  if (targetDistance <= 0) return [projected[0]];
  if (cumulative.length < 2) return [projected[0]];
  if (targetDistance >= cumulative[cumulative.length - 1]) return projected;

  // cumulative[i] > targetDistance인 첫 인덱스 i를 찾는다(0 < i < length).
  let lo = 1;
  let hi = cumulative.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cumulative[mid] <= targetDistance) lo = mid + 1;
    else hi = mid;
  }
  const i = lo;
  const segStart = cumulative[i - 1];
  const segEnd = cumulative[i];
  const segLen = segEnd - segStart;
  const t = segLen > 0 ? (targetDistance - segStart) / segLen : 0;
  const interpolated: CanvasPoint = {
    x: projected[i - 1].x + (projected[i].x - projected[i - 1].x) * t,
    y: projected[i - 1].y + (projected[i].y - projected[i - 1].y) * t,
  };
  return [...projected.slice(0, i), interpolated];
}

/** pointsUpToDistance와 같은 지점을 찾지만, 그 지점 하나만 필요할 때(머리 점·구간
 * 경계 점) 앞부분 전체를 slice로 새로 배열에 담지 않는다 — 애니메이션 중 매 프레임
 * 불려서(2026-09-01), 경로가 길어질수록(진행률이 높을수록) 매번 커지는 배열을
 * 할당하는 비용도 누적됐다. 반환값은 pointsUpToDistance(...).at(-1)과 같다.
 *
 * 'worklet' 지시어: 불빛 러너(light-runner) 프리셋은 이 함수를 Reanimated
 * useDerivedValue 안(UI 스레드)에서 부른다 — 다른 파일에서 가져다 쓰는 함수가
 * 워클릿 안에서 불리려면 이 함수 자신도 워클릿으로 표시돼 있어야 한다. */
export function pointAtDistance(
  targetDistance: number,
  projected: CanvasPoint[],
  cumulative: number[]
): CanvasPoint | undefined {
  'worklet';
  if (projected.length === 0) return undefined;
  if (targetDistance <= 0) return projected[0];
  if (cumulative.length < 2) return projected[0];
  if (targetDistance >= cumulative[cumulative.length - 1]) return projected[projected.length - 1];

  let lo = 1;
  let hi = cumulative.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cumulative[mid] <= targetDistance) lo = mid + 1;
    else hi = mid;
  }
  const i = lo;
  const segStart = cumulative[i - 1];
  const segEnd = cumulative[i];
  const segLen = segEnd - segStart;
  const t = segLen > 0 ? (targetDistance - segStart) / segLen : 0;
  return {
    x: projected[i - 1].x + (projected[i].x - projected[i - 1].x) * t,
    y: projected[i - 1].y + (projected[i].y - projected[i - 1].y) * t,
  };
}

/** 다듬기(route-smoothing.applySmoothing) 적용 후처럼 원본 위경도와 점 대응이 깨진
 * 캔버스 점들의 누적 거리. 실제 미터 단위는 아니지만(캔버스 픽셀 기준), §5-4 진행률은
 * 항상 targetDistance = totalDistance * progressFraction 형태의 "비율"로만 쓰이므로
 * 균일 변형(스케일 포함)에도 비율은 그대로 보존된다. */
export function cumulativeCanvasDistances(points: CanvasPoint[]): number[] {
  const result = [0];
  for (let i = 1; i < points.length; i++) {
    result.push(result[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  }
  return result;
}

export function toSvgPath(points: CanvasPoint[]): string {
  if (points.length < 2) return '';
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
}

/** §6-3 구간 점등: 점등 횟수 5~8회 목표로 구간 단위를 자동 선택. */
export function segmentUnitMeters(totalDistanceMeters: number): number {
  const km = totalDistanceMeters / 1000;
  if (km <= 3) return 500;
  if (km <= 8) return 1000;
  if (km <= 16) return 2000;
  return 5000;
}
