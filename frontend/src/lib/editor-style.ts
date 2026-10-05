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
export type RouteColor = typeof ROUTE_COLORS[number]['id'] | `#${string}`;
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

export function normalizeRouteColor(value: unknown): RouteColor | undefined {
  if (typeof value !== 'string') return undefined;
  const preset = ROUTE_COLORS.find(c => c.id === value || c.hex === value.toUpperCase());
  if (preset) return preset.id === 'warm' ? undefined : preset.id;
  return /^#[0-9a-f]{6}$/i.test(value) ? value.toUpperCase() as RouteColor : undefined;
}

export function normalizeRouteStyle(style?: RouteStyle): RouteStyle {
  const color = normalizeRouteColor(style?.color);
  const widthScale = typeof style?.widthScale === 'number' && Number.isFinite(style.widthScale)
    ? Math.min(LINE_WIDTH_MAX / 100, Math.max(LINE_WIDTH_MIN / 100, style.widthScale)) : 1;
  return { color: color === 'warm' ? undefined : color, widthScale: widthScale === 1 ? undefined : widthScale };
}

export function resolveRouteStyle(style?: RouteStyle) {
  const normalized = normalizeRouteStyle(style);
  const color = normalized.color?.startsWith('#') ? normalized.color : ROUTE_COLORS.find(c => c.id === normalized.color)?.hex ?? ROUTE_COLORS[0].hex;
  return { color, widthScale: normalized.widthScale ?? 1 };
}

/** 불빛 러너: 파스텔 선과 채도 높은 주변 빛, 밝은 중심을 분리한다. Swift도 같은 RGB 계산. */
export function runnerLightColors(color: string) {
  if (color === '#FFF3EC') return { glow: '#FF5A2B', core: color, colored: false };
  const channels = [1, 3, 5].map(offset => parseInt(color.slice(offset, offset + 2), 16));
  const highest = Math.max(...channels), lowest = Math.min(...channels);
  const hex = (values: number[]) => '#' + values.map(v => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
  return {
    glow: hex(channels.map(v => highest === lowest ? v : 255 * (1 - .78 * (highest - v) / (highest - lowest)))),
    core: hex(channels.map(v => v * .22 + 255 * .78)),
    colored: true,
  };
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
