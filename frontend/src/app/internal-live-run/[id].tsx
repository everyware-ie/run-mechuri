import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/screen-header';
import { Colors } from '@/constants/theme';
import { trackingStyles as styles } from '@/components/internal-run-styles';
import { liveRunDestination, validLiveRunID } from '@/lib/live-run-link';
import { Tracking, trackingEnabled } from '../../../modules/run-tracking/src/RunTracking';

export default function LiveRunEntry() {
  const { id } = useLocalSearchParams<{ id: string }>();
  if (!trackingEnabled || !validLiveRunID(id)) return <Redirect href="/" />;
  return <LiveRunResolver key={id} id={id} />;
}

function LiveRunResolver({ id }: { id: string }) {
  const [destination, setDestination] = useState<ReturnType<typeof liveRunDestination> | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    void Promise.all([Tracking!.state(), Tracking!.records()]).then(([state, history]) => {
      if (alive) setDestination(liveRunDestination(id, state.summary?.id, history.records.map(run => run.id)));
    }).catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, [id, attempt]);
  if (destination) return <Redirect href={destination} />;
  return <SafeAreaView style={styles.safe}>
    <ScreenHeader title="러닝" />
    <View style={{ padding: 24, gap: 16 }}>
      {error ? <>
        <Text style={styles.notice}>러닝 상태를 확인하지 못했어요. 기록은 그대로 보관되어 있어요.</Text>
        <Pressable accessibilityRole="button" onPress={() => { setError(false); setAttempt(value => value + 1); }}><Text style={styles.link}>다시 확인</Text></Pressable>
      </> : <ActivityIndicator color={Colors.accent} accessibilityLabel="러닝 상태 확인 중" />}
    </View>
  </SafeAreaView>;
}
