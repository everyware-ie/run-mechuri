import * as MediaLibrary from 'expo-media-library';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Button, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { addResult } from '@/lib/results-store';
import { useCreationFlow } from '@/state/creation-flow';

import RouteRenderer from '../../modules/route-renderer/src/RouteRendererModule';

// FRD: docs/specs/frd/export-and-share.md
// v0 스코프: 인스타 공유(§3)는 4단계(인스타 브릿지) 이후. 지금은 §4 기기 저장까지만.
// §2-2: 공유 화면에 들어온 시점이 아니라, 인코딩이 실제로 끝난 시점에만 완성으로 친다
// (S8 리뷰에서 나온 그 모호함을 여기서는 처음부터 이렇게 설계함).

type RenderState = 'rendering' | 'done' | 'error';

export default function ShareScreen() {
  const { draft, reset } = useCreationFlow();
  const [state, setState] = useState<RenderState>('rendering');
  const [outputPath, setOutputPath] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  useEffect(() => {
    const { selectedRun, track, backgroundImagePath } = draft;
    if (!selectedRun || !track || !backgroundImagePath) {
      setState('error');
      return;
    }

    RouteRenderer.renderClip({
      points: track.coordinates.map((c) => ({ latitude: c.latitude, longitude: c.longitude })),
      backgroundImagePath,
      outputFileName: `mechuri-${selectedRun.id}-${Date.now()}`,
    })
      .then(async (result) => {
        // 완성 시점 = 인코딩 완료 시점. 여기서만 보관함에 추가한다.
        await addResult({
          id: selectedRun.id,
          runDate: selectedRun.date,
          distanceMeters: selectedRun.distanceMeters,
          outputPath: result.outputPath,
          createdAt: new Date().toISOString(),
        });
        setOutputPath(result.outputPath);
        setState('done');
      })
      .catch(() => setState('error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSaveToPhotos = async () => {
    if (!outputPath) return;
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') {
      setSaveStatus('사진 저장 권한이 거부됐어요. 인스타 공유는 4단계에서 붙습니다.');
      return;
    }
    try {
      await MediaLibrary.saveToLibraryAsync(outputPath);
      setSaveStatus('기기에 저장했어요');
    } catch {
      setSaveStatus('저장에 실패했어요');
    }
  };

  const handleDone = () => {
    reset();
    router.replace('/');
  };

  if (state === 'rendering') {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator />
        <Text>결과물 만드는 중...</Text>
      </SafeAreaView>
    );
  }

  if (state === 'error') {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.title}>결과물을 만들지 못했어요</Text>
        <Button title="처음으로" onPress={handleDone} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.center}>
      <Text style={styles.title}>완성!</Text>
      <Text style={styles.path}>{outputPath}</Text>
      <Button title="기기에 저장" onPress={handleSaveToPhotos} />
      {saveStatus && <Text>{saveStatus}</Text>}
      <Text style={styles.notice}>인스타그램 공유는 4단계(인스타 브릿지)에서 붙습니다.</Text>
      <Button title="홈으로" onPress={handleDone} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  title: { fontSize: 20, fontWeight: '600' },
  path: { fontSize: 12, fontFamily: 'Menlo', color: '#555', textAlign: 'center' },
  notice: { color: '#888', fontSize: 12, textAlign: 'center' },
});
