import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { CreationFlowProvider } from '@/state/creation-flow';

SplashScreen.preventAutoHideAsync();

// 2026-08-25 결정: 하단 탭을 쓰지 않는다. 홈 하나에 선형 루프.
// [홈] → [기록 선택] → [배경 선택] → [공유] (v0는 편집 생략)

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      <CreationFlowProvider>
        <Stack screenOptions={{ headerShown: true }}>
          <Stack.Screen name="index" options={{ title: '메추리 런' }} />
          <Stack.Screen name="record-selection" options={{ title: '기록 선택' }} />
          <Stack.Screen name="background-selection" options={{ title: '배경 선택' }} />
          <Stack.Screen name="share" options={{ title: '공유' }} />
          <Stack.Screen name="dev-test" options={{ title: '개발용 확인' }} />
        </Stack>
      </CreationFlowProvider>
    </ThemeProvider>
  );
}
