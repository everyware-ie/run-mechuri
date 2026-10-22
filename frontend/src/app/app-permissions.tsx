import { Redirect, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { useCallback, useRef, useState } from 'react';
import { AppState, Linking, ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/screen-header';
import { Card, ThemedButton } from '@/components/ui';
import { Tracking, trackingEnabled } from '../../modules/run-tracking/src/RunTracking';
import { trackingStyles as styles } from '@/components/internal-run-styles';
import { readAppPermissions, type PermissionItem } from '@/lib/tracking-permissions';

export default function AppPermissions() {
  const [items, setItems] = useState<PermissionItem[]>([]);
  const [error, setError] = useState('');
  const [settingsError, setSettingsError] = useState('');
  const retry = useRef<(() => Promise<void>) | null>(null);
  useFocusEffect(useCallback(() => {
    if (!trackingEnabled) return;
    let alive = true, request = 0;
    setSettingsError('');
    const update = async () => {
      const current = ++request;
      try {
        const result = await readAppPermissions([Tracking!.state(), ImagePicker.getCameraPermissionsAsync(), MediaLibrary.getPermissionsAsync(true)]);
        if (!alive || current !== request || AppState.currentState !== 'active') return;
        setItems(result.items);
        setError(result.failed ? '일부 권한 상태를 확인하지 못했어요. 다시 확인해 주세요.' : '');
      } catch { if (alive && current === request && AppState.currentState === 'active') setError('권한 상태를 확인하지 못했어요. 다시 확인해 주세요.'); }
    };
    retry.current = update;
    void update();
    const subscription = AppState.addEventListener('change', status => { if (status === 'active') void update(); else request++; });
    return () => { alive = false; retry.current = null; subscription.remove(); };
  }, []));
  if (!trackingEnabled) return <Redirect href="/" />;
  return <SafeAreaView style={styles.safe}><ScreenHeader title="앱 권한" /><ScrollView contentContainerStyle={styles.body}>
    <Text style={styles.subtitle}>필요한 기능을 사용할 때 권한을 요청합니다. 실제 허용·철회는 OS에서 변경하며 돌아오면 상태를 다시 확인합니다.</Text>
    {error ? <><Text style={styles.notice}>{error}</Text><ThemedButton title="권한 다시 확인" variant="outline" onPress={() => void retry.current?.()} /></> : null}
    {items.map(item => <Card key={item.title}><Text style={styles.text}>{item.title} · {item.status}</Text><Text style={styles.subtitle}>{item.reason}</Text></Card>)}
    <ThemedButton title="iOS 앱 설정 열기" onPress={() => {
      setSettingsError('');
      void Linking.openSettings().catch(() => setSettingsError('설정 화면을 열지 못했어요. 아이폰의 설정 → 앱 → Runary에서 권한을 확인해 주세요.'));
    }} />
    {settingsError ? <Text style={styles.notice}>{settingsError}</Text> : null}
    <Text style={styles.subtitle}>건강 데이터는 건강 앱의 앱별 데이터 접근에서 Runary를 확인해 주세요. 변경 후 돌아와 중단한 러닝을 직접 재개할 수 있습니다.</Text>
  </ScrollView></SafeAreaView>;
}
