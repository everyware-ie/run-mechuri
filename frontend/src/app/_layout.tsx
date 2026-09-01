import { SpaceGrotesk_500Medium, SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk';
import { JetBrainsMono_500Medium, JetBrainsMono_700Bold } from '@expo-google-fonts/jetbrains-mono';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { View } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { Colors } from '@/constants/theme';
import { CreationFlowProvider } from '@/state/creation-flow';

SplashScreen.preventAutoHideAsync();

// 2026-08-25 결정: 하단 탭을 쓰지 않는다. 홈 하나에 선형 루프.
// [홈] → [기록 선택] → [배경 선택] → [편집] → [공유] (v0)
//
// 디자인 "1a 야간 네온"(결정문 확정) — 다크 고정. 라이트/다크 전환 없음.
// AnimatedSplashOverlay가 자체적으로 스플래시를 내리므로, 폰트 로딩 중에는
// 빈 다크 화면만 보여준다(깜빡임 없이 자연스럽게 이어짐).

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    SpaceGrotesk_500Medium,
    SpaceGrotesk_700Bold,
    JetBrainsMono_500Medium,
    JetBrainsMono_700Bold,
  });

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: Colors.bg }} />;
  }

  return (
    <ThemeProvider value={DarkTheme}>
      <AnimatedSplashOverlay />
      <CreationFlowProvider>
        <Stack
          screenOptions={{
            headerShown: true,
            headerStyle: { backgroundColor: Colors.bg },
            headerTintColor: Colors.text,
            headerTitleStyle: { fontFamily: 'SpaceGrotesk_500Medium' },
            contentStyle: { backgroundColor: Colors.bg },
          }}>
          <Stack.Screen name="index" options={{ title: '메추리 런' }} />
          <Stack.Screen name="record-selection" options={{ title: '기록 선택' }} />
          <Stack.Screen name="background-selection" options={{ title: '배경 선택' }} />
          <Stack.Screen name="edit" options={{ title: '편집' }} />
          <Stack.Screen name="share" options={{ title: '공유' }} />
          <Stack.Screen name="result/[id]" options={{ title: '결과물' }} />
          <Stack.Screen name="dev-test" options={{ title: '개발용 확인' }} />
        </Stack>
      </CreationFlowProvider>
    </ThemeProvider>
  );
}
