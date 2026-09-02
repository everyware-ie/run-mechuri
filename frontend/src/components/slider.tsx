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

  // 실기기 피드백(2026-09-02): 손가락을 대고 끄는 동안 값이 자꾸 0% 쪽으로
  // 튀었다 왔다갔다 했다 — locationX(터치가 잡힌 뷰 기준 좌표)는 이 슬라이더가
  // 애니메이션 transform이 걸린 조상 뷰(바텀시트, translateY로 계속 움직임) 안에
  // 있을 때 프레임마다 다시 계산되면서 값이 튀는 문제가 알려져 있다. 처음
  // 눌렀을 때 자리로 "점프"하는 것만 locationX를 쓰고(그 순간의 절대 위치가
  // 필요하니까), 이후 끄는 동안은 gestureState.dx(제스처 시작점부터의 이동
  // 거리 — 조상 뷰의 transform과 무관하게 항상 안정적으로 계산된다, edit.tsx의
  // 경로 드래그와 같은 방식)만으로 움직인다.
  const dragStartFractionRef = useRef(0);
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        updateFromLocationX(evt.nativeEvent.locationX);
        dragStartFractionRef.current = valueRef.current / 100;
      },
      onPanResponderMove: (_evt, gestureState) => {
        const width = trackWidthRef.current;
        if (width <= 0) return;
        const fraction = Math.max(0, Math.min(1, dragStartFractionRef.current + gestureState.dx / width));
        onChange(Math.round(fraction * 100));
      },
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
