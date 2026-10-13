import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, AppState, FlatList, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppPermissionsLink } from '@/components/internal-run-entry';
import { ScreenHeader } from '@/components/screen-header';
import { SampleRunEntry } from '@/components/sample-run-entry';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { formatDistanceKm, formatDuration, formatHeartRate, formatPace } from '@/lib/stamp-format';
import { useCreationFlow } from '@/state/creation-flow';

import HealthKitBridge from '../../modules/health-kit-bridge/src/HealthKitBridgeModule';
import type { RunRecord } from '../../modules/health-kit-bridge/src/HealthKitBridge.types';

// FRD: docs/specs/frd/run-record-selection.md
// §3: 응답하지 않은 권한만 요청한다. §2-2: 좌표 없는 기록은 목록에서 빼고 집계로 알린다.
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

type LoadState = 'loading' | 'error' | 'ready';

export default function RecordSelectionScreen() {
  const [state, setState] = useState<LoadState>('loading');
  const [settingsError, setSettingsError] = useState('');
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [loadingRouteFor, setLoadingRouteFor] = useState<string | null>(null);
  const selectionLock = useRef(false);
  const [selecting, setSelecting] = useState(false);
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());
  const { setSelectedRun } = useCreationFlow();

  const reload = useRef<(() => Promise<void>) | null>(null);
  const refresh = () => { void reload.current?.(); };
  useFocusEffect(useCallback(() => {
    let alive = true, request = 0, loading = false, retryAfterLoad = false;
    const load = async (requestPermission = false) => {
      if (loading) { retryAfterLoad = true; return; }
      if (!alive || AppState.currentState !== 'active') return;
      loading = true;
      const current = ++request;
      const valid = () => alive && current === request && AppState.currentState === 'active';
      setState('loading');
      try {
        // The native API asks only for unanswered types. A settings return is
        // always a data-only refresh and cannot trigger another permission sheet.
        if (requestPermission && !await HealthKitBridge.requestAuthorization()) throw new Error('Authorization request failed');
        if (!valid()) return;
        const outdoorRuns = await HealthKitBridge.getOutdoorRuns();
        if (!valid()) return;
        setRuns(outdoorRuns); setFailedIds(new Set()); setState('ready');
      } catch { if (valid()) setState('error'); }
      finally {
        loading = false;
        if (retryAfterLoad && alive) { retryAfterLoad = false; void load(); }
      }
    };
    reload.current = () => load(true);
    void load(true);
    const subscription = AppState.addEventListener('change', status => {
      if (status === 'active') void load(); else request++;
    });
    return () => { alive = false; request++; reload.current = null; subscription.remove(); };
  }, []));

  const claimSelection = () => {
    if (selectionLock.current) return false;
    selectionLock.current = true; setSelecting(true); return true;
  };
  const releaseSelection = () => { selectionLock.current = false; setSelecting(false); };
  const sampleEntry = <View style={styles.sampleEntry}><SampleRunEntry disabled={selecting}
    claimSelection={claimSelection} releaseSelection={releaseSelection} /></View>;
  const handleSelect = async (run: RunRecord) => {
    if (!run.hasRoute || !claimSelection()) return;
    try {
      setLoadingRouteFor(run.id);
      // §5: 고른 다음에만 실제 좌표를 가져온다.
      const track = await HealthKitBridge.getRoute(run.id);
      await setSelectedRun(run, track);
      router.push('/background-selection');
    } catch {
      // §6: 좌표를 읽다 실패하면 목록에 머무른다. 그 줄에 "다시 시도"를 남긴다.
      setFailedIds((prev) => new Set(prev).add(run.id));
    } finally {
      setLoadingRouteFor(null);
      releaseSelection();
    }
  };

  // 배경 선택·편집 화면과 같은 이유(2026-09-02) — Text onPress 대신 Pressable
  // hitSlop으로 탭 영역을 넓힌다.
  const header = (
    <ScreenHeader
      title="러닝 기록"
      right={
        <Pressable onPress={refresh} hitSlop={12}>
          <Text style={styles.refresh}>↻</Text>
        </Pressable>
      }
    />
  );

  if (state === 'loading') {
    return (
      <SafeAreaView style={styles.safeArea}>
        {header}
        {sampleEntry}
        <View style={styles.center}>
          <ActivityIndicator color={Colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  if (state === 'error') {
    return (
      <SafeAreaView style={styles.safeArea}>
        {header}
        {sampleEntry}
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>기록을 불러오지 못했어요</Text>
          <AppPermissionsLink />
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
        {sampleEntry}
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>실외 러닝 기록이 없어요</Text>
          <Text style={styles.emptyBody}>
            아직 기록이 없거나 건강 데이터 접근이 허용되지 않았을 수 있어요. 한 번 뛰고 오시거나
            설정에서 권한을 확인해주세요.
          </Text>
          <Pressable accessibilityRole="button" onPress={() => { setSettingsError(''); void Linking.openSettings().catch(() => setSettingsError('설정을 열지 못했어요. 아이폰 설정 → 앱 → Runary에서 건강 데이터 접근을 확인해 주세요.')); }} style={styles.retryBtn}><Text style={styles.retryBtnText}>설정에서 권한 확인</Text></Pressable>
          {settingsError ? <Text style={styles.emptyBody}>{settingsError}</Text> : null}
          <AppPermissionsLink />
        </View>
      </SafeAreaView>
    );
  }

  // 2026-09-16 결정 — 경로가 없는 기록을 목록에서 뺀다(예전엔 점선으로 보여주되
  // 고를 수 없게만 했다). 그 결과 "기록은 있는데 전부 좌표가 없는" 세 번째
  // 빈 화면이 새로 생긴다 — 위 "기록이 아예 없음"과는 다른 원인이라 걸러낸
  // 기록 수를 알려주는 별도 문구를 둔다.
  const visibleRuns = runs.filter((r) => r.hasRoute);

  if (visibleRuns.length === 0) {
    return (
      <SafeAreaView style={styles.safeArea}>
        {header}
        {sampleEntry}
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>좌표가 있는 기록이 없어요</Text>
          <Text style={styles.emptyBody}>
            러닝 {runs.length}건을 찾았지만 좌표가 저장되어 있지 않아 목록에서 걸렀어요. 실외에서
            GPS로 기록한 러닝인지 확인해주세요.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      {header}
      {sampleEntry}
      <Text style={styles.sourceLabel}>APPLE 건강 · 실외 러닝</Text>
      <FlatList
        data={visibleRuns}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => {
          const failed = failedIds.has(item.id);
          const selectable = !failed;
          const loading = loadingRouteFor === item.id;
          return (
            <Pressable
              disabled={!selectable || selecting}
              onPress={() => handleSelect(item)}
              style={[styles.row, !selectable && styles.rowDashed, failed && styles.rowFailed]}>
              <View style={[styles.thumb, failed && styles.thumbFailed]}>
                <Text style={[styles.thumbGlyph, failed && styles.thumbGlyphFailed]}>
                  {failed ? '!' : '〜'}
                </Text>
              </View>

              <View style={styles.rowMain}>
                <Text style={[styles.rowTitle, !selectable && styles.rowTitleMuted]}>
                  {formatRunTitle(item.date)}
                </Text>
                <Text style={styles.rowMeta}>
                  {[
                    formatDistanceKm(item.distanceMeters),
                    !failed ? formatDuration(item.durationSeconds) : null,
                    selectable ? formatPace(item.averagePaceSecPerKm) : null,
                    selectable && item.averageHeartRate ? formatHeartRate(item.averageHeartRate) : null,
                    failed ? '좌표를 불러올 수 없음' : null,
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
          runs.length > visibleRuns.length ? (
            <Text style={styles.footerNote}>
              좌표가 없는 기록 {runs.length - visibleRuns.length}건은 목록에서 걸렀어요.
            </Text>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  sampleEntry: { paddingHorizontal: 24, paddingBottom: 16 },
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
  emptyTitle: { fontFamily: Fonts.sansBold, fontSize: 16, color: Colors.text, textAlign: 'center' },
  emptyBody: { fontFamily: Fonts.sans, color: Colors.textMuted, textAlign: 'center', fontSize: 13 },
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
  retryBtnText: { fontFamily: Fonts.sans, fontSize: 12, color: Colors.text },
  sourceLabel: {
    fontFamily: Fonts.sans,
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
  thumbGlyph: { fontFamily: Fonts.sans, fontSize: 18, color: Colors.textMuted },
  thumbGlyphFailed: { color: Colors.accent },
  rowMain: { flex: 1, gap: 4 },
  rowTitle: { fontFamily: Fonts.sansBold, fontSize: 15, color: Colors.text },
  rowTitleMuted: { color: Colors.textMuted },
  rowMeta: { fontFamily: Fonts.sans, fontSize: 10.5, color: Colors.textMuted, lineHeight: 16 },
  retryInline: { fontFamily: Fonts.sans, fontSize: 10, color: Colors.accent },
  footerNote: {
    fontFamily: Fonts.sans,
    fontSize: 11,
    lineHeight: 17,
    color: Colors.textMuted,
    paddingTop: 18,
  },
});
