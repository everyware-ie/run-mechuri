import Svg, { Circle, G, Path } from 'react-native-svg';
import { Colors } from '@/constants/theme';
import type { DiaryMarker } from '@/lib/diary-marker-store';

// 시안의 선 그림을 그대로 옮겼다. SF Symbols에는 메추리가 없다.
export function DiaryMarkerIcon({ marker, size = 24, color = Colors.accent }: { marker: DiaryMarker; size?: number; color?: string }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    {marker === 'quail'
      ? <G fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
        <Circle cx={18} cy={7.2} r={2.4} />
        <Path d="M20.4 6.9 22.4 7.7 20.5 8.6" />
        <Path d="M17.1 4.9C16.8 3.8 17.4 2.9 18.6 2.7" />
        <Path d="M16.3 9.2C17.4 12.6 15 16 11 16 7.6 16 5.4 14.1 5 11.5L3 9.6 6.6 10C8 8.6 12.6 7.4 16.3 9.2Z" />
        <Path d="M12.6 16 14.6 19.4H16.8" />
        <Path d="M9.4 16 7.2 19H5.4" />
        <Path d="M8.8 12.2C10.2 13.6 12.8 13.5 14.2 11.6" />
        <Circle cx={18.5} cy={6.8} r={0.55} fill={color} stroke="none" />
      </G>
      : <G fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <Circle cx={16.4} cy={4.4} r={1.9} />
        <Path d="M14.8 8.2 11.4 13.2" />
        <Path d="M14.8 8.4 18 11 20.6 9" />
        <Path d="M14.4 8.6 10.4 8.6 8.2 11.8" />
        <Path d="M11.4 13.2 15.6 15 14.6 20.6" />
        <Path d="M11.4 13.2 7.6 16.4 4.4 15.4" />
      </G>}
  </Svg>;
}
