import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/screen-header';
import { Colors, Spacing } from '@/constants/theme';
import { formatDistanceKm, formatDuration, formatHeartRate, formatPace } from '@/lib/stamp-format';
import { useCreationFlow } from '@/state/creation-flow';

import HealthKitBridge from '../../modules/health-kit-bridge/src/HealthKitBridgeModule';
import type { RunRecord } from '../../modules/health-kit-bridge/src/HealthKitBridge.types';

// FRD: docs/specs/frd/run-record-selection.md
// §3: 목록을 열 때 권한을 묻는다. §2-2: 좌표 없는 기록도 보여주되 고를 수 없다고 알린다(숨기지 않음).
// §4: 기록이 하나도 없을 때 빈 상태. §5: 좌표는 고른 다음에만 가져온다.
// 디자인: "3안" 시안 S3 — 날짜 제목 + 메타 한 줄, 좌표 없음/불러오기 실패는 점선으로 구분.
// 시안엔 경로 썸네일이 있지만 §5(좌표는 고른 뒤 조회) 때문에 목록에선 안 그린다 — 자리표시 아이콘만.

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function formatRunTitle(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const wd = WEEKDAYS[d.getDay()];
  const h = d.getHours();
  const period = h < 5 ? '새벽' : h < 11 ? '아침' : h < 17 ? '낮' : h < 21 ? '저녁' : '밤';
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${wd}) ${period}`;
}

type LoadState = 'loading' | 'denied' | 'error' | 'ready';

export default function RecordSelectionScreen() {
  const [state, setState] = useState<LoadState>('loading');
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [loadingRouteFor, setLoadingRouteFor] = useState<string | null>(null);
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());
  const { setSelectedRun } = useCreationFlow();

  const refresh = useCallback(async () => {
    setState('loading');
    try {
      const granted = await HealthKitBridge.requestAuthorization();
      if (!granted) {
        setState('denied');
        return;
      }
      const outdoorRuns = await HealthKitBridge.getOutdoorRuns();
      setRuns(outdoorRuns);
      setFailedIds(new Set());
      setState('ready');
    } catch {
      setState('error');
    }
  }, []);

  // 최초 로드 — 인라인 IIFE(원래 패턴). refresh와 로직이 겹치지만 이 형태여야
  // "effect 안에서 동기 setState" 린트가 안 걸린다.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const granted = await HealthKitBridge.requestAuthorization();
        if (cancelled) return;
        if (!granted) {
          setState('denied');
          return;
        }
        const outdoorRuns = await HealthKitBridge.getOutdoorRuns();
        if (cancelled) return;
        setRuns(outdoorRuns);
        setState('ready');
      } catch {
        if (!cancelled) setState('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSelect = async (run: RunRecord) => {
    if (!run.hasRoute || loadingRouteFor) return;
    try {
      setLoadingRouteFor(run.id);
      // §5: 고른 다음에만 실제 좌표를 가져온다.
      const track = await HealthKitBridge.getRoute(run.id);
      setSelectedRun(run, track);
      router.push('/background-selection');
    } catch {
      // §6: 좌표를 읽다 실패하면 목록에 머무른다. 그 줄에 "다시 시도"를 남긴다.
      setFailedIds((prev) => new Set(prev).add(run.id));
    } finally {
      setLoadingRouteFor(null);
    }
  };

  const header = <ScreenHeader title="러닝 기록" right={<Text onPress={refresh} style={styles.refresh}>↻</Text>} />;

  if (state === 'loading') {
    return (
      <SafeAreaView style={styles.safeArea}>
        {header}
        <View style={styles.center}>
          <ActivityIndicator color={Colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  if (state === 'denied') {
    return (
      <SafeAreaView style={styles.safeArea}>
        {header}
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>건강 데이터 접근이 필요해요</Text>
          <Text style={styles.emptyBody}>설정에서 권한을 허용한 뒤 다시 열어주세요.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (state === 'error') {
    return (
      <SafeAreaView style={styles.safeArea}>
        {header}
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>기록을 불러오지 못했어요</Text>
          <Pressable onPress={refresh} style={styles.retryBtn}>
            <Text style={styles.retryBtnText}>다시 시도</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (runs.length === 0) {
    return (
      <SafeAreaView style={styles.safeArea}>
        {header}
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>실외 러닝 기록이 없어요</Text>
          <Text style={styles.emptyBody}>
            아직 기록이 없거나 건강 데이터 접근이 허용되지 않았을 수 있어요. 한 번 뛰고 오시거나
            설정에서 권한을 확인해주세요.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      {header}
      <Text style={styles.sourceLabel}>APPLE 건강 · 실외 러닝</Text>
      <FlatList
        data={runs}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => {
          const failed = failedIds.has(item.id);
          const selectable = item.hasRoute && !failed;
          const loading = loadingRouteFor === item.id;
          return (
            <Pressable
              disabled={!selectable || loadingRouteFor !== null}
              onPress={() => handleSelect(item)}
              style={[styles.row, !selectable && styles.rowDashed, failed && styles.rowFailed]}>
              <View style={[styles.thumb, failed && styles.thumbFailed]}>
                <Text style={[styles.thumbGlyph, failed && styles.thumbGlyphFailed]}>
                  {failed ? '!' : item.hasRoute ? '〜' : '—'}
                </Text>
              </View>

              <View style={styles.rowMain}>
                <Text style={[styles.rowTitle, !selectable && styles.rowTitleMuted]}>
                  {formatRunTitle(item.date)}
                </Text>
                <Text style={styles.rowMeta}>
                  {[
                    formatDistanceKm(item.distanceMeters),
                    !failed && item.hasRoute ? formatDuration(item.durationSeconds) : null,
                    selectable ? formatPace(item.averagePaceSecPerKm) : null,
                    selectable && item.averageHeartRate ? formatHeartRate(item.averageHeartRate) : null,
                    failed ? '좌표를 불러올 수 없음' : !item.hasRoute ? '좌표가 저장되어 있지 않음' : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>

              {loading && <ActivityIndicator size="small" color={Colors.accent} />}
              {failed && !loading && <Text style={styles.retryInline}>다시 시도</Text>}
            </Pressable>
          );
        }}
        ListFooterComponent={
          <Text style={styles.footerNote}>
            실내 러닝은 이 목록에 오지 않아요. 점선은 보이지만 고를 수 없는 상태예요.
          </Text>
        }
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
    gap: Spacing.sm,
  },
  refresh: { fontSize: 18, color: Colors.textMuted },
  emptyTitle: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 16, color: Colors.text, textAlign: 'center' },
  emptyBody: { fontFamily: 'SpaceGrotesk_500Medium', color: Colors.textMuted, textAlign: 'center', fontSize: 13 },
  retryBtn: {
    marginTop: Spacing.sm,
    paddingHorizontal: 18,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryBtnText: { fontFamily: 'SpaceGrotesk_500Medium', fontSize: 12, color: Colors.text },
  sourceLabel: {
    fontFamily: 'JetBrainsMono_500Medium',
    fontSize: 10,
    letterSpacing: 1.6,
    color: Colors.textMuted,
    paddingHorizontal: 24,
    paddingBottom: 12,
  },
  list: { paddingHorizontal: 24, paddingBottom: 40, gap: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bgCard,
  },
  rowDashed: { backgroundColor: 'transparent', borderStyle: 'dashed', borderColor: Colors.borderStrong },
  rowFailed: { borderColor: Colors.accent },
  thumb: {
    width: 52,
    height: 52,
    borderRadius: 12,
    backgroundColor: 'rgba(237,241,245,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbFailed: { backgroundColor: 'rgba(255,90,43,0.10)' },
  thumbGlyph: { fontFamily: 'SpaceGrotesk_500Medium', fontSize: 18, color: Colors.textMuted },
  thumbGlyphFailed: { color: Colors.accent },
  rowMain: { flex: 1, gap: 4 },
  rowTitle: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 15, color: Colors.text },
  rowTitleMuted: { color: Colors.textMuted },
  rowMeta: { fontFamily: 'JetBrainsMono_500Medium', fontSize: 10.5, color: Colors.textMuted, lineHeight: 16 },
  retryInline: { fontFamily: 'JetBrainsMono_500Medium', fontSize: 10, color: Colors.accent },
  footerNote: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 11,
    lineHeight: 17,
    color: Colors.textMuted,
    paddingTop: 18,
  },
});
