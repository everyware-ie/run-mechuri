import { SymbolView } from 'expo-symbols';
import { router, useLocalSearchParams } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { InstagramMissingSheet } from '@/components/instagram-missing-sheet';
import { RouteThumbnail } from '@/components/route-thumbnail';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedButton } from '@/components/ui';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { deleteResult, getResult, type SavedResult } from '@/lib/results-store';
import { useCreationFlow } from '@/state/creation-flow';

import InstagramStoryShare from '../../../modules/instagram-story-share/src/InstagramStoryShareModule';

// FRD: docs/specs/frd/home-and-library.md §2-2
// "보기 / 공유 / 다시 편집 / 같은 기록으로 새로 만들기 / 삭제"
// 보기는 v0는 정지 이미지(썸네일 크게)로 대신한다 — 영상 재생 라이브러리는 아직 안 붙임.
// 공유(2026-09-08 추가): mp4가 이미 outputPath에 있으므로 share.tsx처럼 다시 인코딩할
// 필요 없이 바로 인스타그램 스토리로 넘긴다.

export default function ResultDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { loadDraft } = useCreationFlow();
  const [result, setResult] = useState<SavedResult | null | undefined>(undefined);
  const [showMissingSheet, setShowMissingSheet] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    getResult(id).then(setResult);
  }, [id]);

  const handleReEdit = async () => {
    if (!result) return;
    // 실기기 피드백(2026-09-03): "다시 편집 → 결과물을 만들지 못했어요" — 예전에
    // 만든 결과물의 backgroundImagePath가 그 사이 앱이 재설치되거나(새 dev-client
    // 빌드 등) 저장공간 부족으로 iOS가 캐시를 정리해서 더 이상 못 찾는 경우가
    // 있다(background-selection.tsx가 이제 documentDirectory에 복사해 두지만,
    // 이 fix 이전에 만들어진 결과물은 여전히 옛 경로를 들고 있다). 편집을 다
    // 해놓고 마지막(공유 화면) 단계에서야 실패하면 그동안의 편집이 헛수고가
    // 되니, 시작하기 전에 미리 확인해서 배경만 다시 고르게 안내한다 — 나머지
    // 편집값(프리셋·변형·다듬기·각인)은 그대로 유지.
    const bgInfo = await FileSystem.getInfoAsync(result.backgroundImagePath);
    if (!bgInfo.exists) {
      Alert.alert('배경 이미지를 다시 골라야 해요', '이전에 쓴 배경 사진을 더 이상 찾을 수 없어요. 배경만 다시 골라주세요 — 나머지 편집 내용은 그대로 유지됩니다.', [
        {
          text: '확인',
          onPress: () => {
            loadDraft({
              backgroundImagePath: null,
              backgroundPhoto: undefined,
              selectedRun: result.run,
              track: result.track,
              preset: result.preset,
              transform: result.transform,
              smoothOptions: result.smoothOptions,
              stampConfig: result.stampConfig,
            });
            router.push('/background-selection');
          },
        },
      ]);
      return;
    }
    // §2-2: "다시 편집"은 그때의 편집값 그대로 연다.
    loadDraft({
      selectedRun: result.run,
      track: result.track,
      backgroundImagePath: result.backgroundImagePath,
      backgroundPhoto: result.backgroundPhoto,
      preset: result.preset,
      transform: result.transform,
      smoothOptions: result.smoothOptions,
      stampConfig: result.stampConfig,
    });
    router.push('/edit');
  };

  const handleShareToInstagram = async () => {
    if (!result) return;
    // 배경 이미지와 같은 이유로 outputPath도 재설치 등으로 사라졌을 수 있다
    // (background-selection.md "다시 편집이 결과물을 못 만들던 문제" 참고). mp4는
    // 배경 사진과 달리 "다시 고르기"로 복구가 안 되니(재인코딩해야 함), 여기선
    // 다시 편집/새로 만들기로 안내한다.
    const info = await FileSystem.getInfoAsync(result.outputPath);
    if (!info.exists) {
      Alert.alert(
        '영상을 더 이상 찾을 수 없어요',
        '이 결과물의 영상 파일이 사라졌어요. "다시 편집"이나 "같은 기록으로 새로 만들기"로 다시 만들어주세요.'
      );
      return;
    }
    // export-and-share FRD §3-2: 인스타그램이 없으면 저장으로 안내한다. 여기선
    // "보관함으로 돌아가기"가 곧 "저장된 채 유지"라 별도 저장 버튼 없이 안내만 한다.
    const canOpen = await Linking.canOpenURL('instagram-stories://share');
    if (!canOpen) {
      // "3a" 시안 S8b-상세: OS Alert 대신 앱 디자인에 맞춘 카드로 안내한다. 이 화면은
      // 이미 보관함에 저장된 결과물이라 별도 저장 동작 없이 닫기만 준다.
      setShowMissingSheet(true);
      return;
    }
    try {
      await InstagramStoryShare.shareToStory(result.outputPath, result.backgroundImagePath);
    } catch (error) {
      console.warn('InstagramStoryShare.shareToStory failed', error);
      Alert.alert('인스타그램으로 보내지 못했어요', '이 결과물은 보관함에 그대로 남아있어요.');
    }
  };

  const handleSaveToPhotos = async () => {
    if (!result) return;
    // share.tsx의 handleSaveToPhotos와 같은 이유로 legacy 서브패스에서 불러온다
    // (expo-media-library 57에서 기본 진입점의 saveToLibraryAsync가 항상 실패하는 껍데기로
    // 바뀜). 여기선 이미 완성된 결과물이라 outputPath만 그대로 넘긴다.
    const MediaLibrary = await import('expo-media-library');
    const { saveToLibraryAsync } = await import('expo-media-library/legacy');
    const { status } = await MediaLibrary.requestPermissionsAsync(true);
    if (status !== 'granted') {
      setSaveStatus('사진 저장 권한이 필요해요. 설정에서 허용해주세요.');
      return;
    }
    try {
      await saveToLibraryAsync(result.outputPath);
      setSaveStatus('기기에 저장했어요');
    } catch (error) {
      console.warn('saveToLibraryAsync failed', error);
      setSaveStatus('저장에 실패했어요');
    }
  };

  const handleMakeAnother = () => {
    if (!result) return;
    // §2-2: "같은 기록으로 새로 만들기"는 렌더러 초기값에서 시작한다(result-editing §8).
    // 배경은 다시 고를 수 있게 배경 선택부터.
    loadDraft({ selectedRun: result.run, track: result.track });
    router.push('/background-selection');
  };

  const handleDelete = () => {
    if (!result) return;
    Alert.alert('결과물을 삭제할까요?', '되돌릴 수 없어요.', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          await deleteResult(result.id);
          router.replace('/');
        },
      },
    ]);
  };

  if (result === undefined) return <SafeAreaView style={styles.safeArea} />;
  if (result === null) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader title="결과물" />
        <View style={styles.center}>
          <Text style={styles.notice}>결과물을 찾을 수 없어요.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScreenHeader title="결과물" />
      <View style={styles.container}>
        <View style={styles.previewBox}>
          <RouteThumbnail
            points={result.track.coordinates}
            transform={result.transform}
            smoothOptions={result.smoothOptions}
            run={result.run}
            stampConfig={result.stampConfig}
            backgroundImagePath={result.backgroundImagePath}
            framing="content"
            size={270}
          />
        </View>
        <Text style={styles.distance}>{(result.distanceMeters / 1000).toFixed(2)}km</Text>
        <Text style={styles.meta}>{result.runDate.slice(0, 10)}</Text>

        <View style={styles.actionColumn}>
          {/* share.tsx S8b와 같은 구성(2026-09-08): 주 버튼(인스타그램 공유) + 저장
              아이콘 버튼 한 줄. */}
          <View style={styles.primaryRow}>
            <ThemedButton title="인스타그램 스토리로 공유" onPress={handleShareToInstagram} style={styles.shareButton} />
            <Pressable onPress={handleSaveToPhotos} style={styles.iconButton} hitSlop={8}>
              <SymbolView name="square.and.arrow.down" size={20} tintColor={Colors.text} />
            </Pressable>
          </View>
          {saveStatus && <Text style={styles.notice}>{saveStatus}</Text>}
          <ThemedButton title="다시 편집" variant="outline" onPress={handleReEdit} />
          <ThemedButton title="같은 기록으로 새로 만들기" variant="outline" onPress={handleMakeAnother} />
          <ThemedButton title="삭제" variant="outline" onPress={handleDelete} />
        </View>
      </View>

      <InstagramMissingSheet
        visible={showMissingSheet}
        description="대신 기기에 저장해서 나중에 올려주세요."
        primaryLabel="기기에 저장"
        onPrimary={() => {
          setShowMissingSheet(false);
          handleSaveToPhotos();
        }}
        onClose={() => setShowMissingSheet(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center' },
  container: { flex: 1, alignItems: 'center', padding: Spacing.lg, gap: Spacing.sm },
  previewBox: {
    width: 270,
    height: 270,
    borderRadius: Radius.card,
    overflow: 'hidden',
    backgroundColor: Colors.bgCard,
  },
  distance: { fontFamily: Fonts.sansBold, fontSize: 26, color: Colors.text, marginTop: Spacing.sm },
  meta: { fontFamily: Fonts.sans, fontSize: 12, color: Colors.textMuted },
  notice: { fontFamily: Fonts.sans, color: Colors.textMuted, fontSize: 12 },
  actionColumn: { alignSelf: 'stretch', gap: Spacing.sm, marginTop: Spacing.lg },
  primaryRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  shareButton: { flex: 1 },
  iconButton: {
    width: 52,
    height: 52,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
