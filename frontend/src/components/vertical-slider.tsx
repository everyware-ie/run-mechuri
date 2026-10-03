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
//
// 같은 날 코드 검토: 손잡이를 부모의 값으로만 그리면 부모가 다시 그려질 때까지 늦게 따라온다
// (다듬기 슬라이더와 같은 문제). 끄는 동안은 이 컴포넌트가 손잡이를 바로 그린다. 또 핀치로
// 범위 밖까지 키운 뒤 잡아도 튀지 않게, 잡은 순간의 실제 값에서 곱셈으로 이어 간다.

type Props = {
  value: number;
  minimumValue: number;
  maximumValue: number;
  accessibilityLabel: string;
  onChange: (value: number) => void;
  /** 잡는 순간. §2-1: 잡고 있는 동안 미리보기를 멈추는 데 쓴다. */
  onSlidingStart?: () => void;
  onSlidingComplete: (value: number) => void;
};

const THUMB = 22;

export function VerticalSlider({ value, minimumValue, maximumValue, accessibilityLabel, onChange, onSlidingStart, onSlidingComplete }: Props) {
  const [trackHeight, setTrackHeight] = useState(0);
  const [dragValue, setDragValue] = useState<number | null>(null);
  const trackHeightRef = useRef(0);
  const valueRef = useRef(value);
  const configRef = useRef({ minimumValue, maximumValue, onChange, onSlidingStart, onSlidingComplete });
  useEffect(() => { valueRef.current = value; }, [value]);
  useEffect(() => {
    configRef.current = { minimumValue, maximumValue, onChange, onSlidingStart, onSlidingComplete };
  }, [minimumValue, maximumValue, onChange, onSlidingStart, onSlidingComplete]);

  const emit = (next: number) => {
    if (next === valueRef.current) return;
    valueRef.current = next;
    setDragValue(next);
    configRef.current.onChange(next);
  };

  // 잡은 순간의 값. 끈 거리(트랙 높이 전체 = 최대/최소 비율)만큼 곱해서 이어 간다.
  const dragStart = useRef(value);
  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    // 미리보기의 끌기 제스처가 가로채지 않게 한다.
    onPanResponderTerminationRequest: () => false,
    // 누르기만 해서는 값을 바꾸지 않는다.
    onPanResponderGrant: () => {
      dragStart.current = valueRef.current;
      setDragValue(valueRef.current);
      configRef.current.onSlidingStart?.();
    },
    onPanResponderMove: (_evt, gesture) => {
      const height = trackHeightRef.current;
      if (height <= 0) return;
      const { minimumValue: min, maximumValue: max } = configRef.current;
      const start = dragStart.current;
      const next = start * Math.pow(max / min, -gesture.dy / height);
      // 범위 밖에서 잡았으면 그 값까지는 허용한다. 그래야 잡는 순간 범위 끝으로 튀지 않는다.
      emit(Math.round(Math.min(Math.max(max, start), Math.max(Math.min(min, start), next))));
    },
    onPanResponderRelease: () => {
      setDragValue(null);
      configRef.current.onSlidingComplete(valueRef.current);
    },
    onPanResponderTerminate: () => {
      setDragValue(null);
      configRef.current.onSlidingComplete(valueRef.current);
    },
  })).current;

  const handleLayout = (e: LayoutChangeEvent) => {
    trackHeightRef.current = e.nativeEvent.layout.height;
    setTrackHeight(e.nativeEvent.layout.height);
  };
  const shown = dragValue ?? value;
  const fraction = Math.max(0, Math.min(1,
    Math.log(Math.max(minimumValue, shown) / minimumValue) / Math.log(maximumValue / minimumValue)));
  const thumbTop = (1 - fraction) * trackHeight - THUMB / 2;

  return (
    <View style={styles.hitArea} onLayout={handleLayout} {...panResponder.panHandlers}
      accessible accessibilityRole="adjustable" accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: Math.round(minimumValue), max: maximumValue, now: shown, text: `${shown}%` }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={({ nativeEvent }) => {
        if (!['increment', 'decrement'].includes(nativeEvent.actionName)) return;
        const { minimumValue: min, maximumValue: max } = configRef.current;
        // 한 번에 트랙의 5%만큼. 곱셈 눈금이라 크기와 상관없이 같은 비율로 움직인다.
        const step = Math.pow(max / min, nativeEvent.actionName === 'increment' ? 0.05 : -0.05);
        emit(Math.round(Math.min(max, Math.max(min, valueRef.current * step))));
        setDragValue(null);
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
