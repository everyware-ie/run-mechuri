import { useEffect, useRef, useState } from 'react';
import { PanResponder, StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { Colors } from '@/constants/theme';

// result-editing FRD §5: "결과를 보면서 조절할 수 있어야 한다" — 별도 화면으로 빼지
//않고 편집 화면 안에서 바로 만지는 슬라이더. 의존성 추가 없이 PanResponder로 직접 구현
// (edit.tsx의 드로잉 제스처와 같은 패턴).

type Props = {
  value: number; // 0~100
  onChange: (value: number) => void;
  onSlidingComplete?: (value: number) => void;
};

export function Slider({ value, onChange, onSlidingComplete }: Props) {
  const [trackWidth, setTrackWidth] = useState(0);
  const trackWidthRef = useRef(0);
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const handleLayout = (e: LayoutChangeEvent) => {
    trackWidthRef.current = e.nativeEvent.layout.width;
    setTrackWidth(e.nativeEvent.layout.width);
  };

  const updateFromLocationX = (locationX: number) => {
    const width = trackWidthRef.current;
    if (width <= 0) return;
    const fraction = Math.max(0, Math.min(1, locationX / width));
    onChange(Math.round(fraction * 100));
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => updateFromLocationX(evt.nativeEvent.locationX),
      onPanResponderMove: (evt) => updateFromLocationX(evt.nativeEvent.locationX),
      onPanResponderRelease: () => onSlidingComplete?.(valueRef.current),
    })
  ).current;

  const fillWidth = trackWidth > 0 ? (value / 100) * trackWidth : 0;

  return (
    <View style={styles.hitArea} onLayout={handleLayout} {...panResponder.panHandlers}>
      <View style={styles.track}>
        <View style={[styles.fill, { width: fillWidth }]} />
      </View>
      <View style={[styles.thumb, { left: Math.max(0, fillWidth - 8) }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  hitArea: { justifyContent: 'center', paddingVertical: 12 },
  track: { height: 4, borderRadius: 2, backgroundColor: Colors.border, overflow: 'hidden' },
  fill: { height: 4, backgroundColor: Colors.accent },
  thumb: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.accent,
  },
});
