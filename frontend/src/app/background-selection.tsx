import { Asset } from 'expo-asset';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedButton } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { DEFAULT_BACKGROUNDS } from '@/constants/default-backgrounds';
import { useCreationFlow } from '@/state/creation-flow';

// FRD: docs/specs/frd/background-selection.md
// v0: §1 MVP 기본 범위(기본 이미지 3장)만 구현. 갤러리·촬영은 여유 시라 이후.
// 실제 이미지 3장은 아직 없음(§2-2) — frontend/src/constants/default-backgrounds.ts에서 교체.
// 디자인: "1a 야간 네온"

export default function BackgroundSelectionScreen() {
  const [selectedId, setSelectedId] = useState(DEFAULT_BACKGROUNDS[0].id);
  const [localUri, setLocalUri] = useState<string | null>(null);
  const { setBackground } = useCreationFlow();

  useEffect(() => {
    const selected = DEFAULT_BACKGROUNDS.find((bg) => bg.id === selectedId);
    if (!selected) return;
    const asset = Asset.fromModule(selected.source);
    asset.downloadAsync().then(() => setLocalUri(asset.localUri));
  }, [selectedId]);

  const handleConfirm = () => {
    if (!localUri) return;
    setBackground(localUri);
    router.push('/edit');
  };

  const selectedBackground = DEFAULT_BACKGROUNDS.find((bg) => bg.id === selectedId);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.notice}>
          자리표시자예요. 실제 기본 이미지 3장은 디자인 시스템이 나온 뒤 정해집니다.
        </Text>

        {selectedBackground && (
          <Image source={selectedBackground.source} style={styles.preview} resizeMode="cover" />
        )}

        <ScrollView horizontal contentContainerStyle={styles.thumbRow}>
          {DEFAULT_BACKGROUNDS.map((bg) => (
            <Pressable
              key={bg.id}
              onPress={() => setSelectedId(bg.id)}
              style={[styles.thumbWrap, bg.id === selectedId && styles.thumbWrapSelected]}>
              <Image source={bg.source} style={styles.thumb} resizeMode="cover" />
            </Pressable>
          ))}
        </ScrollView>

        <ThemedButton title="이걸로 진행" onPress={handleConfirm} disabled={!localUri} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.bg },
  container: { flex: 1, padding: Spacing.lg, gap: Spacing.md, alignItems: 'center' },
  notice: {
    fontFamily: 'JetBrainsMono_500Medium',
    color: Colors.textMuted,
    fontSize: 11,
    textAlign: 'center',
  },
  preview: { width: 270, height: 480, borderRadius: Radius.card, backgroundColor: Colors.bgCard },
  thumbRow: { gap: Spacing.sm },
  thumbWrap: { borderRadius: 14, borderWidth: 2, borderColor: 'transparent' },
  thumbWrapSelected: { borderColor: Colors.accent },
  thumb: { width: 64, height: 114, borderRadius: 10, backgroundColor: Colors.bgCard },
});
