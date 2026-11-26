import Svg, { Circle, G, Path } from 'react-native-svg';

// 달리는 메추리. 하단 탭의 러닝 아이콘이다. 뒤로 흐르는 속도선이 달리는 중임을 보여 준다.
// 다이어리의 뛴 날 표시(diary-marker.tsx)와는 별개의 그림이다.
export function RunningQuailIcon({ size = 26, color }: { size?: number; color: string }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <G fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={19} cy={8.2} r={2.3} />
      <Path d="M21.2 7.8 23.1 8.7 21 9.4" />
      <Path d="M18.2 6C17.8 4.8 18.4 3.7 19.7 3.5" />
      <Path d="M17 10C15 8.6 10.6 8.8 7.6 10.4L4.2 9 5.4 12.2C6 14.8 9 16.2 12 16 14.6 15.8 16.6 13.6 17 10Z" />
      <Path d="M13.4 15.8 16.4 18.6 19.2 18" />
      <Path d="M10 15.9 6.6 18.8 4.2 17.2" />
      <Path d="M9 11.8C10.4 13.4 13.2 13.2 14.6 11.2" />
      <Path d="M1.2 12.2H3.2" />
      <Path d="M0.8 14.6H2.8" />
      <Circle cx={19.7} cy={7.9} r={0.55} fill={color} stroke="none" />
    </G>
  </Svg>;
}
