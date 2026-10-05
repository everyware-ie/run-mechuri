import { Redirect, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as Device from 'expo-device';
import { useCallback, useRef, useState } from 'react';
import { Alert, ScrollView, Text, TextInput, View } from 'react-native';
import { RunDisclosure, RunMetric, RunStatus, runUI } from '@/components/run-tracking-ui';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RunMap } from '@/components/run-map';
import { ScreenHeader } from '@/components/screen-header';
import { Card, ThemedButton } from '@/components/ui';
import { Colors } from '@/constants/theme';
import { diagnosticSummary, runNumber, runPace, runStatus, runTime } from '@/lib/tracking-display';
import { Tracking, trackingEnabled, type RunPoint, type RunSummary } from '../../../modules/run-tracking/src/RunTracking';
import { trackingStyles as styles } from '@/components/internal-run-styles';

export default function RunDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<{ summary: RunSummary; points: RunPoint[] } | null>(null);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [memoOpen, setMemoOpen] = useState(false);
  const [diagnosticOpen, setDiagnosticOpen] = useState(false);
  const [mapVisible, setMapVisible] = useState(false);
  const actionPending = useRef(false);
  const reload = useRef<(() => Promise<void>) | null>(null);
  useFocusEffect(useCallback(() => {
    if (!trackingEnabled || !id) return;
    setMapVisible(true);
    setData(null); setFeedback(''); setMemoOpen(false); setDiagnosticOpen(false);
    let alive = true, request = 0;
    const load = async () => {
      const current = ++request;
      setError('');
      try {
        const detail = await Tracking!.detail(id);
        if (!alive || current !== request) return;
        if (detail.summary.id !== id) throw new Error('다른 기록이 반환됐어요.');
        setData(detail); setFeedback(detail.summary.feedback ?? '');
      } catch {
        if (alive && current === request) setError('기록을 불러오지 못했어요. 원본은 보존되어 있으니 다시 시도해 주세요.');
      }
    };
    reload.current = load;
    void load();
    return () => { alive = false; reload.current = null; setMapVisible(false); };
  }, [id]));
  if (!trackingEnabled) return <Redirect href="/" />;
  const act = async (work: () => Promise<unknown>) => {
    if (actionPending.current) return; actionPending.current = true; setBusy(true); setError('');
    try { await work(); } catch (e) { setError(e instanceof Error ? e.message : '다시 시도해 주세요.'); } finally { actionPending.current = false; setBusy(false); }
  };
  const run = data?.summary.id === id ? data.summary : null;
  const version = `${Tracking!.appVersion} (${Tracking!.buildVersion})`;
  const device = `${Device.modelName ?? '?'} / ${Device.osName ?? ''} ${Device.osVersion ?? ''}`;
  return <SafeAreaView style={styles.safe}><ScreenHeader title="러닝 기록" />
    <ScrollView contentContainerStyle={runUI.body} keyboardShouldPersistTaps="handled">
      {error ? <View style={runUI.error}><Text style={styles.notice}>{error}</Text></View> : null}
      {!run ? (error ? <ThemedButton title="기록 다시 불러오기" variant="outline" onPress={() => void reload.current?.()} /> : <Text style={styles.subtitle}>기록을 불러오는 중이에요.</Text>) : null}
      {run ? <>
        <View style={runUI.center}>
          <Text style={runUI.eyebrow}>MY RUN</Text>
          <Text style={runUI.headline}>{run.status === 'completed' ? '오늘도 달렸어요.' : '이어서 달릴 수 있어요.'}</Text>
          <Text style={styles.subtitle}>{new Date(run.started * 1000).toLocaleString('ko-KR')}</Text>
          <RunStatus label={run.status === 'completed' ? '기록 저장 완료' : runStatus[run.status]} />
        </View>
        <RunMap key={run.id} points={data?.points ?? []} overview visible={mapVisible} height={300} />
        <Text style={runUI.footnote}>지도 배경은 Apple 지도 서비스를 사용해요.</Text>
        <View style={runUI.grid}>
          <RunMetric title="시간" value={runTime(run.duration)} unit="측정 시간" />
          <RunMetric title="거리" value={(run.distance / 1000).toFixed(2)} unit="km" />
          <RunMetric title="평균 페이스" value={runPace(run.averagePace)} unit="/km" />
          <RunMetric title="평균 심박" value={runNumber(run.averageHeartRate)} unit="bpm" />
        </View>
        {run.incomplete ? <View style={runUI.error}><Text style={styles.notice}>경로 일부가 누락됐을 수 있어요. 없는 구간은 연결하지 않았습니다.</Text></View> : null}
        <View style={runUI.support}>
          <View style={runUI.supportItem}><Text style={runUI.label}>걸음</Text><Text style={runUI.supportValue}>{run.lastMotion != null || run.steps > 0 ? run.steps : '—'}</Text></View>
          <View style={runUI.supportItem}><Text style={runUI.label}>평균 케이던스</Text><Text style={runUI.supportValue}>{runNumber(run.averageCadence)} spm</Text></View>
          <View style={runUI.supportItem}><Text style={runUI.label}>최대 심박</Text><Text style={runUI.supportValue}>{runNumber(run.maxHeartRate)} bpm</Text></View>
        </View>
        <Text style={runUI.footnote}>심박·동작 통계는 실제 수집된 자료만 반영해요.</Text>
        <RunDisclosure label={feedback ? '러닝 메모' : '러닝 메모 남기기'} open={memoOpen} onPress={() => setMemoOpen(value => !value)}>
          <Text style={styles.subtitle}>느낀 점이나 비교 앱의 거리·시간을 남겨 주세요. 선택 사항이에요.</Text>
          <TextInput style={[styles.text, { backgroundColor: Colors.bgCard, padding: 16, minHeight: 96, borderRadius: 16 }]} accessibilityLabel="러닝 메모" placeholder="오늘의 러닝은 어땠나요?" placeholderTextColor={Colors.textMuted} multiline maxLength={500} value={feedback} onChangeText={setFeedback} />
          <ThemedButton title="메모 저장" variant="outline" disabled={busy || run.status !== 'completed'} onPress={() => void act(async () => { await Tracking!.feedback(id, feedback); setData(await Tracking!.detail(id)); })} />
        </RunDisclosure>
        <RunDisclosure label="팀 테스트 진단" open={diagnosticOpen} onPress={() => setDiagnosticOpen(value => !value)}>
          <Text style={styles.subtitle}>측정 상태를 팀과 확인할 때 사용해요. 원본 좌표와 개별 심박은 복사하지 않습니다.</Text>
          <ThemedButton title="진단 요약 복사" variant="outline" disabled={busy} onPress={() => void act(async () => { const latest = await Tracking!.detail(id); await Tracking!.copySummary(diagnosticSummary(latest.summary, version, device)); Alert.alert('복사했어요', '팀에 공유할 진단 요약을 복사했습니다.'); })} />
          <Card><Text selectable style={styles.subtitle}>{diagnosticSummary(run, version, device)}</Text></Card>
          <Text style={styles.subtitle}>마지막 저장: {run.lastSaved ? new Date(run.lastSaved * 1000).toLocaleString('ko-KR') : '없음'} · 구간 {run.segments}</Text>
        </RunDisclosure>
        <ThemedButton title="기록 삭제" variant="outline" disabled={busy || run.status !== 'completed'} onPress={() => Alert.alert('기록을 삭제할까요?', '원본 좌표와 진단도 함께 삭제됩니다.', [{ text: '취소', style: 'cancel' }, { text: '삭제', style: 'destructive', onPress: () => void act(async () => { await Tracking!.deleteRecord(id); router.back(); }) }])} />
      </> : null}
    </ScrollView>
  </SafeAreaView>;
}
