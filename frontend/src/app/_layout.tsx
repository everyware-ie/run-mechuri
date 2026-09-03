import { SpaceGrotesk_500Medium, SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk';
import { JetBrainsMono_500Medium, JetBrainsMono_700Bold } from '@expo-google-fonts/jetbrains-mono';
import { NotoSansKR_500Medium, NotoSansKR_700Bold } from '@expo-google-fonts/noto-sans-kr';
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
    // 실기기 피드백(2026-09-03): SpaceGrotesk·JetBrains Mono 둘 다 한글 글리프가
    // 없어서, 각인 "한 줄 문구"에 한글을 쓰면 조용히 시스템 폰트로 폴백돼 숫자
    // 부분(SpaceGrotesk)과 글씨체가 달라 보였다. 한글 문구 전용으로 추가.
    NotoSansKR_500Medium,
    NotoSansKR_700Bold,
  });

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: Colors.bg }} />;
  }

  return (
    <ThemeProvider value={DarkTheme}>
      <AnimatedSplashOverlay />
      <CreationFlowProvider>
        {/* 시안대로 네이티브 내비 바를 쓰지 않는다 — 각 화면이 ScreenHeader로 상단 행을 직접 그린다. */}
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: Colors.bg },
            // 실기기 피드백(2026-09): 화면 중앙에서 오른쪽으로 밀어도 뒤로가기가
            // 됐다 — 편집 화면처럼 오른쪽으로 끄는 제스처(드로잉 이동, 슬라이더)가
            // 많은 화면에서 특히 문제였다. fullScreenGestureEnabled가 기본으로
            // 켜져 있으면(react-native-screens) 화면 전체가 스와이프백 대상이
            // 된다 — 꺼서 진짜 왼쪽 가장자리에서 시작한 스와이프만 반응하게 한다.
            gestureEnabled: true,
            fullScreenGestureEnabled: false,
            gestureResponseDistance: { start: 24 },
          }}
        />
      </CreationFlowProvider>
    </ThemeProvider>
  );
}
