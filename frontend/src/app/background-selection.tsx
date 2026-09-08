import { Asset } from 'expo-asset';
import { router } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
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

// 실기기 피드백(2026-09-03): "다시 편집 → 결과물을 만들지 못했어요" — Asset.localUri(캐시
// 디렉터리, 또는 앱 번들 안 경로)는 iOS 컨테이너 UUID에 묶여 있어서, 앱을 다시
// 설치(새 dev-client 빌드 등)하면 그 절대경로가 더 이상 존재하지 않는다. 저장된
// 결과물(SavedResult)의 backgroundImagePath는 만든 그 순간의 경로를 그대로 문자열로
// 들고 있다가 "다시 편집" 때 재사용하는데, 그 사이 재설치가 있었으면 그 파일을 못
// 찾아 렌더러가 실패한다(캐시 디렉터리는 저장공간 부족 시 iOS가 알아서 지우기도
// 해서, 재설치 없이도 이론상 같은 문제가 날 수 있다). documentDirectory(앱이 직접
// 관리하는, iOS가 함부로 안 지우는 자리)에 한 번 복사해 두고 그 경로를 쓰면 최소한
// "같은 설치가 유지되는 동안"은 안전해진다 — 완전 재설치까지는 못 막지만, 훨씬
// 흔한 "저장공간 부족으로 캐시 삭제" 케이스는 막는다.
const BACKGROUNDS_DIR = `${FileSystem.documentDirectory}backgrounds/`;

async function ensurePersistentBackground(id: string, sourceUri: string): Promise<string> {
  const dest = `${BACKGROUNDS_DIR}${id}.jpg`;
  const info = await FileSystem.getInfoAsync(dest);
  if (info.exists) return dest;
  try {
    await FileSystem.makeDirectoryAsync(BACKGROUNDS_DIR, { intermediates: true });
  } catch {
    // 이미 있으면 무시 — intermediates:true라도 네이티브 쪽에서 예외를 던질 수 있어 방어적으로 감싼다.
  }
  await FileSystem.copyAsync({ from: sourceUri, to: dest });
  return dest;
}

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

  const handleConfirm = async () => {
    if (!localUri) return;
    const persistentUri = await ensurePersistentBackground(selectedId, localUri);
    setBackground(persistentUri);
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
            // 실기기 피드백(2026-09-02): "다음 버튼 인식이 잘 안 된다" — Text에
            // onPress를 바로 건 예전 방식은 실제 렌더된 글자 크기(12px)만큼만
            // 탭 영역이 잡힌다. 헤더의 뒤로가기(Pressable hitSlop)와 같은
            // 방식으로 맞춘다.
            <Pressable onPress={handleConfirm} hitSlop={12}>
              <Text style={styles.headerAction}>다음</Text>
            </Pressable>
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
  // 실기기 피드백(2026-09-02): 배경 사진은 9:16 세로 사진인데 스와치는 가로로
  // 납작한 64px 높이라, cover로 채우면 사진의 아주 좁은 가로 띠만 보이고 대부분이
  // 잘려 나갔다. 스와치 자체를 사진과 같은 9:16 비율로 만들면 cover를 유지해도
  // 사진 전체가 실제 구도 그대로 보인다.
  swatch: {
    flex: 1,
    aspectRatio: 9 / 16,
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
