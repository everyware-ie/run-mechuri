import { useEffect, useRef, useState } from 'react';
import { PanResponder, StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { Colors } from '@/constants/theme';

// result-editing FRD §4-2: 크기는 화면 왼쪽의 세로 슬라이더로도 조절한다. 위가 크고 아래가
// 작다. slider.tsx와 같은 이유로 처음 누른 자리로만 뛰고, 끄는 동안은 이동 거리(dy)로 움직인다.

type Props = {
  value: number;
  minimumValue: number;
  maximumValue: number;
  accessibilityLabel: string;
  onChange: (value: number) => void;
  onSlidingComplete: (value: number) => void;
};

const THUMB = 22;

export function VerticalSlider({ value, minimumValue, maximumValue, accessibilityLabel, onChange, onSlidingComplete }: Props) {
  const [trackHeight, setTrackHeight] = useState(0);
  const trackHeightRef = useRef(0);
  const valueRef = useRef(value);
  const configRef = useRef({ minimumValue, maximumValue, onChange, onSlidingComplete });
  useEffect(() => { valueRef.current = value; }, [value]);
  useEffect(() => {
    configRef.current = { minimumValue, maximumValue, onChange, onSlidingComplete };
  }, [minimumValue, maximumValue, onChange, onSlidingComplete]);

  const clampFraction = (fraction: number) => Math.max(0, Math.min(1, fraction));
  const update = (fraction: number) => {
    const { minimumValue: min, maximumValue: max, onChange: change } = configRef.current;
    const next = Math.round(min + clampFraction(fraction) * (max - min));
    valueRef.current = next;
    change(next);
  };
  const fractionOf = (v: number) => {
    const { minimumValue: min, maximumValue: max } = configRef.current;
    return clampFraction((v - min) / Math.max(1, max - min));
  };

  const dragStart = useRef(0);
  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    // 미리보기의 끌기 제스처가 가로채지 않게 한다.
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (evt) => {
      const height = trackHeightRef.current;
      if (height > 0) update(1 - evt.nativeEvent.locationY / height);
      dragStart.current = fractionOf(valueRef.current);
    },
    onPanResponderMove: (_evt, gesture) => {
      const height = trackHeightRef.current;
      if (height > 0) update(dragStart.current - gesture.dy / height);
    },
    onPanResponderRelease: () => configRef.current.onSlidingComplete(valueRef.current),
    onPanResponderTerminate: () => configRef.current.onSlidingComplete(valueRef.current),
  })).current;

  const handleLayout = (e: LayoutChangeEvent) => {
    trackHeightRef.current = e.nativeEvent.layout.height;
    setTrackHeight(e.nativeEvent.layout.height);
  };
  const fraction = clampFraction((value - minimumValue) / Math.max(1, maximumValue - minimumValue));
  const thumbTop = (1 - fraction) * trackHeight - THUMB / 2;

  return (
    <View style={styles.hitArea} onLayout={handleLayout} {...panResponder.panHandlers}
      accessible accessibilityRole="adjustable" accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: minimumValue, max: maximumValue, now: value, text: `${value}%` }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={({ nativeEvent }) => {
        if (!['increment', 'decrement'].includes(nativeEvent.actionName)) return;
        const step = nativeEvent.actionName === 'increment' ? 10 : -10;
        update(fractionOf(valueRef.current + step));
        configRef.current.onSlidingComplete(valueRef.current);
      }}>
      <View style={styles.track} />
      <View style={[styles.thumb, { top: thumbTop }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  // 가는 선이지만 손가락으로 잡기 쉽게 터치 영역은 넓게 둔다.
  hitArea: { width: 44, height: '100%', alignItems: 'center' },
  track: { position: 'absolute', top: 0, bottom: 0, width: 4, borderRadius: 2, backgroundColor: 'rgba(237,241,245,0.35)' },
  thumb: {
    position: 'absolute', width: THUMB, height: THUMB, borderRadius: THUMB / 2,
    backgroundColor: Colors.text, borderWidth: 2, borderColor: Colors.accent,
  },
});
