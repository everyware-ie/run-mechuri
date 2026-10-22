import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, AppState, FlatList, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppPermissionsLink } from '@/components/internal-run-entry';
import { ScreenHeader } from '@/components/screen-header';
import { SampleRunEntry } from '@/components/sample-run-entry';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { formatDistanceKm, formatDuration, formatHeartRate, formatPace } from '@/lib/stamp-format';
import { mergeRunRecords, runaryRecord, runaryRecordID, runaryTrack } from '@/lib/runary-records';
import { Tracking, trackingEnabled } from '../../modules/run-tracking/src/RunTracking';
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
  const ownAvailable = trackingEnabled && Tracking?.editorRoutes === true;
  const [ownState, setOwnState] = useState<LoadState>(ownAvailable ? 'loading' : 'ready');
  const [ownRuns, setOwnRuns] = useState<RunRecord[]>([]);
  const [damagedCount, setDamagedCount] = useState(0);
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [loadingRouteFor, setLoadingRouteFor] = useState<string | null>(null);
  const selectionLock = useRef(false);
  const selectionEpoch = useRef(0);
  const focused = useRef(false);
  const [selecting, setSelecting] = useState(false);
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());
  const { setSelectedRun } = useCreationFlow();

  const reload = useRef<(() => Promise<void>) | null>(null);
  const refresh = () => { void reload.current?.(); };
  useFocusEffect(useCallback(() => {
    focused.current = true;
    const cancelSelection = () => {
      selectionEpoch.current++;
      selectionLock.current = false;
      setSelecting(false); setLoadingRouteFor(null);
    };
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
    let ownRequest = 0;
    const loadOwn = async () => {
      if (!ownAvailable || !alive || AppState.currentState !== 'active') return;
      const token = ++ownRequest;
      const valid = () => alive && token === ownRequest && AppState.currentState === 'active';
      setOwnState('loading');
      try {
        const result = await Tracking!.records();
        if (!valid()) return;
        setOwnRuns(result.records.filter(run => run.status === 'completed').map(runaryRecord));
        setDamagedCount(result.damaged.length); setOwnState('ready');
      } catch { if (valid()) setOwnState('error'); }
    };
    reload.current = async () => { await Promise.all([load(true), loadOwn()]); };
    void load(true); void loadOwn();
    const subscription = AppState.addEventListener('change', status => {
      if (status === 'active') { void load(); void loadOwn(); }
      else { request++; ownRequest++; cancelSelection(); }
    });
    return () => { focused.current = false; cancelSelection(); alive = false; request++; reload.current = null; subscription.remove(); };
  }, [ownAvailable]));

  const claimSelection = () => {
    if (!focused.current || selectionLock.current) return false;
    selectionEpoch.current++;
    selectionLock.current = true; setSelecting(true); return true;
  };
  const releaseSelection = () => { selectionLock.current = false; setSelecting(false); };
  const sampleEntry = <View style={styles.sampleEntry}><SampleRunEntry disabled={selecting}
    claimSelection={claimSelection} releaseSelection={releaseSelection} /></View>;
  const handleSelect = async (run: RunRecord) => {
    if (!run.hasRoute || !claimSelection()) return;
    const token = selectionEpoch.current;
    const isCurrent = () => focused.current && token === selectionEpoch.current;
    try {
      setLoadingRouteFor(run.id);
      // §5: 고른 다음에만 실제 좌표를 가져온다.
      const localID = runaryRecordID(run.id);
      if (localID !== null) {
        const detail = await Tracking!.detail(localID);
        if (!isCurrent()) return;
        if (detail.summary.id !== localID) throw new Error('다른 기록의 경로는 선택할 수 없어요.');
        const selected = runaryTrack(detail);
        await setSelectedRun(selected.run, selected.track, isCurrent);
      } else {
        const track = await HealthKitBridge.getRoute(run.id);
        if (!isCurrent()) return;
        await setSelectedRun(run, track, isCurrent);
      }
      if (isCurrent()) router.push('/background-selection');
    } catch {
      // §6: 좌표를 읽다 실패하면 목록에 머무른다. 그 줄에 "다시 시도"를 남긴다.
      if (isCurrent()) setFailedIds((prev) => new Set(prev).add(run.id));
    } finally {
      if (isCurrent()) { setLoadingRouteFor(null); releaseSelection(); }
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

  const allRuns = mergeRunRecords(runs, ownRuns);
  const visibleRuns = allRuns.filter(run => run.hasRoute);
  const loadingSources = state === 'loading' || ownState === 'loading';
  const empty = <View style={styles.center}>
    {loadingSources ? <ActivityIndicator color={Colors.accent} /> : <>
      <Text style={styles.emptyTitle}>{state === 'error' && !ownAvailable ? '기록을 불러오지 못했어요' : allRuns.length ? '좌표가 있는 기록이 없어요' : '실외 러닝 기록이 없어요'}</Text>
      <Text style={styles.emptyBody}>{allRuns.length
        ? `러닝 ${allRuns.length}건을 찾았지만 그릴 좌표가 없어 목록에서 걸렀어요.`
        : '아직 기록이 없거나 건강 데이터 접근이 허용되지 않았을 수 있어요. 한 번 뛰고 오시거나 설정에서 권한을 확인해주세요.'}</Text>
      {allRuns.length === 0 && <Pressable accessibilityRole="button" onPress={() => { setSettingsError(''); void Linking.openSettings().catch(() => setSettingsError('설정을 열지 못했어요. 아이폰 설정 → 앱 → Runary에서 건강 데이터 접근을 확인해 주세요.')); }} style={styles.retryBtn}><Text style={styles.retryBtnText}>설정에서 권한 확인</Text></Pressable>}
      {settingsError ? <Text style={styles.emptyBody}>{settingsError}</Text> : null}
      <AppPermissionsLink />
    </>}
  </View>;

  return (
    <SafeAreaView style={styles.safeArea}>
      {header}
      {sampleEntry}
      {(state === 'error' || ownState === 'error') && <View style={styles.sourceNotice}>
        {state === 'error' && <Text style={styles.emptyBody}>건강 앱 기록을 불러오지 못했어요. 다른 기록은 선택할 수 있어요.</Text>}
        {ownState === 'error' && <Text style={styles.emptyBody}>Runary 기록을 불러오지 못했어요. 원본은 유지됩니다.</Text>}
        <Pressable accessibilityRole="button" onPress={refresh} style={styles.retryBtn}><Text style={styles.retryBtnText}>다시 시도</Text></Pressable>
        {state === 'error' && <AppPermissionsLink />}
      </View>}
      {visibleRuns.length > 0 && loadingSources && <Text style={styles.sourceLabel}>다른 기록을 불러오는 중이에요.</Text>}
      {trackingEnabled && !ownAvailable && <Text style={styles.sourceLabel}>Runary 기록 선택은 최신 개발 앱에서 사용할 수 있어요.</Text>}
      <FlatList
        data={visibleRuns}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.list, !visibleRuns.length && { flexGrow: 1 }]}
        ListEmptyComponent={empty}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => {
          const failed = failedIds.has(item.id);
          const selectable = !failed;
          const loading = loadingRouteFor === item.id;
          return (
            <Pressable
              disabled={selecting}
              accessibilityRole="button"
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
                    item.source === 'runary' ? 'Runary' : 'Apple 건강',
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
        ListFooterComponent={<>
          {allRuns.length > visibleRuns.length && <Text style={styles.footerNote}>좌표가 없는 기록 {allRuns.length - visibleRuns.length}건은 목록에서 걸렀어요.</Text>}
          {damagedCount > 0 && <Text style={styles.footerNote}>Runary 기록 {damagedCount}건을 읽지 못했어요. 원본은 유지되며 새로고침으로 다시 시도할 수 있어요.</Text>}
        </>}
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
  sourceNotice: { paddingHorizontal: 24, paddingBottom: 12, alignItems: 'center', gap: 6 },
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
