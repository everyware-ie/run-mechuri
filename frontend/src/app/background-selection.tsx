import { Asset } from 'expo-asset';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Dimensions, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RoutePreview } from '@/components/route-preview';
import { ScreenHeader } from '@/components/screen-header';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { DEFAULT_BACKGROUNDS } from '@/constants/default-backgrounds';
import { useCreationFlow } from '@/state/creation-flow';

// FRD: docs/specs/frd/background-selection.md
// v0: §1 MVP 기본 범위(기본 이미지 3장)만. 갤러리·촬영은 여유 시라 이후 — 시안 S5에는
// "갤러리" 슬롯이 있어 자리만 두되 아직 안 붙였다.
// 실제 이미지 3장은 아직 없음(§2-2) — frontend/src/constants/default-backgrounds.ts에서 교체.
// 디자인: "3안" 시안 S5 — 배경+경로 합성 큰 카드 + 기본 이미지 가로 스와치 + 갤러리 슬롯.

export default function BackgroundSelectionScreen() {
  const [selectedId, setSelectedId] = useState(DEFAULT_BACKGROUNDS[0].id);
  const [localUri, setLocalUri] = useState<string | null>(null);
  const { draft, setBackground } = useCreationFlow();

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
  const cardWidth = Dimensions.get('window').width - 48;
  const cardHeight = Math.min(452, Dimensions.get('window').height * 0.52);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScreenHeader
        title="배경"
        right={
          localUri ? (
            <Text onPress={handleConfirm} style={styles.headerAction}>
              다음
            </Text>
          ) : undefined
        }
      />

      <View style={styles.body}>
        <View style={[styles.card, { width: cardWidth, height: cardHeight }]}>
          {selectedBackground && (
            <Image source={selectedBackground.source} style={StyleSheet.absoluteFill} resizeMode="cover" />
          )}
          {draft.track && draft.selectedRun && (
            <RoutePreview
              points={draft.track.coordinates}
              preset={draft.preset}
              transform={draft.transform}
              smoothOptions={draft.smoothOptions}
              run={draft.selectedRun}
              stampConfig={draft.stampConfig}
              isInteracting={false}
              viewWidth={cardWidth}
              viewHeight={cardHeight}
            />
          )}
          <Text style={styles.cardTag}>9:16 · 가로 채움</Text>
        </View>

        <Text style={styles.sectionLabel}>기본 이미지 · BACKGROUND</Text>
        <View style={styles.swatchRow}>
          {DEFAULT_BACKGROUNDS.map((bg) => {
            const on = bg.id === selectedId;
            return (
              <Pressable
                key={bg.id}
                onPress={() => setSelectedId(bg.id)}
                style={[styles.swatch, on && styles.swatchOn]}>
                <Image source={bg.source} style={styles.swatchImg} resizeMode="cover" />
              </Pressable>
            );
          })}
          <View style={[styles.swatch, styles.swatchGallery]}>
            <Text style={styles.swatchGalleryText}>갤러리</Text>
          </View>
        </View>

        <Text style={styles.note}>
          자리표시자예요. 실제 기본 이미지 3장은 디자인이 나온 뒤 정해집니다. 갤러리에서
          고르기는 이후에 붙습니다.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.bg },
  headerAction: { fontFamily: 'JetBrainsMono_500Medium', fontSize: 12, color: Colors.accent },
  body: { flex: 1, paddingHorizontal: 24, gap: Spacing.md, alignItems: 'stretch' },
  card: {
    alignSelf: 'center',
    borderRadius: Radius.card,
    overflow: 'hidden',
    backgroundColor: Colors.bgCard,
  },
  cardTag: {
    position: 'absolute',
    top: 14,
    left: 16,
    fontFamily: 'JetBrainsMono_500Medium',
    fontSize: 9.5,
    letterSpacing: 1.4,
    color: Colors.textMuted,
  },
  sectionLabel: {
    fontFamily: 'JetBrainsMono_500Medium',
    fontSize: 10,
    letterSpacing: 1.4,
    color: Colors.textMuted,
  },
  swatchRow: { flexDirection: 'row', gap: 9 },
  swatch: {
    flex: 1,
    height: 64,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bgCard,
  },
  swatchOn: { borderColor: Colors.accent },
  swatchImg: { width: '100%', height: '100%' },
  swatchGallery: {
    borderStyle: 'dashed',
    borderColor: Colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchGalleryText: { fontFamily: 'JetBrainsMono_500Medium', fontSize: 9.5, color: Colors.textMuted },
  note: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 11,
    lineHeight: 17,
    color: Colors.textMuted,
  },
});
