// FRD: docs/specs/frd/common-rules.md §7 "언어와 단위"
// docs/specs/frd/route-rendering.md §7 (각인 값 규칙)
//
// 한국어·km 고정, 다국어 없음(common-rules §7). 표기 형식은 여기 하나로 모아
// TS 미리보기(route-preview.tsx)와 Swift 최종 렌더러가 같은 문자열이 나오게 한다.

export function formatDistanceKm(meters: number): string {
  return `${(meters / 1000).toFixed(2)}km`;
}

/** route-rendering FRD §7-3: 1시간 미만은 mm:ss, 넘으면 h:mm:ss */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** 분'초"/km */
export function formatPace(secPerKm: number): string {
  const total = Math.max(0, Math.round(secPerKm));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}'${String(s).padStart(2, '0')}"/km`;
}

export function formatHeartRate(bpm: number): string {
  return `${Math.round(bpm)}bpm`;
}

/** 러닝한 날 (ISO) → "MM.dd". 시안 S6/S8b 표기. */
export function formatStampDate(isoDate: string): string {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return '';
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}.${dd}`;
}
