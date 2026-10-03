import { useEffect, useRef, useState } from 'react';
import { PanResponder, StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { Colors } from '@/constants/theme';

// result-editing FRD §5: "결과를 보면서 조절할 수 있어야 한다" — 별도 화면으로 빼지
// 않고 편집 화면 안에서 바로 만지는 슬라이더. 의존성 추가 없이 PanResponder로 직접 구현
// (edit.tsx의 드로잉 제스처와 같은 패턴).
//
// 실기기 확인(2026-10-04): "원하는 대로 정확히 움직이지 않는다". 손잡이를 부모의 값으로만
// 그려서 다듬기 계산이 끝날 때까지 늦게 따라왔고, 누른 자리로 값이 뛰었다. 그래서 끄는 동안
// 손잡이는 이 컴포넌트가 바로 그리고, 누르기만 해서는 값을 바꾸지 않는다(iOS 기본 슬라이더와 같다).

type Props = {
  value: number;
  minimumValue?: number;
  maximumValue?: number;
  accessibilityLabel?: string;
  onChange: (value: number) => void;
  /** 잡는 순간. §2-1: 슬라이더를 잡고 있는 동안 미리보기를 멈추는 데 쓴다. */
  onSlidingStart?: () => void;
  onSlidingComplete?: (value: number) => void;
};

export function Slider({ value, minimumValue = 0, maximumValue = 100, accessibilityLabel, onChange, onSlidingStart, onSlidingComplete }: Props) {
  const [trackWidth, setTrackWidth] = useState(0);
  // 끄는 동안만 쓰는 값. 손을 떼면 부모의 값(value)으로 돌아간다.
  const [dragValue, setDragValue] = useState<number | null>(null);
  const trackWidthRef = useRef(0);
  const valueRef = useRef(value);
  const configRef = useRef({ minimumValue, maximumValue, onChange, onSlidingStart, onSlidingComplete });
  useEffect(() => {
    valueRef.current = value;
  }, [value]);
  useEffect(() => {
    configRef.current = { minimumValue, maximumValue, onChange, onSlidingStart, onSlidingComplete };
  }, [minimumValue, maximumValue, onChange, onSlidingStart, onSlidingComplete]);

  const handleLayout = (e: LayoutChangeEvent) => {
    trackWidthRef.current = e.nativeEvent.layout.width;
    setTrackWidth(e.nativeEvent.layout.width);
  };

  const updateFromFraction = (fraction: number) => {
    const config = configRef.current;
    const next = Math.round(config.minimumValue + Math.max(0, Math.min(1, fraction)) * (config.maximumValue - config.minimumValue));
    if (next === valueRef.current) return;
    // 리렌더를 기다리지 않고 손을 뗄 때 마지막 입력값을 확정한다.
    valueRef.current = next;
    setDragValue(next);
    config.onChange(next);
  };

  // gestureState.dx(제스처 시작점부터의 이동 거리)만으로 움직인다. 조상 뷰가 움직여도
  // locationX처럼 튀지 않는다(2026-09-02 실기기 피드백).
  const dragStartFractionRef = useRef(0);
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // 미리보기의 끌기 제스처가 가로채지 않게 한다.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        const { minimumValue: min, maximumValue: max, onSlidingStart: start } = configRef.current;
        dragStartFractionRef.current = (valueRef.current - min) / Math.max(1, max - min);
        setDragValue(valueRef.current);
        start?.();
      },
      onPanResponderMove: (_evt, gestureState) => {
        const width = trackWidthRef.current;
        if (width <= 0) return;
        updateFromFraction(dragStartFractionRef.current + gestureState.dx / width);
      },
      onPanResponderRelease: () => {
        setDragValue(null);
        configRef.current.onSlidingComplete?.(valueRef.current);
      },
      onPanResponderTerminate: () => {
        setDragValue(null);
        configRef.current.onSlidingComplete?.(valueRef.current);
      },
    })
  ).current;

  const shown = dragValue ?? value;
  const fraction = Math.max(0, Math.min(1, (shown - minimumValue) / Math.max(1, maximumValue - minimumValue)));
  const fillWidth = trackWidth * fraction;

  return (
    <View style={styles.hitArea} onLayout={handleLayout} {...panResponder.panHandlers}
      accessible accessibilityRole="adjustable" accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: minimumValue, max: maximumValue, now: shown, text: `${shown}%` }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={({ nativeEvent }) => {
        if (!['increment', 'decrement'].includes(nativeEvent.actionName)) return;
        const { minimumValue: min, maximumValue: max } = configRef.current;
        const next = valueRef.current + (nativeEvent.actionName === 'increment' ? 1 : -1);
        updateFromFraction((next - min) / Math.max(1, max - min));
        setDragValue(null);
        configRef.current.onSlidingComplete?.(valueRef.current);
      }}>
      <View style={styles.track}>
        <View style={[styles.fill, { width: fillWidth }]} />
      </View>
      <View style={[styles.thumb, { left: Math.max(0, fillWidth - 10) }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  // 손잡이를 정확히 짚지 않아도 잡히게 위아래 터치 영역을 넉넉히 둔다.
  hitArea: { justifyContent: 'center', paddingVertical: 14 },
  track: { height: 4, borderRadius: 2, backgroundColor: Colors.border, overflow: 'hidden' },
  fill: { height: 4, backgroundColor: Colors.accent },
  thumb: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.accent,
  },
});
