// result-editing FRD §6-2 선 색과 두께, §7-3 폰트와 글자 색.
// 선택하지 않은 값은 각 프리셋의 기본값을 그대로 사용한다.
export const ROUTE_COLORS = [
  { id: 'warm', label: '따뜻한 흰색', hex: '#FFF3EC' },
  { id: 'orange', label: '오렌지', hex: '#FF985C' },
  { id: 'mint', label: '민트', hex: '#8EF0CE' },
  { id: 'sky', label: '하늘', hex: '#8ECFFF' },
  { id: 'pink', label: '분홍', hex: '#FFADD5' },
  { id: 'violet', label: '보라', hex: '#C5AEFF' },
] as const;
export type RouteColor = typeof ROUTE_COLORS[number]['id'];
export type RouteStyle = { color?: RouteColor; widthScale?: number };
export const LINE_WIDTH_MIN = 50;
export const LINE_WIDTH_MAX = 200;
export const STAMP_FONTS = [
  { id: 'preset', label: '프리셋 기본' },
  { id: 'pretendard', label: 'Pretendard' },
  { id: 'noto', label: 'Noto Sans KR' },
] as const;
export type StampFont = typeof STAMP_FONTS[number]['id'];
export type StampTextColor = 'white' | 'black';
export type TextStyleChoice = { font?: StampFont; textColor?: StampTextColor };

export function normalizeRouteStyle(style?: RouteStyle): RouteStyle {
  const color = ROUTE_COLORS.some(c => c.id === style?.color) ? style?.color : undefined;
  const widthScale = typeof style?.widthScale === 'number' && Number.isFinite(style.widthScale)
    ? Math.min(LINE_WIDTH_MAX / 100, Math.max(LINE_WIDTH_MIN / 100, style.widthScale)) : 1;
  return { color: color === 'warm' ? undefined : color, widthScale: widthScale === 1 ? undefined : widthScale };
}

export function resolveRouteStyle(style?: RouteStyle) {
  const normalized = normalizeRouteStyle(style);
  const color = ROUTE_COLORS.find(c => c.id === normalized.color)?.hex ?? ROUTE_COLORS[0].hex;
  return { color, widthScale: normalized.widthScale ?? 1 };
}

export function resolveStampFont(font: StampFont | undefined, fallback: string): string {
  const weight = fallback.endsWith('_500Medium') ? '500Medium' : '700Bold';
  return font === 'pretendard' ? `Pretendard_${weight}` : font === 'noto' ? `NotoSansKR_${weight}` : fallback;
}

export function resolveStampColor(color?: StampTextColor) {
  return color === 'black' ? '#111111' : color === 'white' ? '#FFFFFF' : '#FFF3EC';
}

export function textContrastColor(color?: StampTextColor) {
  return color === 'black' ? '#FFFFFF' : '#000000';
}
