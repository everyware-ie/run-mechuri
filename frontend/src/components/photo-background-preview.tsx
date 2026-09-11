import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { constrainPhotoCrop, type PhotoCrop } from '@/lib/photo-crop';

type Props = {
  uri: string;
  imageWidth: number;
  imageHeight: number;
  width: number;
  height: number;
  initialCrop: PhotoCrop;
  onChange: (crop: PhotoCrop) => void;
  children?: ReactNode;
};

export function PhotoBackgroundPreview({ uri, imageWidth, imageHeight, width, height, initialCrop, onChange, children }: Props) {
  const crop = useSharedValue(initialCrop);
  const start = useSharedValue(initialCrop);
  const focal = useSharedValue({ x: 0, y: 0 });
  const baseScale = Math.max(width / imageWidth, height / imageHeight);
  const imageStyle = useAnimatedStyle(() => {
    const scale = baseScale * crop.value.zoom;
    return {
      width: imageWidth * scale,
      height: imageHeight * scale,
      left: width / 2 - crop.value.centerX * imageWidth * scale,
      top: height / 2 - crop.value.centerY * imageHeight * scale,
    };
  });
  const pan = Gesture.Pan().maxPointers(1)
    .onStart(() => { start.value = crop.value; })
    .onUpdate(e => {
      const scale = baseScale * start.value.zoom;
      crop.value = constrainPhotoCrop(imageWidth, imageHeight, {
        zoom: start.value.zoom,
        centerX: start.value.centerX - e.translationX / scale / imageWidth,
        centerY: start.value.centerY - e.translationY / scale / imageHeight,
      });
    })
    .onFinalize(() => { scheduleOnRN(onChange, crop.value); });
  const pinch = Gesture.Pinch()
    .onStart(e => {
      start.value = crop.value;
      const scale = baseScale * crop.value.zoom;
      focal.value = {
        x: crop.value.centerX * imageWidth + (e.focalX - width / 2) / scale,
        y: crop.value.centerY * imageHeight + (e.focalY - height / 2) / scale,
      };
    })
    .onUpdate(e => {
      const zoom = Math.max(1, Math.min(6, start.value.zoom * e.scale));
      const scale = baseScale * zoom;
      crop.value = constrainPhotoCrop(imageWidth, imageHeight, {
        zoom,
        centerX: (focal.value.x - (e.focalX - width / 2) / scale) / imageWidth,
        centerY: (focal.value.y - (e.focalY - height / 2) / scale) / imageHeight,
      });
    })
    .onFinalize(() => { scheduleOnRN(onChange, crop.value); });
  return (
    <GestureDetector gesture={Gesture.Simultaneous(pan, pinch)}>
      <Animated.View style={{ width, height, overflow: 'hidden' }} accessibilityLabel="배경 사진. 드래그로 이동하고 두 손가락으로 크기를 조절하세요.">
        <Animated.Image source={{ uri }} style={[styles.image, imageStyle]} resizeMode="cover" />
        <View style={StyleSheet.absoluteFill} pointerEvents="none">{children}</View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({ image: { position: 'absolute' } });
