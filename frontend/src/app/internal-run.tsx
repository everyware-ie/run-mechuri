import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Pressable, ScrollView, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { RunMap } from '@/components/run-map';
import { emptyRunMap, mergeMapPage } from '@/lib/tracking-map';
import { Colors } from '@/constants/theme';
import { RunAction, RunDisclosure, RunMetric, RunStatus, runUI } from '@/components/run-tracking-ui';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/screen-header';
import { Card, ThemedButton } from '@/components/ui';
import { trackingStyles as styles } from '@/components/internal-run-styles';
import { heartImportNotice, runNumber, runPace, runStatus, runTime } from '@/lib/tracking-display';
import { toggleText } from '@/lib/tracking-permissions';
import { Tracking, trackingEnabled, type RunSummary, type TrackingState } from '../../modules/run-tracking/src/RunTracking';

export default function InternalRunScreen() {
  const [state, setState] = useState<TrackingState | null>(null);
  const [records, setRecords] = useState<RunSummary[]>([]);
  const [damaged, setDamaged] = useState<string[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const actionPending = useRef(false);
  const [error, setError] = useState('');
  const [pollError, setPollError] = useState('');
  const [mapVisible, setMapVisible] = useState(false);
  const [mapData, setMapData] = useState(emptyRunMap);
  const mapCacheRef = useRef(emptyRunMap);
  const [clock, setClock] = useState(0);
  const refresh = useCallback(async () => {
    if (!trackingEnabled) return;
    const [snapshot, history] = await Promise.all([Tracking!.state(), Tracking!.records()]);
    setState(snapshot); setClock(Date.now() / 1000); setRecords(history.records); setDamaged(history.damaged);
  }, []);
  useFocusEffect(useCallback(() => {
    if (!trackingEnabled) return;
    setMapVisible(true);
    let mapCache = mapCacheRef.current;
    let alive = true, fetching = false, historyAt = 0, first = true, epoch = 0;
    const update = async () => {
      if (fetching || !alive || AppState.currentState !== 'active') return;
      fetching = true;
      const current = epoch;
      const valid = () => alive && current === epoch && AppState.currentState === 'active';
      try {
        const snapshot = await Tracking!.state();
        if (!valid()) return;
        setPollError('');
        setState(snapshot); setClock(Date.now() / 1000);
        if (first && !snapshot.summary && !snapshot.watchStartPending && !snapshot.phoneStartPending && [3, 4].includes(snapshot.locationPermission) && snapshot.preciseLocation) {
          first = false; await Tracking!.prepare();
        }
        if (!valid()) return;
        first = false;
        // Use the existing foreground poll; catch up in bounded chunks after a
        // long background run. Map errors never stop metrics or history loading.
        if (Tracking!.mapSnapshot) {
          try {
            for (let chunk = 0; chunk < 8; chunk++) {
              const page = await Tracking!.mapSnapshot(mapCache.revision, mapCache.points.length);
              if (!valid()) break;
              mapCache = mergeMapPage(mapCache, page);
              if (page.nextIndex >= page.total) break;
            }
            if (valid()) { mapCacheRef.current = mapCache; setMapData(mapCache); }
          } catch { if (valid()) { mapCache = emptyRunMap; mapCacheRef.current = emptyRunMap; setMapData(emptyRunMap); } }
        }
        if (Date.now() - historyAt >= 15000) {
          const history = await Tracking!.records();
          if (valid()) { setRecords(history.records); setDamaged(history.damaged); historyAt = Date.now(); }
        }
      } catch { if (valid()) setPollError('러닝 상태를 확인하지 못했어요. 잠시 후 다시 확인합니다.'); }
      finally { fetching = false; }
    };
    void update(); const timer = setInterval(update, 1000);
    const subscription = AppState.addEventListener('change', status => { epoch++; if (status === 'active') { first = true; void update(); } });
    return () => { alive = false; setMapVisible(false); clearInterval(timer); subscription.remove(); void Tracking!.cancelPreparation().catch(() => {}); };
  }, []));
  if (!trackingEnabled) return <Redirect href="/" />;
  const act = async (work: () => Promise<unknown>) => {
    if (actionPending.current) return; actionPending.current = true; setBusy(true); setError('');
    try { await work(); } catch (e) { setError(e instanceof Error ? e.message : '다시 시도해 주세요.'); }
    finally { actionPending.current = false; setBusy(false); await refresh().catch(() => {}); }
  };
  const current = state?.summary;
  const importedHeart = current ? heartImportNotice(current) : null;
  const finish = () => Alert.alert('러닝을 마칠까요?', '측정을 종료하고 기록을 기기에 보관합니다.', [
    { text: '계속 측정', style: 'cancel' },
    { text: '종료', onPress: () => void act(async () => { const id = current?.id; await Tracking!.finish(); if (id) router.push(`/internal-run/${id}`); }) },
  ]);
  const immediateStart = !!Tracking!.startImmediately;
  const awaitingPermission = state?.phoneStartPending === true;
  const preparation = awaitingPermission ? '위치 권한 확인 중' : state?.phase === 'ready' ? '현재 위치 확인됨' : state?.phase === 'preparing' ? 'GPS 연결 중' : !current && immediateStart ? '러닝 시작 시 위치를 연결해요' : 'GPS를 준비해 주세요';
  const lastLocationAge = current?.lastLocation != null ? clock - current.lastLocation : null;
  const watchLabel: Record<string, string> = { off: '워치에서 Runary 열기', notPaired: '워치 연결 없음', connecting: '워치 상태 자동 확인 중', noResponse: '워치 상태 자동 확인 중', notInstalled: '워치 앱 설치·업데이트 필요', waiting: '워치 상태 자동 확인 중', connected: '워치 연결됨', failed: '워치 상태 자동 확인 중', disconnected: '워치 상태 자동 확인 중' };
  const ready = state?.phase === 'ready';
  const preparing = state?.phase === 'preparing';
  const running = current?.status === 'running';
  const status = current ? (running ? '달리는 중' : runStatus[current.status]) : preparation;
  return <SafeAreaView style={styles.safe}>
    <ScreenHeader title="러닝" right={<Pressable accessibilityRole="button" accessibilityLabel="앱 권한 확인" hitSlop={12} onPress={() => router.push('/app-permissions')}><SymbolView name="gearshape" size={19} tintColor={Colors.textMuted} /></Pressable>} />
    <ScrollView contentContainerStyle={[runUI.body, runUI.mapBody]}>
      {error || pollError || state?.notice ? <View style={runUI.error}><Text style={styles.notice}>{error || pollError || state?.notice}</Text></View> : null}
      {current && ['disabled', 'unavailable'].includes(state?.liveActivityState ?? '') ? <Text style={styles.subtitle}>잠금화면 현황을 표시할 수 없어요. 러닝은 계속 측정 중이며, 앱 설정에서 실시간 현황 허용 여부를 확인할 수 있어요.</Text> : null}
      {!Tracking!.watchAutoSync ? <Text style={styles.subtitle}>워치 자동 연결과 워치에서 시작은 최신 아이폰·워치 앱을 설치하면 사용할 수 있어요.</Text> : null}
      {current ? <>
        <View style={runUI.center}><Text style={runUI.eyebrow}>RUNARY RUN</Text><RunStatus label={status} active={running} /></View>
        <RunMap key={mapData.revision ?? 'prepare'} points={mapData.points} position={mapData.position} visible={mapVisible} clock={clock} unavailable={!Tracking!.mapSnapshot} />
        <View style={runUI.grid}>
          <RunMetric compact title="시간" value={runTime(current.duration)} unit="측정 시간" />
          <RunMetric compact title="거리" value={(current.distance / 1000).toFixed(2)} unit="km" />
          <RunMetric compact title="현재 페이스" value={runPace(current.pace)} unit="/km" />
          <RunMetric compact title="심박" value={runNumber(current.heartRate)} unit="bpm" />
        </View>
        <View style={runUI.support}>
          <Support title="평균 페이스" value={runPace(current.averagePace)} />
          <Support title="케이던스" value={`${runNumber(current.cadence)} spm`} />
          <Support title="걸음" value={current.lastMotion != null || current.steps > 0 ? String(current.steps) : '-'} />
        </View>
        <View style={runUI.center}>
          <Text style={styles.subtitle}>{running ? (lastLocationAge == null ? 'GPS 연결 중' : lastLocationAge > 10 ? 'GPS 최신값 확인 중' : 'GPS 수신 중') : '아이폰 GPS 수집이 멈춰 있어요'} · {watchLabel[state?.watchState ?? 'off']}</Text>
          {state?.watchWorkoutEnabled ? <Text style={styles.subtitle}>워치 운동: {({ running: '측정 중', paused: '일시정지', permission: '워치에서 운동 권한 확인 필요', blocked: '워치 측정 중단', starting: '시작 중' } as Record<string, string>)[state.watchWorkoutState ?? ''] ?? '연결 확인 중'}</Text> : null}
          {current.heartSource === 'health' && running ? <Text style={styles.subtitle}>{state?.healthHeartState === 'failed' ? '심박을 확인하지 못했어요. 건강 앱 권한을 확인해 주세요.' : state?.healthHeartState === 'authorizing' ? '심박 권한 요청 중' : current.heartRate != null ? '심박 수신 중' : current.lastHeart != null ? '심박 동기화 지연' : '건강 앱에 새 심박이 저장되기를 기다려요.'}</Text> : null}
          {current.heartSource === 'health' && running && current.heartRate == null && importedHeart ? <Text style={styles.subtitle}>{importedHeart}. 최신 심박을 기다리고 있어요.</Text> : null}
          {current.heartSource === 'health' && running && current.lastHeart == null ? <Text style={styles.subtitle}>Runary는 심박 센서의 연속 측정을 시작하지 않아요. 저장된 심박이 동기화되면 자동으로 표시해요.</Text> : null}
          {current.heartSource === 'health' && running && state?.healthHeartState === 'failed' ? <Pressable accessibilityRole="button" style={styles.smallButton} disabled={busy} onPress={() => void act(() => Tracking!.reconnectHealthHeart!())}><Text style={styles.link}>심박 다시 불러오기</Text></Pressable> : null}
          {current.incomplete ? <Text style={styles.notice}>경로 일부가 누락됐을 수 있어요.</Text> : null}
          {!running && !Tracking!.resumeImmediately && !state?.storageError && current.status !== 'saving' ? <RunStatus label={preparation} active={ready} /> : null}
          {!Tracking!.watchDisplayOnly ? <Text style={styles.subtitle}>워치 지표 표시에는 최신 아이폰·워치 앱이 필요해요.</Text> : null}
        </View>
      </> : <>
        <View style={runUI.center}>
          <Text style={[runUI.headline, runUI.mapHeadline]}>오늘의 러닝을 시작해 볼까요?</Text>
          <RunStatus label={preparation} active={ready} />
          {state?.watchStartPending ? <Text style={styles.subtitle}>워치에서 요청한 러닝의 시작을 확인하고 있어요.</Text> : null}
          {preparing || awaitingPermission ? <ActivityIndicator size="small" color={Colors.accent} /> : null}
        </View>
        <RunMap key={mapData.revision ?? 'prepare'} points={mapData.points} position={mapData.position} visible={mapVisible} clock={clock} height={300} unavailable={!Tracking!.mapSnapshot} />
        <Card>
          <Text style={styles.text}>심박 가져오기</Text>
          <Text style={styles.subtitle}>건강 앱에 저장된 심박을 불러와요. 워치 연동을 켜면 Runary가 운동 중 심박을 측정해요.</Text>
          {Tracking!.setWatchWorkoutEnabled ? <Text style={styles.text}>워치 운동 연동: {toggleText(state ? !!state.watchWorkoutEnabled : undefined)}</Text> : null}
          {Tracking!.setWatchWorkoutEnabled ? <ThemedButton title={state?.watchWorkoutEnabled ? '워치 운동 연동 끄기' : '워치 운동 연동 켜기'} variant="outline" disabled={busy} onPress={() => {
            if (state?.watchWorkoutEnabled) { void act(() => Tracking!.setWatchWorkoutEnabled!(false)); return; }
            Alert.alert('워치 운동 연동', '워치에서 심박을 측정하고 러닝 화면을 표시해요. 다른 워치 운동이 진행 중이면 종료될 수 있어요.', [{ text: '나중에', style: 'cancel' }, { text: '연동 켜기', onPress: () => void act(() => Tracking!.setWatchWorkoutEnabled!(true)) }]);
          }} /> : null}
          {Tracking!.setHealthExportEnabled ? <Text style={styles.text}>건강 앱 자동 저장: {toggleText(state ? !!state.healthExportEnabled : undefined)}</Text> : null}
          {Tracking!.setHealthExportEnabled && state?.healthExportEnabled && state.healthWorkoutWrite === 1 ? <Text style={styles.notice}>자동 저장은 켜져 있지만 건강 앱의 운동 쓰기가 허용되지 않아 저장되지 않아요. 앱 권한에서 확인해 주세요.</Text> : null}
          {Tracking!.setHealthExportEnabled ? <ThemedButton title={state?.healthExportEnabled ? '건강 앱 자동 저장 끄기' : '건강 앱 자동 저장 켜기'} variant="outline" disabled={busy} onPress={() => void act(() => Tracking!.setHealthExportEnabled!(!state?.healthExportEnabled))} /> : null}
          <Text style={styles.subtitle}>건강 저장을 허용하면 이후 완료한 러닝을 피트니스에서도 확인할 수 있어요. 워치가 없어도 저장돼요.</Text>
          <Text style={styles.subtitle}>Runary만 실행하면 새 심박 수집까지 시간이 걸릴 수 있어요. 심박 센서의 연속 측정을 시작하지 않아요.</Text>
          <Text style={styles.subtitle}>워치에서 Runary를 열면 같은 러닝을 확인하고 제어할 수 있어요. 운동 연동을 끈 상태에서는 건강에 저장된 심박만 읽어요.</Text>
          {!Tracking!.startWithHeartSource ? <Text style={styles.subtitle}>건강 앱 심박은 앱 업데이트 후 사용할 수 있어요.</Text> : null}
        </Card>
      </>}
      <Text style={runUI.footnote}>지도 배경은 Apple 지도 서비스를 사용해요.</Text>
      <RunDisclosure label={`최근 러닝 · ${records.length}`} open={historyOpen} onPress={() => setHistoryOpen(value => !value)}>
        {records.map(run => <View key={run.id}>
          <Pressable accessibilityRole="button" onPress={() => router.push(`/internal-run/${run.id}`)} style={runUI.historyRow}>
            <View style={runUI.historyIcon}><SymbolView name="figure.run" size={20} tintColor={Colors.textMuted} /></View>
            <View style={runUI.historyText}><Text style={styles.text}>{(run.distance / 1000).toFixed(2)} km · {runTime(run.duration)}</Text><Text style={styles.subtitle}>{new Date(run.started * 1000).toLocaleDateString('ko-KR')} · {runStatus[run.status]}</Text></View>
            <SymbolView name="chevron.right" size={13} tintColor={Colors.textMuted} />
          </Pressable>
          {!current && run.status !== 'completed' ? <Pressable accessibilityRole="button" disabled={busy} style={styles.smallButton} onPress={() => void act(() => Tracking!.recover(run.id))}><Text style={styles.link}>중단된 러닝으로 돌아가기</Text></Pressable> : null}
        </View>)}
        {damaged.map(id => <Card key={id}><Text style={styles.notice}>읽을 수 없는 기록이 있어요. 원본은 보존했습니다.</Text><Pressable accessibilityRole="button" onPress={() => Alert.alert('이 기록 원본을 삭제할까요?', '삭제 후 복구할 수 없습니다.', [{ text: '취소', style: 'cancel' }, { text: '삭제', style: 'destructive', onPress: () => void act(() => Tracking!.deleteRecord(id)) }])}><Text style={styles.link}>손상된 기록 삭제</Text></Pressable></Card>)}
        {!records.length && !damaged.length ? <Text style={styles.subtitle}>첫 러닝을 마치면 여기에 남아요.</Text> : null}
      </RunDisclosure>
    </ScrollView>
    <View style={runUI.footer}>
      {state?.storageError && current ? <>
        <Text style={styles.notice}>저장되지 않은 자료가 있어요. 마지막 저장: {current.lastSaved ? new Date(current.lastSaved * 1000).toLocaleTimeString('ko-KR') : '아직 없음'}</Text>
        <Text style={runUI.footnote}>앱 종료 시 미저장 자료를 잃을 수 있어요.</Text>
        <ThemedButton title="저장 재시도" disabled={busy} onPress={() => void act(() => Tracking!.retrySave())} />
        <ThemedButton title="마지막 저장분만 보관" variant="outline" disabled={busy || !current.lastSaved} onPress={() => Alert.alert('미저장 자료를 제외할까요?', '이미 저장된 기록은 보존합니다. 앱 종료 시 미저장 자료를 잃을 수 있어요.', [{ text: '취소', style: 'cancel' }, { text: '보관', onPress: () => void act(() => Tracking!.keepSaved()) }])} />
      </> : current ? <>
        {current.status === 'saving' ? <ThemedButton title="저장 재시도" disabled={busy} onPress={() => void act(() => Tracking!.retrySave())} /> : <View style={runUI.actions}>
          <RunAction title={running ? '일시정지' : Tracking!.resumeImmediately || ready ? '이어서 달리기' : preparing ? 'GPS 준비 중' : 'GPS 준비'} symbol={running ? 'pause.fill' : 'play.fill'} primary={!running} disabled={busy || (!running && !Tracking!.resumeImmediately && preparing)} onPress={() => void act(() => running ? Tracking!.pause() : Tracking!.resumeImmediately ? Tracking!.resumeImmediately() : ready ? Tracking!.resume() : Tracking!.prepare())} />
          <RunAction title={running ? '종료' : '여기까지 저장'} symbol="stop.fill" disabled={busy} onPress={finish} />
        </View>}
        <Text style={runUI.footnote}>{running ? '화면을 닫거나 잠가도 러닝을 이어갑니다.' : '일시정지·중단된 시간은 측정에 포함하지 않아요.'}</Text>
      </> : <>
        <View style={runUI.actions}><RunAction title={awaitingPermission ? '위치 권한 확인 중' : immediateStart || ready ? '러닝 시작' : preparing ? 'GPS 준비 중' : 'GPS 준비'} symbol="play.fill" primary disabled={busy || !state || awaitingPermission || (!immediateStart && (preparing || (ready && !Tracking!.startWithHeartSource)))} onPress={() => void act(() => Tracking!.startImmediately ? Tracking!.startImmediately() : ready ? Tracking!.startWithHeartSource!('health') : Tracking!.prepare())} /></View>
        {awaitingPermission || (preparing && !immediateStart) ? <Pressable accessibilityRole="button" onPress={() => void act(() => Tracking!.cancelPreparation())} style={{ paddingVertical: 4 }}><Text style={runUI.footnote}>시작 취소</Text></Pressable> : <Text style={runUI.footnote}>{preparing && immediateStart ? 'GPS 연결 중에도 바로 시작할 수 있어요.' : '팀 테스트 · 위치와 기록은 이 기기에만 보관해요.'}</Text>}
      </>}
    </View>
  </SafeAreaView>;
}
function Support({ title, value }: { title: string; value: string }) {
  return <View style={runUI.supportItem}><Text style={runUI.label}>{title}</Text><Text style={runUI.supportValue}>{value}</Text></View>;
}
