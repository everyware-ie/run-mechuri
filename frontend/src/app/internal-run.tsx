import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Alert, AppState, Pressable, ScrollView, Switch, Text, View, useWindowDimensions } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { RunDistanceSummary, RunConnectionRow, RunSheet, measureUI } from '@/components/run-measurement';
import { RunMap } from '@/components/run-map';
import { emptyRunMap, mergeMapPage } from '@/lib/tracking-map';
import { Colors } from '@/constants/theme';
import { RunAction, RunDisclosure, RunStatus, runUI } from '@/components/run-tracking-ui';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/screen-header';
import { Card, ThemedButton } from '@/components/ui';
import { trackingStyles as styles } from '@/components/internal-run-styles';
import { heartImportNotice, runNumber, runPace, runStatus, runTime } from '@/lib/tracking-display';
import { Tracking, trackingEnabled, type RunSummary, type TrackingState } from '../../modules/run-tracking/src/RunTracking';

export default function InternalRunScreen() {
  const { height } = useWindowDimensions();
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
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
  const ready = state?.phase === 'ready';
  const preparing = state?.phase === 'preparing';
  const running = current?.status === 'running';
  const immediateStart = !!Tracking!.startImmediately;
  const awaitingPermission = state?.phoneStartPending === true;
  const preparation = awaitingPermission ? '위치 권한 확인 중' : ready ? '현재 위치 확인됨' : preparing ? 'GPS 연결 중' : '시작하면 위치 연결';
  const watchSession = state?.watchWorkoutEnabled ? ({ running: '워치 측정 중', paused: '워치도 일시정지', permission: '워치 권한 확인 필요', blocked: '워치 측정 중단', starting: '워치 시작 중' } as Record<string, string>)[state.watchWorkoutState ?? ''] ?? '워치 연결 확인 중' : '워치 운동 연동 꺼짐';
  const gpsMessage = !running ? '일시정지한 시간은 기록에 포함하지 않아요.' : current?.lastLocation == null ? 'GPS 연결 중 · 시간은 측정하고 있어요.' : clock - current.lastLocation > 10 ? 'GPS 최신값 확인 중 · 러닝은 계속돼요.' : 'GPS 수신 중 · 화면을 잠가도 계속 측정해요.';
  const importedHeart = current && current.heartRate == null && current.lastHeart != null ? heartImportNotice(current) : null;
  const heartMessage = state?.healthHeartState === 'failed' ? '심박을 불러오지 못했어요. 건강 앱 권한을 확인해 주세요.' : state?.healthHeartState === 'authorizing' ? '심박 권한 확인 중이에요.' : running && current?.heartRate == null ? current?.lastHeart ? '최신 심박을 기다리고 있어요.' : state?.watchWorkoutEnabled ? '워치에서 새 심박을 기다리고 있어요.' : '건강 앱에 저장된 새 심박을 기다려요.' : null;
  const confirmFinish = async () => { const id = current?.id; await Tracking!.finish(); setFinishOpen(false); if (id) router.push(`/internal-run/${id}`); };
  return <SafeAreaView style={styles.safe}>
    <ScreenHeader title="러닝" right={<Pressable accessibilityRole="button" accessibilityLabel="앱 권한 확인" hitSlop={12} onPress={() => router.push('/app-permissions')}><SymbolView name="gearshape" size={19} tintColor={Colors.textMuted} /></Pressable>} />
    <ScrollView contentContainerStyle={[runUI.body, runUI.mapBody]}>
      {error || pollError || state?.notice ? <View style={runUI.error}><Text style={styles.notice}>{error || pollError || state?.notice}</Text></View> : null}
      {current ? <>
        <View style={measureUI.statusBar}><RunStatus label={running ? '러닝 중' : runStatus[current.status]} active={running} /><Text style={measureUI.watchStatus}>{watchSession}</Text></View>
        <RunDistanceSummary run={current} />
        <View style={measureUI.secondary}>
          <Text style={measureUI.secondaryText}>현재 {runPace(current.pace)} /km</Text>
          <Text style={measureUI.secondaryText}>케이던스 {runNumber(current.cadence)} spm</Text>
        </View>
        <RunMap key={mapData.revision ?? 'prepare'} points={mapData.points} position={mapData.position} visible={mapVisible} clock={clock} height={Math.min(220, Math.max(140, height * 0.24))} unavailable={!Tracking!.mapSnapshot} />
        <View style={{ gap: 6 }}>
          <Text style={measureUI.statusNotice}>{gpsMessage}</Text>
          {heartMessage ? <Text style={measureUI.statusNotice}>{importedHeart ? `${importedHeart}. ` : ''}{heartMessage}</Text> : null}
          {state?.watchState === 'notInstalled' ? <Text style={measureUI.statusNotice}>워치 앱 설치·업데이트 필요</Text> : null}
          {state?.watchWorkoutState === 'blocked' ? <Text style={styles.notice}>워치 측정이 중단됐어요. 아이폰 러닝은 계속돼요. 워치에서 다시 시작할 수 있어요.</Text> : null}
          {state?.watchWorkoutState === 'permission' ? <Text style={styles.notice}>워치 Runary에서 운동 연결 권한을 확인해 주세요.</Text> : null}
          {state?.healthHeartState === 'failed' && Tracking!.reconnectHealthHeart ? <Pressable accessibilityRole="button" style={styles.smallButton} disabled={busy} onPress={() => void act(() => Tracking!.reconnectHealthHeart!())}><Text style={styles.link}>심박 다시 불러오기</Text></Pressable> : null}
          {current.incomplete ? <Text style={styles.notice}>경로 일부가 누락됐을 수 있어요.</Text> : null}
          {['disabled', 'unavailable'].includes(state?.liveActivityState ?? '') ? <Text style={styles.subtitle}>잠금화면 현황을 표시할 수 없어요. 앱 권한에서 실시간 현황 설정을 확인해 주세요.</Text> : null}
        </View>
      </> : <>
        <RunMap key={mapData.revision ?? 'prepare'} points={mapData.points} position={mapData.position} visible={mapVisible} clock={clock} height={Math.min(280, height * 0.32)} unavailable={!Tracking!.mapSnapshot} />
        <Text style={[runUI.headline, { fontSize: 22, textAlign: 'left', lineHeight: 31 }]}>오늘의 러닝을 시작해 볼까요?</Text>
        <View style={measureUI.connections}>
          <RunConnectionRow title="GPS" value={preparation} active={ready} onPress={() => router.push('/app-permissions')} />
          <RunConnectionRow title="Apple Watch" value={state?.watchWorkoutEnabled ? state.watchInstalled ? '시작하면 심박 측정' : '워치 앱 설치 확인 필요' : '연동 꺼짐'} active={!!state?.watchWorkoutEnabled && !!state.watchInstalled} onPress={() => setConnectionsOpen(true)} />
          <RunConnectionRow title="건강 앱 저장" value={state?.healthExportEnabled ? '켜짐' : '꺼짐'} active={state?.healthExportEnabled} onPress={() => setConnectionsOpen(true)} />
        </View>
        {state?.watchStartPending ? <Text style={styles.subtitle}>워치에서 요청한 러닝의 시작을 확인하고 있어요.</Text> : null}
      </>}
      <Text style={runUI.footnote}>지도 배경: Apple 지도</Text>
      {!current ? <RunDisclosure label={`최근 러닝 · ${records.length}`} open={historyOpen} onPress={() => setHistoryOpen(value => !value)}>
        {records.map(run => <View key={run.id}>
          <Pressable accessibilityRole="button" onPress={() => router.push(`/internal-run/${run.id}`)} style={runUI.historyRow}>
            <View style={runUI.historyIcon}><SymbolView name="figure.run" size={20} tintColor={Colors.textMuted} /></View>
            <View style={runUI.historyText}><Text style={styles.text}>{(run.distance / 1000).toFixed(2)} km · {runTime(run.duration)}</Text><Text style={styles.subtitle}>{new Date(run.started * 1000).toLocaleDateString('ko-KR')} · {runStatus[run.status]}</Text></View>
            <SymbolView name="chevron.right" size={13} tintColor={Colors.textMuted} />
          </Pressable>
          {run.status !== 'completed' ? <Pressable accessibilityRole="button" disabled={busy} style={styles.smallButton} onPress={() => void act(() => Tracking!.recover(run.id))}><Text style={styles.link}>중단된 러닝으로 돌아가기</Text></Pressable> : null}
        </View>)}
        {damaged.map(id => <Card key={id}><Text style={styles.notice}>읽을 수 없는 기록이 있어요. 원본은 보존했습니다.</Text><Pressable accessibilityRole="button" onPress={() => Alert.alert('이 기록 원본을 삭제할까요?', '삭제 후 복구할 수 없습니다.', [{ text: '취소', style: 'cancel' }, { text: '삭제', style: 'destructive', onPress: () => void act(() => Tracking!.deleteRecord(id)) }])}><Text style={styles.link}>손상된 기록 삭제</Text></Pressable></Card>)}
        {!records.length && !damaged.length ? <Text style={styles.subtitle}>첫 러닝을 마치면 여기에 남아요.</Text> : null}
      </RunDisclosure> : null}
    </ScrollView>
    <View style={runUI.footer}>
      {state?.storageError && current ? <>
        <Text style={styles.notice}>저장되지 않은 자료가 있어요. 마지막 저장: {current.lastSaved ? new Date(current.lastSaved * 1000).toLocaleTimeString('ko-KR') : '아직 없음'}</Text>
        <ThemedButton title="저장 재시도" disabled={busy} onPress={() => void act(() => Tracking!.retrySave())} />
        <ThemedButton title="마지막 저장분만 보관" variant="outline" disabled={busy || !current.lastSaved} onPress={() => Alert.alert('미저장 자료를 제외할까요?', '이미 저장된 기록은 보존합니다. 앱 종료 시 미저장 자료를 잃을 수 있어요.', [{ text: '취소', style: 'cancel' }, { text: '보관', onPress: () => void act(() => Tracking!.keepSaved()) }])} />
      </> : current ? <>
        {current.status === 'saving' ? <ThemedButton title="저장 재시도" disabled={busy} onPress={() => void act(() => Tracking!.retrySave())} /> : <View style={runUI.actions}>
          <RunAction title="종료" symbol="stop.fill" iconOnly disabled={busy} onPress={() => setFinishOpen(true)} />
          <RunAction title={running ? '일시정지' : Tracking!.resumeImmediately || ready ? '재개' : preparing ? 'GPS 준비 중' : 'GPS 준비'} symbol={running ? 'pause.fill' : 'play.fill'} iconOnly primary={!running} disabled={busy || (!running && !Tracking!.resumeImmediately && preparing)} onPress={() => void act(() => running ? Tracking!.pause() : Tracking!.resumeImmediately ? Tracking!.resumeImmediately() : ready ? Tracking!.resume() : Tracking!.prepare())} />
        </View>}
      </> : <>
        <View style={runUI.actions}><RunAction title={awaitingPermission ? '위치 권한 확인 중' : immediateStart || ready ? '러닝 시작' : preparing ? 'GPS 준비 중' : 'GPS 준비'} symbol="play.fill" primary disabled={busy || !state || awaitingPermission || (!immediateStart && (preparing || (ready && !Tracking!.startWithHeartSource)))} onPress={() => void act(() => Tracking!.startImmediately ? Tracking!.startImmediately() : ready ? Tracking!.startWithHeartSource!('health') : Tracking!.prepare())} /></View>
        {awaitingPermission || (preparing && !immediateStart) ? <Pressable accessibilityRole="button" onPress={() => void act(() => Tracking!.cancelPreparation())} style={{ paddingVertical: 4 }}><Text style={runUI.footnote}>시작 취소</Text></Pressable> : <Text style={runUI.footnote}>위치와 기록은 이 기기에만 보관해요</Text>}
      </>}
    </View>
    <RunSheet visible={connectionsOpen && !current} title="워치와 건강 앱 연결" onClose={() => setConnectionsOpen(false)}>
      <Text style={styles.subtitle}>한 번 켜두면 러닝을 시작할 때 자동으로 연결해요.</Text>
      <View style={measureUI.setting}><View style={measureUI.settingHeader}><Text style={measureUI.settingTitle}>워치 운동 연동</Text><Switch accessibilityLabel="워치 운동 연동" value={!!state?.watchWorkoutEnabled} disabled={busy || !Tracking!.setWatchWorkoutEnabled} trackColor={{ true: Colors.accent }} onValueChange={value => void act(() => Tracking!.setWatchWorkoutEnabled!(value))} /></View><Text style={styles.subtitle}>워치에서 심박을 측정하고 러닝 화면을 표시해요. 다른 워치 운동이 진행 중이면 종료될 수 있어요.</Text></View>
      <View style={measureUI.setting}><View style={measureUI.settingHeader}><Text style={measureUI.settingTitle}>건강 앱 자동 저장</Text><Switch accessibilityLabel="건강 앱 자동 저장" value={!!state?.healthExportEnabled} disabled={busy || !Tracking!.setHealthExportEnabled} trackColor={{ true: Colors.accent }} onValueChange={value => void act(() => Tracking!.setHealthExportEnabled!(value))} /></View><Text style={styles.subtitle}>완료한 러닝을 건강 앱에 저장해요. 피트니스에서도 확인할 수 있고, 워치가 없어도 저장돼요.</Text></View>
      <Text style={styles.subtitle}>연결하지 않아도 아이폰 측정과 저장은 계속할 수 있어요. 건강 심박 읽기는 운동 연동과 별개예요.</Text>
      {error ? <Text style={styles.notice}>{error}</Text> : null}
      <ThemedButton title="완료" onPress={() => setConnectionsOpen(false)} />
    </RunSheet>
    <RunSheet visible={finishOpen && !!current} title="러닝을 종료할까요?" onClose={() => { if (!busy) setFinishOpen(false); }}>
      {current ? <Text style={styles.text}>{(current.distance / 1000).toFixed(2)} km · {runTime(current.duration)} · 평균 {runPace(current.averagePace)}</Text> : null}
      <View style={{ gap: 12 }}><Text style={styles.text}>1. 아이폰에 기록 저장</Text>{state?.watchWorkoutEnabled ? <Text style={styles.text}>2. 워치 운동 종료 요청</Text> : null}{state?.healthExportEnabled ? <Text style={styles.text}>건강 앱에도 저장해요. 결과는 기록에서 확인할 수 있어요.</Text> : <Text style={styles.subtitle}>건강 앱 자동 저장은 꺼져 있어요.</Text>}</View>
      {error ? <Text style={styles.notice}>{error}</Text> : null}
      <View style={runUI.actions}><ThemedButton title="돌아가기" variant="outline" style={{ flex: 1 }} disabled={busy} onPress={() => setFinishOpen(false)} /><ThemedButton title={busy ? '저장 중' : '종료'} style={{ flex: 1 }} disabled={busy} onPress={() => void act(confirmFinish)} /></View>
    </RunSheet>
  </SafeAreaView>;
}
