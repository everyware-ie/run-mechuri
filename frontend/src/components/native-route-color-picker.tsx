import { requireNativeViewManager } from 'expo-modules-core';
import type { ViewProps } from 'react-native';

type PickerProps = ViewProps & { color: string; onColorChange: (event: { nativeEvent: { color: string } }) => void };
export default requireNativeViewManager<PickerProps>('RouteRenderer', 'RouteColorPickerView');
