import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IDENTITY_SMOOTH, IDENTITY_STAMP, IDENTITY_TRANSFORM, RoutePreview } from '@/components/route-preview';
import { ThemedButton } from '@/components/ui';
import { InternalRunEntry } from '@/components/internal-run-entry';
import { PrivacyPolicyLink } from '@/components/privacy-policy-link';
import { SampleRunEntry } from '@/components/sample-run-entry';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { markConnectedOnce } from '@/lib/connection-store';
import { createSampleRun } from '@/lib/sample-run';
import type { Point } from '@/lib/route-projection';

// FRD: docs/specs/frd/run-record-selection.md §3 권한,
// docs/specs/frd/sample-record-experience.md §1 진입.
// 첫 실행은 실제 기록 불러오기와 건강 권한 없는 하트 체험을 안내한다.
// 일반 앱은 새 러닝을 측정하지 않으며, GPX 임포트는 제공하지 않는다.

const HEART_SAMPLE = createSampleRun();
const SAMPLE_LOOP: Point[] = HEART_SAMPLE.track.coordinates;

// 실기기 피드백(2026-09-03): "시안 html엔 여기 불빛 경로처럼 움직이게 돼 있는데
// 왜 여기는 없냐" — DesignSync로 프로젝트 파일 목록을 다시 보니 이 화면(S0)의
// 원본 목업(uploads/메추리 앱 시안 (오프라인).html)이 실제로 있었다(get_file로는
// 못 읽음 — 업로드 원본이라 API 대상이 아닌 듯). 지금까지는 홈 목록용으로 만든
// 정지 이미지 컴포넌트(RouteThumbnail, home-and-library FRD §2-1 "완성된 순간"
// 요구사항에 맞춘 것)를 여기서도 그냥 재사용하고 있었을 뿐, 이 화면 전용으로
// "애니메이션 없음"을 의도한 적은 없었다 — RoutePreview(애니메이션 프리셋)로
// 바꾼다.
//
// 렉 걱정에 대한 답: 이 화면엔 바텀시트·동시 제스처·다른 무거운 레이어가 전혀
// 없다 — 편집 화면(빠른데도 여러 레이어가 한 화면에서 동시에 움직여야 하는 곳)과
// 달리 "경로 하나만 조용히 도는" 제일 가벼운 경우다. light-runner는 이미 이번
// 세션에서 UI 스레드(Reanimated useFrameCallback)로 옮겨 놔서 JS 렌더링과
// 무관하게 네이티브에서 돈다 — 오히려 이 화면이 성능상 제일 안전한 자리.
const DEMO_RUN = HEART_SAMPLE.run;
// 각인은 이 화면 목적(연결 전 안내)과 무관 — 전부 꺼서 아무것도 안 그리게 한다.
const DEMO_STAMP = {
  ...IDENTITY_STAMP,
  enabled: { distance: false, time: false, pace: false, heartRate: false, date: false, place: false },
};

export default function ConnectScreen() {
  const handleConnect = async () => {
    // §1-3: 권한은 "쓰려는 순간"에 묻는다 — 실제 요청은 기록 선택 화면 진입 시
    // 그 화면이 스스로 한다(record-selection.tsx). 여기선 "다시 이 화면을 보여줄
    // 필요 없다"만 기록하고 홈으로 돌아간다.
    //
    // 기록 선택으로 바로 넘기지 않는다 — 홈(index.tsx)이 이미 이 화면 진입 전에
    // router.replace('/connect')로 스택에서 빠져 있어서, 여기서 또 replace로
    // 기록 선택을 밀어 넣으면 스택에 홈이 아예 없어져 버린다("GO_BACK not handled"
    // 경고의 원인이었다). 홈은 항상 "결과물 목록"(FRD 홈과 보관함 §1)이라 코어
    // 루프의 시작점은 거기서 "새로 만들기"를 눌러야 한다.
    await markConnectedOnce();
    router.replace('/');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.artWrap}>
        <RoutePreview
          points={SAMPLE_LOOP}
          preset="light-runner"
          transform={IDENTITY_TRANSFORM}
          smoothOptions={IDENTITY_SMOOTH}
          run={DEMO_RUN}
          stampConfig={DEMO_STAMP}
          isInteracting={false}
          playing
          viewWidth={ART_SIZE}
          viewHeight={ART_SIZE}
        />
      </View>

      <View style={styles.body}>
        <Text style={styles.title}>{'달린 길이\n그림으로 남는다'}</Text>
        <Text style={styles.subtitle}>
          이미 기록해 둔 러닝을 불러온다. 이 앱은 달리기를 새로 기록하지 않는다.
        </Text>

        <View style={styles.actions}>
          <ThemedButton title="러너리 시작하기" onPress={handleConnect} />
          <SampleRunEntry fromWelcome />
          <InternalRunEntry />
          <PrivacyPolicyLink />
        </View>
      </View>
    </SafeAreaView>
  );
}

const ART_SIZE = 300;

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.bg },
  artWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: 30, paddingBottom: Spacing.xl, gap: Spacing.md },
  title: {
    fontFamily: Fonts.sansBold,
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: -0.7,
    color: Colors.text,
  },
  subtitle: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    lineHeight: 20,
    color: Colors.textMuted,
  },
  actions: { gap: Spacing.sm, marginTop: Spacing.sm },
});
