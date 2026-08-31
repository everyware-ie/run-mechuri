import { Asset } from 'expo-asset';
import { useState } from 'react';
import { Button, ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import HealthKitBridge from '../../modules/health-kit-bridge/src/HealthKitBridgeModule';
import type { RunRecord } from '../../modules/health-kit-bridge/src/HealthKitBridge.types';
import RouteRenderer from '../../modules/route-renderer/src/RouteRendererModule';

// 임시 확인 화면. 목적은 UI가 아니라 브릿지 3건이 실제로 도는가 확인(코어 루프 관통의 앞 두 단계).
// 디자인 시스템(1a 야간 네온)이 나오면 이 화면은 통째로 갈아끼운다.

// 렌더러 단독 테스트용 가짜 경로. HealthKit과 분리해서, 렌더링 파이프라인
// 자체가 도는지 먼저 확인한다 (문제가 나면 어느 브릿지 탓인지 구분하기 위함).
const TEST_ROUTE = [
  { latitude: 37.5665, longitude: 126.978 },
  { latitude: 37.5675, longitude: 126.979 },
  { latitude: 37.5685, longitude: 126.9805 },
  { latitude: 37.5675, longitude: 126.982 },
  { latitude: 37.5665, longitude: 126.981 },
];

export default function HomeScreen() {
  const [healthStatus, setHealthStatus] = useState('아직 시도 안 함');
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [renderStatus, setRenderStatus] = useState('아직 시도 안 함');
  const [outputPath, setOutputPath] = useState<string | null>(null);

  const handleCheckHealth = async () => {
    try {
      setHealthStatus('권한 요청 중...');
      const granted = await HealthKitBridge.requestAuthorization();
      if (!granted) {
        setHealthStatus('권한 거부됨');
        return;
      }

      setHealthStatus('워크아웃 조회 중...');
      const outdoorRuns = await HealthKitBridge.getOutdoorRuns();
      setRuns(outdoorRuns);
      setHealthStatus(`실외 러닝 ${outdoorRuns.length}건 조회됨`);
    } catch (error) {
      setHealthStatus(`에러: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleTestRender = async () => {
    try {
      setRenderStatus('배경 이미지 준비 중...');
      // 실제 기본 이미지가 아직 없어서, 앱에 이미 들어 있는 스플래시 아이콘을
      // 임시 배경으로 쓴다. 파이프라인이 도는지만 본다.
      const asset = Asset.fromModule(require('../../assets/images/splash-icon.png'));
      await asset.downloadAsync();
      if (!asset.localUri) {
        setRenderStatus('배경 이미지 로컬 경로를 못 찾음');
        return;
      }

      setRenderStatus('렌더링 중 (몇 초 걸릴 수 있음)...');
      const result = await RouteRenderer.renderClip({
        points: TEST_ROUTE,
        backgroundImagePath: asset.localUri,
        outputFileName: `test-clip-${Date.now()}`,
        preset: 'default-drawing',
        transform: { x: 0, y: 0, scale: 1, rotationDeg: 0 },
      });
      setOutputPath(result.outputPath);
      setRenderStatus('완료 — mp4 생성됨');
    } catch (error) {
      setRenderStatus(`에러: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>HealthKit 연결 확인</Text>
        <Button title="권한 요청 + 실외 러닝 불러오기" onPress={handleCheckHealth} />
        <Text style={styles.status}>{healthStatus}</Text>

        {runs.map((run) => (
          <Text key={run.id} style={styles.runLine}>
            {run.date.slice(0, 10)} · {(run.distanceMeters / 1000).toFixed(2)}km ·{' '}
            {run.hasRoute ? '좌표 있음' : '좌표 없음(§2-2)'}
            {run.averageHeartRate ? ` · ${Math.round(run.averageHeartRate)}bpm` : ''}
          </Text>
        ))}

        <Text style={styles.title}>렌더러 확인 (가짜 경로)</Text>
        <Button title="테스트 렌더링" onPress={handleTestRender} />
        <Text style={styles.status}>{renderStatus}</Text>
        {outputPath && (
          <>
            <Text style={styles.runLine}>{outputPath}</Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { padding: 24, gap: 12 },
  title: { fontSize: 20, fontWeight: '600', marginTop: 12 },
  status: { fontSize: 14, color: '#555' },
  runLine: { fontSize: 13, fontFamily: 'Menlo' },
});
