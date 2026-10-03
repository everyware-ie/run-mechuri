import { useEffect, useRef, useState } from 'react';
import { PanResponder, StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { Colors } from '@/constants/theme';

// result-editing FRD §4-2: 크기는 화면 왼쪽의 세로 슬라이더로도 조절한다. 위가 크고 아래가
// 작다.
//
// 실기기 확인(2026-10-04): "가운데를 눌렀는데 갑자기 엄청 커진다". 누른 자리로 값이 뛰고,
// 기본 크기(100%)가 아래쪽에 있어서 가운데가 170% 안팎이었다. 그래서 누르기만 해서는 바꾸지
// 않고 끈 거리만큼만 바꾸며, 눈금을 곱셈 비율로 둬서 범위의 기하 중앙(최소·최대가 대칭이면
// 100%)이 슬라이더 가운데에 오게 한다.

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
  const valueAt = (fraction: number) => {
    const { minimumValue: min, maximumValue: max } = configRef.current;
    return min * Math.pow(max / min, clampFraction(fraction));
  };
  const fractionOf = (v: number) => {
    const { minimumValue: min, maximumValue: max } = configRef.current;
    return clampFraction(Math.log(Math.max(min, v) / min) / Math.log(max / min));
  };
  const update = (fraction: number) => {
    const next = Math.round(valueAt(fraction));
    valueRef.current = next;
    configRef.current.onChange(next);
  };

  const dragStart = useRef(0);
  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    // 미리보기의 끌기 제스처가 가로채지 않게 한다.
    onPanResponderTerminationRequest: () => false,
    // 누르기만 해서는 값을 바꾸지 않는다. 어디를 잡든 끈 거리만큼만 움직인다.
    onPanResponderGrant: () => {
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
  const fraction = clampFraction(Math.log(Math.max(minimumValue, value) / minimumValue) / Math.log(maximumValue / minimumValue));
  const thumbTop = (1 - fraction) * trackHeight - THUMB / 2;

  return (
    <View style={styles.hitArea} onLayout={handleLayout} {...panResponder.panHandlers}
      accessible accessibilityRole="adjustable" accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: minimumValue, max: maximumValue, now: value, text: `${value}%` }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={({ nativeEvent }) => {
        if (!['increment', 'decrement'].includes(nativeEvent.actionName)) return;
        update(fractionOf(valueRef.current) + (nativeEvent.actionName === 'increment' ? 0.05 : -0.05));
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
