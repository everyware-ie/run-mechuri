import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { RunMap } from '@/components/run-map';
import { emptyRunMap, mergeMapPage } from '@/lib/tracking-map';
import { Colors } from '@/constants/theme';
import { RunAction, RunDisclosure, RunMetric, RunStatus, runUI } from '@/components/run-tracking-ui';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/screen-header';
import { Card, ThemedButton } from '@/components/ui';
import { trackingStyles as styles } from '@/components/internal-run-styles';
import { runNumber, runPace, runStatus, runTime } from '@/lib/tracking-display';
import { Tracking, trackingEnabled, type RunSummary, type TrackingState } from '../../modules/run-tracking/src/RunTracking';

export default function InternalRunScreen() {
  const [state, setState] = useState<TrackingState | null>(null);
  const [records, setRecords] = useState<RunSummary[]>([]);
  const [damaged, setDamaged] = useState<string[]>([]);
  const [watch, setWatch] = useState(false);
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
        if (first && !snapshot.summary && [3, 4].includes(snapshot.locationPermission) && snapshot.preciseLocation) {
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
    const subscription = AppState.addEventListener('change', status => { epoch++; if (status === 'active') void update(); });
    return () => { alive = false; setMapVisible(false); clearInterval(timer); subscription.remove(); void Tracking!.cancelPreparation().catch(() => {}); };
  }, []));
  if (!trackingEnabled) return <Redirect href="/" />;
  const act = async (work: () => Promise<unknown>) => {
    if (actionPending.current) return; actionPending.current = true; setBusy(true); setError('');
    try { await work(); } catch (e) { setError(e instanceof Error ? e.message : '다시 시도해 주세요.'); }
    finally { actionPending.current = false; setBusy(false); await refresh().catch(() => {}); }
  };
  const current = state?.summary;
  const finish = () => Alert.alert('러닝을 마칠까요?', '측정을 종료하고 기록을 기기에 보관합니다.', [
    { text: '계속 측정', style: 'cancel' },
    { text: '종료', onPress: () => void act(async () => { const id = current?.id; await Tracking!.finish(); if (id) router.push(`/internal-run/${id}`); }) },
  ]);
  const preparation = state?.phase === 'ready' ? 'GPS 준비 완료' : state?.phase === 'preparing' ? 'GPS 준비 중' : 'GPS를 준비해 주세요';
  const lastLocationAge = current?.lastLocation != null ? clock - current.lastLocation : null;
  const watchLabel: Record<string, string> = { off: '워치 미사용', connecting: '워치 연결 중', noResponse: '워치 응답 없음', notInstalled: '워치 설치 확인', waiting: '워치에서 측정 시작 대기', connected: '워치 연결됨', failed: '워치 측정 중단', disconnected: '워치 연결 끊김' };
  const ready = state?.phase === 'ready';
  const preparing = state?.phase === 'preparing';
  const running = current?.status === 'running';
  const status = current ? (running ? '달리는 중' : runStatus[current.status]) : preparation;
  return <SafeAreaView style={styles.safe}>
    <ScreenHeader title="러닝" right={<Pressable accessibilityRole="button" accessibilityLabel="앱 권한 확인" hitSlop={12} onPress={() => router.push('/app-permissions')}><SymbolView name="gearshape" size={19} tintColor={Colors.textMuted} /></Pressable>} />
    <ScrollView contentContainerStyle={[runUI.body, runUI.mapBody]}>
      {error || pollError || state?.notice ? <View style={runUI.error}><Text style={styles.notice}>{error || pollError || state?.notice}</Text></View> : null}
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
          <Support title="걸음" value={current.lastMotion != null || current.steps > 0 ? String(current.steps) : '—'} />
        </View>
        <View style={runUI.center}>
          <Text style={styles.subtitle}>{running ? (lastLocationAge == null ? 'GPS 수신 대기' : lastLocationAge > 10 ? 'GPS 최신값 확인 중' : 'GPS 수신 중') : '아이폰 GPS 수집이 멈춰 있어요'} · {watchLabel[state?.watchState ?? 'off']}</Text>
          {current.watchEnabled && current.heartRate == null ? <Text style={styles.subtitle}>{current.lastHeart ? '심박 수신 지연' : '심박 대기'} · 워치에서 측정 시작을 확인해 주세요.</Text> : null}
          {current.incomplete ? <Text style={styles.notice}>경로 일부가 누락됐을 수 있어요.</Text> : null}
          {!running && !state?.storageError && current.status !== 'saving' ? <RunStatus label={preparation} active={ready} /> : null}
          {current.watchEnabled && running ? <Pressable accessibilityRole="button" style={styles.smallButton} disabled={busy} onPress={() => void act(() => Tracking!.connectWatch())}><Text style={styles.link}>워치 다시 연결</Text></Pressable> : null}
        </View>
      </> : <>
        <View style={runUI.center}>
          <Text style={[runUI.headline, runUI.mapHeadline]}>오늘의 러닝을 시작해 볼까요?</Text>
          <RunStatus label={preparation} active={ready} />
          {preparing ? <ActivityIndicator size="small" color={Colors.accent} /> : null}
        </View>
        <RunMap key={mapData.revision ?? 'prepare'} points={mapData.points} position={mapData.position} visible={mapVisible} clock={clock} height={300} unavailable={!Tracking!.mapSnapshot} />
        <View style={runUI.watch}>
          <SymbolView name="applewatch" size={26} tintColor={Colors.textMuted} />
          <View style={runUI.watchText}><Text style={styles.text}>워치 심박 연결</Text><Text style={styles.subtitle}>워치 없이도 러닝할 수 있어요.</Text></View>
          <Switch value={watch} onValueChange={setWatch} trackColor={{ true: Colors.accent }} accessibilityLabel="워치 심박 연결" />
        </View>
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
          <RunAction title={running ? '일시정지' : ready ? '이어서 달리기' : preparing ? 'GPS 준비 중' : 'GPS 준비'} symbol={running ? 'pause.fill' : 'play.fill'} primary={!running} disabled={busy || (!running && preparing)} onPress={() => void act(() => running ? Tracking!.pause() : ready ? Tracking!.resume() : Tracking!.prepare())} />
          <RunAction title={running ? '종료' : '여기까지 저장'} symbol="stop.fill" disabled={busy} onPress={finish} />
        </View>}
        <Text style={runUI.footnote}>{running ? '화면을 닫거나 잠가도 러닝을 이어갑니다.' : '일시정지·중단된 시간은 측정에 포함하지 않아요.'}</Text>
      </> : <>
        <View style={runUI.actions}><RunAction title={ready ? '러닝 시작' : preparing ? 'GPS 준비 중' : 'GPS 준비'} symbol="play.fill" primary disabled={busy || !state || preparing} onPress={() => void act(() => ready ? Tracking!.start(watch) : Tracking!.prepare())} /></View>
        {preparing ? <Pressable accessibilityRole="button" onPress={() => void act(() => Tracking!.cancelPreparation())} style={{ paddingVertical: 4 }}><Text style={runUI.footnote}>준비 취소</Text></Pressable> : <Text style={runUI.footnote}>팀 테스트 · 위치와 기록은 이 기기에만 보관해요.</Text>}
      </>}
    </View>
  </SafeAreaView>;
}
function Support({ title, value }: { title: string; value: string }) {
  return <View style={runUI.supportItem}><Text style={runUI.label}>{title}</Text><Text style={runUI.supportValue}>{value}</Text></View>;
}
