// FRD: docs/specs/frd/result-editing.md §5 "다듬기 세기"
//
// 알고리즘은 디자인 목업(2026-08-31, "1a 야간 네온" 3안)에 참고 구현이 그대로 포함돼
// 있어서(전역 이동평균 → RDP 단순화 → 모서리 라운딩) 그 수식을 옮겼다.
// route-preview.tsx(미리보기)와 RouteRendererModule.swift(최종 렌더러)가 같은 결과가
// 나오도록 두 언어에 각각 이식 — 이 파일은 TS쪽.
//
// §5 "슬라이더 범위 자체가 안전 구간이다": 아무리 세게 다듬어도 실제로 지나가지
// 않은 길이 보이지 않는다 — RDP·라운딩 둘 다 원래 점들 사이의 형태만 바꿀 뿐,
// 원래 지나온 영역 밖으로 크게 벗어나지 않기 때문에 이 성질이 자연히 유지된다.

import type { CanvasPoint } from './route-projection';

export type SmoothOptions = {
  /** 0~100. §5 기본 한 축(직선 다듬기) */
  smooth: number;
  /** 0~100. §5 고급 설정의 두 번째 축(모서리 라운딩) */
  corner: number;
};

function dist(a: CanvasPoint, b: CanvasPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function dedupe(points: CanvasPoint[], minDist: number): CanvasPoint[] {
  if (points.length === 0) return points;
  const out = [points[0]];
  for (let i = 1; i < points.length; i++) {
    if (dist(out[out.length - 1], points[i]) >= minDist) out.push(points[i]);
  }
  if (out.length < 2) out.push(points[points.length - 1]);
  return out;
}

function movingAverage(points: CanvasPoint[], window: number): CanvasPoint[] {
  if (points.length < 3) return points.slice();
  const half = Math.floor(window / 2);
  const out: CanvasPoint[] = [];
  for (let i = 0; i < points.length; i++) {
    let sx = 0;
    let sy = 0;
    let k = 0;
    for (let j = i - half; j <= i + half; j++) {
      if (j < 0 || j >= points.length) continue;
      sx += points[j].x;
      sy += points[j].y;
      k++;
    }
    out.push({ x: sx / k, y: sy / k });
  }
  out[0] = points[0];
  out[out.length - 1] = points[points.length - 1];
  return out;
}

function segmentDistance(p: CanvasPoint, a: CanvasPoint, b: CanvasPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (!lenSq) return dist(p, a);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Ramer–Douglas–Peucker 단순화. */
function rdpSimplify(points: CanvasPoint[], epsilon: number): CanvasPoint[] {
  if (points.length < 3) return points.slice();
  let maxDist = -1;
  let idx = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = segmentDistance(points[i], points[0], points[points.length - 1]);
    if (d > maxDist) {
      maxDist = d;
      idx = i;
    }
  }
  if (maxDist > epsilon) {
    const left = rdpSimplify(points.slice(0, idx + 1), epsilon);
    const right = rdpSimplify(points.slice(idx), epsilon);
    return left.slice(0, left.length - 1).concat(right);
  }
  return [points[0], points[points.length - 1]];
}

function roundCorners(points: CanvasPoint[], radius: number): CanvasPoint[] {
  if (radius <= 0 || points.length < 3) return points.slice();
  const out: CanvasPoint[] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1];
    const v = points[i];
    const b = points[i + 1];
    const d1 = dist(v, a);
    const d2 = dist(v, b);
    if (d1 < 1e-6 || d2 < 1e-6) continue;
    const t = Math.min(radius, d1 * 0.45, d2 * 0.45);
    const p1 = { x: v.x + ((a.x - v.x) / d1) * t, y: v.y + ((a.y - v.y) / d1) * t };
    const p2 = { x: v.x + ((b.x - v.x) / d2) * t, y: v.y + ((b.y - v.y) / d2) * t };
    out.push(p1);
    for (let k = 1; k < 10; k++) {
      const u = k / 10;
      const w = 1 - u;
      out.push({
        x: w * w * p1.x + 2 * w * u * v.x + u * u * p2.x,
        y: w * w * p1.y + 2 * w * u * v.y + u * u * p2.y,
      });
    }
    out.push(p2);
  }
  out.push(points[points.length - 1]);
  return out;
}

function diagonal(points: CanvasPoint[]): number {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return Math.hypot(maxX - minX, maxY - minY);
}

/** 투영된(캔버스 공간) 점들에 다듬기·모서리 라운딩을 적용한다. */
export function applySmoothing(points: CanvasPoint[], opts: SmoothOptions): CanvasPoint[] {
  if (points.length < 3) return points;
  const window = 3 + Math.round((opts.smooth / 100) * 12) * 2;
  const smoothed = movingAverage(dedupe(points, 4), window);
  const dg = diagonal(smoothed) || 1;
  const simplified = rdpSimplify(smoothed, dg * (0.0008 + (opts.smooth / 100) * 0.011));
  return roundCorners(simplified, opts.corner * (dg / 620));
}
