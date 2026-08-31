import { useState } from 'react';
import { Button, ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import HealthKitBridge from '../../modules/health-kit-bridge/src/HealthKitBridgeModule';
import type { RunRecord } from '../../modules/health-kit-bridge/src/HealthKitBridge.types';

// 임시 확인 화면. FRD: docs/specs/frd/run-record-selection.md
// 목적은 UI가 아니라 "HealthKit에서 실외 러닝 좌표가 실제로 읽히는가"(코어 루프 관통의 첫 단계) 확인.
// 디자인 시스템(1a 야간 네온)이 나오면 이 화면은 통째로 갈아끼운다.

export default function HomeScreen() {
  const [status, setStatus] = useState('아직 시도 안 함');
  const [runs, setRuns] = useState<RunRecord[]>([]);

  const handleCheck = async () => {
    try {
      setStatus('권한 요청 중...');
      const granted = await HealthKitBridge.requestAuthorization();
      if (!granted) {
        setStatus('권한 거부됨');
        return;
      }

      setStatus('워크아웃 조회 중...');
      const outdoorRuns = await HealthKitBridge.getOutdoorRuns();
      setRuns(outdoorRuns);
      setStatus(`실외 러닝 ${outdoorRuns.length}건 조회됨`);
    } catch (error) {
      setStatus(`에러: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>HealthKit 연결 확인</Text>
        <Button title="권한 요청 + 실외 러닝 불러오기" onPress={handleCheck} />
        <Text style={styles.status}>{status}</Text>

        {runs.map((run) => (
          <Text key={run.id} style={styles.runLine}>
            {run.date.slice(0, 10)} · {(run.distanceMeters / 1000).toFixed(2)}km ·{' '}
            {run.hasRoute ? '좌표 있음' : '좌표 없음(§2-2)'}
            {run.averageHeartRate ? ` · ${Math.round(run.averageHeartRate)}bpm` : ''}
          </Text>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { padding: 24, gap: 12 },
  title: { fontSize: 20, fontWeight: '600' },
  status: { fontSize: 14, color: '#555' },
  runLine: { fontSize: 13, fontFamily: 'Menlo' },
});
