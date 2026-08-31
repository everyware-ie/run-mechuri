import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { useCreationFlow } from '@/state/creation-flow';

import HealthKitBridge from '../../modules/health-kit-bridge/src/HealthKitBridgeModule';
import type { RunRecord } from '../../modules/health-kit-bridge/src/HealthKitBridge.types';

// FRD: docs/specs/frd/run-record-selection.md
// §3: 목록을 열려 할 때 권한을 묻는다 (화면 진입 시점).
// §2-2: 좌표 없는 기록도 보여주되 고를 수 없다고 알린다 (숨기지 않음).
// §4: 기록이 하나도 없을 때 빈 상태.
// 디자인: "1a 야간 네온"

type LoadState = 'loading' | 'denied' | 'error' | 'ready';

export default function RecordSelectionScreen() {
  const [state, setState] = useState<LoadState>('loading');
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [loadingRouteFor, setLoadingRouteFor] = useState<string | null>(null);
  const { setSelectedRun } = useCreationFlow();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const granted = await HealthKitBridge.requestAuthorization();
        if (!granted) {
          if (!cancelled) setState('denied');
          return;
        }
        const outdoorRuns = await HealthKitBridge.getOutdoorRuns();
        if (!cancelled) {
          setRuns(outdoorRuns);
          setState('ready');
        }
      } catch {
        if (!cancelled) setState('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSelect = async (run: RunRecord) => {
    // §2-2: 좌표 없는 기록은 고를 수 없다.
    if (!run.hasRoute) return;
    try {
      setLoadingRouteFor(run.id);
      // §5: 고른 다음에만 실제 좌표를 가져온다.
      const track = await HealthKitBridge.getRoute(run.id);
      setSelectedRun(run, track);
      router.push('/background-selection');
    } catch {
      // §6: 좌표를 읽다 실패하면 목록으로 돌아온다(그대로 머무름). 다른 기록을 고를 수 있다.
    } finally {
      setLoadingRouteFor(null);
    }
  };

  if (state === 'loading') {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={Colors.accent} />
      </SafeAreaView>
    );
  }

  if (state === 'denied') {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.emptyTitle}>건강 데이터 접근이 필요해요</Text>
        <Text style={styles.emptyBody}>설정에서 권한을 허용한 뒤 다시 열어주세요.</Text>
      </SafeAreaView>
    );
  }

  if (state === 'error') {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.emptyTitle}>기록을 불러오지 못했어요</Text>
      </SafeAreaView>
    );
  }

  // §4: 기록이 하나도 없을 때 (권한 거부와 실제 없음을 앱은 구분 못 함, 공통 규칙 §1-3)
  if (runs.length === 0) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.emptyTitle}>실외 러닝 기록이 없어요</Text>
        <Text style={styles.emptyBody}>
          아직 기록이 없거나, 건강 데이터 접근이 허용되지 않았을 수 있어요. 한 번 뛰고 오시거나
          설정에서 권한을 확인해주세요.
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        data={runs}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Pressable
            disabled={!item.hasRoute || loadingRouteFor !== null}
            onPress={() => handleSelect(item)}>
            <Card style={[styles.row, !item.hasRoute && styles.rowDisabled]}>
              <View style={styles.rowMain}>
                <Text style={styles.rowDistance}>{(item.distanceMeters / 1000).toFixed(2)}km</Text>
                <Text style={styles.rowMeta}>
                  {item.date.slice(0, 10)} · {Math.round(item.durationSeconds / 60)}분
                  {item.averageHeartRate ? ` · ${Math.round(item.averageHeartRate)}bpm` : ''}
                </Text>
              </View>
              {!item.hasRoute && <Text style={styles.noRoute}>좌표 없음</Text>}
              {loadingRouteFor === item.id && <ActivityIndicator size="small" color={Colors.accent} />}
            </Card>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.bg },
  center: {
    flex: 1,
    backgroundColor: Colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
    gap: Spacing.xs,
  },
  emptyTitle: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 16, color: Colors.text, textAlign: 'center' },
  emptyBody: { fontFamily: 'SpaceGrotesk_500Medium', color: Colors.textMuted, textAlign: 'center', fontSize: 13 },
  list: { padding: Spacing.md, gap: Spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  rowDisabled: { opacity: 0.5 },
  rowMain: { gap: 4 },
  rowDistance: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 18, color: Colors.text },
  rowMeta: { fontFamily: 'JetBrainsMono_500Medium', fontSize: 11, color: Colors.textMuted },
  noRoute: { fontFamily: 'JetBrainsMono_500Medium', color: Colors.accent, fontSize: 10 },
});
