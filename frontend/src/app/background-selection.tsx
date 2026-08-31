import { Asset } from 'expo-asset';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Button, Image, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCreationFlow } from '@/state/creation-flow';

// FRD: docs/specs/frd/background-selection.md
// v0: §1 MVP 기본 범위(기본 이미지)만 구현. 갤러리·촬영은 여유 시라 이후.
// §2-2: 실제 기본 이미지 3장은 아직 없음(디자인 시스템 나온 뒤 phs00이 고름).
// 지금은 번들에 있는 아이콘을 자리표시자로 쓴다.

const PLACEHOLDER_IMAGE = require('../../assets/images/splash-icon.png');

export default function BackgroundSelectionScreen() {
  const [localUri, setLocalUri] = useState<string | null>(null);
  const { setBackground } = useCreationFlow();

  useEffect(() => {
    const asset = Asset.fromModule(PLACEHOLDER_IMAGE);
    asset.downloadAsync().then(() => setLocalUri(asset.localUri));
  }, []);

  const handleConfirm = () => {
    if (!localUri) return;
    setBackground(localUri);
    router.push('/share');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.notice}>
          기본 이미지 자리표시자예요. 실제 기본 이미지 3장은 디자인 시스템이 나온 뒤 정해집니다.
        </Text>
        <Image source={PLACEHOLDER_IMAGE} style={styles.preview} resizeMode="cover" />
        <Button title="이걸로 진행" onPress={handleConfirm} disabled={!localUri} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { flex: 1, padding: 24, gap: 16, alignItems: 'center' },
  notice: { color: '#888', fontSize: 12, textAlign: 'center' },
  preview: { width: 270, height: 480, borderRadius: 12, backgroundColor: '#111' },
});
