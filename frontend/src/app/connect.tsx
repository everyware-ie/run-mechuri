import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IDENTITY_SMOOTH, IDENTITY_STAMP, IDENTITY_TRANSFORM, RoutePreview } from '@/components/route-preview';
import { ThemedButton } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { markConnectedOnce } from '@/lib/connection-store';
import type { Point } from '@/lib/route-projection';

import type { RunRecord } from '../../modules/health-kit-bridge/src/HealthKitBridge.types';

// FRD: docs/specs/frd/run-record-selection.md §1·§3, docs/specs/frd/common-rules.md §1-3
//
// "3안" 시안 S0 — 앱을 한 번도 연결 안 한 채 처음 열었을 때 뜨는 화면. 이 앱은 러닝을
// 새로 기록하지 않고 이미 기록해 둔 것을 불러오기만 한다는 것과, 그 경로를 유일한
// 관문(HealthKit)으로 안내한다.
//
// 시안엔 "GPX 파일 직접 넣기" 버튼이 있지만 GPX 임포트는 2026-08-25에 제외
// 확정됐다(run-record-selection FRD §1, PRD §6). 그 버튼은 넣지 않는다 — MVP의
// 출처는 HealthKit 하나뿐이라 "메추리 런 시작하기"(2026-09-02 문구 변경, 원래
// "러닝 앱 연결하기") 하나가 유일한 경로다.
//
// [확인 필요] 이 화면 자체는 승인된 FRD 문서 어디에도 화면 단위로 정의돼 있지 않다.
// run-record-selection FRD §3은 "권한은 목록을 열려 할 때 묻는다"만 정하고, 그 직전에
// 이런 설명 화면을 하나 더 두는 것은 시안(승인됨)에는 있지만 문서화는 안 된 상태다.
// phs00 확인 후 FRD에 반영 필요.

const SAMPLE_LOOP: Point[] = buildSampleLoop();

function buildSampleLoop(): Point[] {
  const center = { latitude: 37.5665, longitude: 126.978 };
  const lonScale = Math.cos((center.latitude * Math.PI) / 180);
  const points: Point[] = [];
  const steps = 48;
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const r = 0.006 + 0.0016 * Math.sin(3 * t) + 0.001 * Math.cos(5 * t + 1) + 0.0006 * Math.sin(9 * t);
    points.push({
      latitude: center.latitude + r * Math.sin(t) * 0.92,
      longitude: center.longitude + (r * Math.cos(t)) / lonScale,
    });
  }
  return points;
}

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
const DEMO_RUN: RunRecord = {
  id: 'demo',
  date: new Date().toISOString(),
  distanceMeters: 5230,
  durationSeconds: 1694,
  averagePaceSecPerKm: 324,
  hasRoute: true,
};
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
          <ThemedButton title="메추리 런 시작하기" onPress={handleConnect} />
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
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: -0.7,
    color: Colors.text,
  },
  subtitle: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 13,
    lineHeight: 20,
    color: Colors.textMuted,
  },
  actions: { gap: Spacing.sm, marginTop: Spacing.sm },
});
