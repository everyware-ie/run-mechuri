// 디자인: "1a 야간 네온" (2026-08-25 결정, 회의에서 확정) — 3안(전체 12화면 시안)의
// 색상·타이포 토큰을 그대로 옮김. 화면 컴포넌트는 이 값만 참조한다.

export const Colors = {
  bg: '#0B0D10',
  bgCard: '#14181D',
  text: '#EDF1F5',
  textMuted: '#7C8894',
  accent: '#FF5A2B',
  accentText: '#0B0D10', // accent 배경 위에 올라가는 텍스트
  border: 'rgba(237,241,245,0.09)',
  borderStrong: 'rgba(237,241,245,0.22)',
  danger: '#FF5A2B',
  // 경로 렌더링과 공유하는 색(route-preview.tsx, RouteRendererModule.swift와 동일)
  lineWarm: '#FFF3EC',
} as const;

export const Fonts = {
  sans: 'SpaceGrotesk_500Medium',
  sansBold: 'SpaceGrotesk_700Bold',
  mono: 'JetBrainsMono_500Medium',
} as const;

export const Radius = {
  pill: 26,
  card: 22,
  chip: 19,
} as const;

export const Spacing = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 24,
  xl: 34,
} as const;
