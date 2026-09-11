import { Asset } from 'expo-asset';
import { SymbolView } from 'expo-symbols';
import { router, useLocalSearchParams } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PhotoBackgroundPreview } from '@/components/photo-background-preview';
import { RoutePreview } from '@/components/route-preview';
import { ScreenHeader } from '@/components/screen-header';
import { DEFAULT_BACKGROUNDS } from '@/constants/default-backgrounds';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { useBackgroundTask } from '@/hooks/use-background-task';
import { BACKGROUNDS_DIR, persistBackground, type PhotoBackground } from '@/lib/background-storage';
import { INITIAL_PHOTO_CROP, type PhotoCrop } from '@/lib/photo-crop';
import { preparePhoto, renderPhotoBackground } from '@/lib/photo-processing';
import { useCreationFlow } from '@/state/creation-flow';

type PhotoSelection = { kind: 'photo'; photo: PhotoBackground; rawUri?: string; saved?: boolean };
type Selection = { kind: 'default'; id: string } | { kind: 'existing'; uri: string } | PhotoSelection;
const removeFiles = (paths: string[]) => Promise.all(paths.map(uri => FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {})));

// FRD: 배경 선택 §3 사진 선택·촬영, §4 빈틈없는 9:16 조정, §6 취소 시 앞선 선택 유지.
export default function BackgroundSelectionScreen() {
  const { draft, setBackground } = useCreationFlow();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const [selection, setSelection] = useState<Selection>(() => draft.backgroundPhoto
    ? { kind: 'photo', photo: draft.backgroundPhoto }
    : draft.backgroundImagePath ? { kind: 'existing', uri: draft.backgroundImagePath }
      : { kind: 'default', id: DEFAULT_BACKGROUNDS[0].id });
  // 새 사진이 마음에 들지 않으면 기존 배경으로 되돌아갈 수 있게 별도로 둔다.
  const [candidate, setCandidate] = useState<PhotoSelection | null>(null);
  const [showSources, setShowSources] = useState(!draft.backgroundPhoto);
  const [previewSize, setPreviewSize] = useState({ width: 0, height: 0 });
  const [resetKey, setResetKey] = useState(0);
  const [savingPhoto, setSavingPhoto] = useState(false);
  const saveLock = useRef(false);
  const task = useBackgroundTask();
  const active = candidate ?? selection;
  const photo = active.kind === 'photo' ? active.photo : null;
  const editingPhoto = !!photo && !showSources;
  const disabled = task.busy || savingPhoto;
  const cardHeight = Math.max(1, Math.min(previewSize.height, previewSize.width * 16 / 9));
  const cardWidth = cardHeight * 9 / 16;

  const sourceUri = photo?.sourceUri;
  useEffect(() => {
    if (!sourceUri?.startsWith(BACKGROUNDS_DIR)) return;
    let current = true;
    void (async () => {
      if ((await FileSystem.getInfoAsync(sourceUri)).exists || !current) return;
      const existingPath = draft.backgroundImagePath;
      const hasCrop = existingPath && (await FileSystem.getInfoAsync(existingPath)).exists;
      if (!current) return;
      setShowSources(true);
      setSelection(hasCrop ? { kind: 'existing', uri: existingPath } : { kind: 'default', id: DEFAULT_BACKGROUNDS[0].id });
      Alert.alert('편집용 사진을 찾을 수 없어요', hasCrop
        ? '확정했던 배경은 그대로 사용할 수 있어요. 구도를 바꾸려면 사진을 다시 골라주세요.'
        : '기본 배경으로 표시했어요. 다른 편집 내용은 유지됩니다.');
    })().catch(() => {
      if (current) Alert.alert('사진을 확인하지 못했어요', '갤러리에서 다시 고르거나 기본 이미지를 사용해 주세요.');
    });
    return () => { current = false; };
  }, [sourceUri, draft.backgroundImagePath]);

  function permissionNotice(camera: boolean) {
    Alert.alert(camera ? '카메라 접근이 필요해요' : '사진 저장 권한이 필요해요',
      camera ? '설정에서 카메라를 허용하거나, 갤러리 또는 기본 이미지로 계속할 수 있어요.' : '설정에서 사진 추가를 허용하면 저장할 수 있어요. 저장하지 않고 배경으로 사용해도 괜찮아요.',
      [{ text: '닫기', style: 'cancel' }, { text: '설정 열기', onPress: () => { void Linking.openSettings(); } }]);
  }

  function pickPhoto(origin: 'gallery' | 'camera') {
    if (disabled) return;
    void task.run('사진을 불러오고 있어요', async isActive => {
      if (origin === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!isActive()) return null;
        if (!permission.granted) { permissionNotice(true); return null; }
      }
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'], allowsEditing: false, allowsMultipleSelection: false, quality: 1,
        exif: false, base64: false,
      };
      // allowsEditing:false + 사진만 선택 → iOS PHPicker, 갤러리 읽기 권한 불필요.
      const result = origin === 'camera'
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
      if (result.canceled || !isActive()) return null;
      const asset = result.assets[0];
      if (!asset || asset.width <= 0 || asset.height <= 0) throw new Error('Invalid photo');
      const prepared = await preparePhoto(asset.uri, asset.width, asset.height);
      return { kind: 'photo', rawUri: asset.uri, photo: {
        sourceUri: prepared.uri, width: prepared.width, height: prepared.height,
        origin, crop: INITIAL_PHOTO_CROP,
      } } satisfies PhotoSelection;
    }, result => { if (result) { setCandidate(result); setShowSources(false); } }, async result => {
      if (result) await removeFiles([result.photo.sourceUri]);
    });
  }

  function cancelPhotoSelection() {
    setCandidate(null);
    setShowSources(true);
  }

  function updateCrop(crop: PhotoCrop) {
    if (!photo) return;
    if (candidate) setCandidate(previous => previous?.photo.sourceUri === photo.sourceUri
      ? { ...previous, photo: { ...previous.photo, crop } } : previous);
    else setSelection(previous => previous.kind === 'photo' && previous.photo.sourceUri === photo.sourceUri
      ? { ...previous, photo: { ...previous.photo, crop } } : previous);
  }

  async function saveCameraPhoto() {
    if (active.kind !== 'photo' || active.saved || disabled || saveLock.current) return;
    saveLock.current = true; setSavingPhoto(true);
    try {
      const permission = await MediaLibrary.requestPermissionsAsync(true);
      if (!permission.granted) { permissionNotice(false); return; }
      const { saveToLibraryAsync } = await import('expo-media-library/legacy');
      await saveToLibraryAsync(active.rawUri ?? active.photo.sourceUri);
      if (candidate) setCandidate(previous => previous ? { ...previous, saved: true } : previous);
      else setSelection(previous => previous.kind === 'photo' ? { ...previous, saved: true } : previous);
      Alert.alert('사진 앱에 저장했어요');
    } catch { Alert.alert('사진을 저장하지 못했어요', '다시 시도해 주세요. 배경으로는 계속 사용할 수 있어요.'); }
    finally { saveLock.current = false; setSavingPhoto(false); }
  }

  function handleConfirm() {
    if (disabled) return;
    void task.run('배경을 준비하고 있어요', async () => {
      const created: string[] = [];
      try {
        if (active.kind === 'default') {
          const background = DEFAULT_BACKGROUNDS.find(bg => bg.id === active.id)!;
          const asset = await Asset.fromModule(background.source).downloadAsync();
          const path = await persistBackground(asset.localUri ?? asset.uri, `${background.id}.jpg`);
          return { path, photo: undefined, created };
        }
        if (active.kind === 'existing') {
          if (!(await FileSystem.getInfoAsync(active.uri)).exists) throw new Error('Missing background');
          return { path: active.uri, photo: undefined, created };
        }
        const id = `photo-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        let sourceUri = active.photo.sourceUri;
        if (!sourceUri.startsWith(BACKGROUNDS_DIR)) {
          sourceUri = await persistBackground(sourceUri, `${id}-source.jpg`);
          created.push(sourceUri);
        }
        const savedPhoto = { ...active.photo, sourceUri };
        const rendered = await renderPhotoBackground(savedPhoto);
        try {
          const path = await persistBackground(rendered.uri, `${id}-crop.jpg`);
          created.push(path);
          return { path, photo: savedPhoto, created };
        } finally { await removeFiles([rendered.uri]); }
      } catch (error) { await removeFiles(created); throw error; }
    }, result => {
      setBackground(result.path, result.photo);
      // 편집에서 배경을 다시 열었다면 기존 편집 화면으로 돌아간다.
      if (returnTo === 'edit') router.back();
      else router.push('/edit');
    }, async result => { await removeFiles(result.created); });
  }

  const route = draft.track && draft.selectedRun ? (
    <RoutePreview points={draft.track.coordinates} preset={draft.preset} transform={draft.transform}
      smoothOptions={draft.smoothOptions} run={draft.selectedRun} stampConfig={draft.stampConfig}
      isInteracting={false} fit="contain" viewWidth={cardWidth} viewHeight={cardHeight} />
  ) : null;
  const backgroundSource = active.kind === 'default'
    ? DEFAULT_BACKGROUNDS.find(bg => bg.id === active.id)!.source
    : active.kind === 'existing' ? { uri: active.uri } : undefined;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content} accessibilityElementsHidden={task.indicator !== 'hidden'}
        importantForAccessibility={task.indicator !== 'hidden' ? 'no-hide-descendants' : 'auto'}>
      <ScreenHeader title="배경" onBack={() => {
        if (savingPhoto) return;
        if (task.busy) task.cancel();
        else if (candidate) cancelPhotoSelection();
        else router.back();
      }} right={<Pressable onPress={handleConfirm} disabled={disabled} hitSlop={12} accessibilityRole="button">
        <Text style={[styles.headerAction, disabled && styles.disabled]}>다음</Text>
      </Pressable>} />
      <View style={styles.body}>
        <View style={styles.previewStage} onLayout={({ nativeEvent: { layout } }) => {
          setPreviewSize(previous => previous.width === layout.width && previous.height === layout.height
            ? previous : { width: layout.width, height: layout.height });
        }}>
        {previewSize.width > 0 && previewSize.height > 0 && <View
          style={[styles.card, { width: cardWidth, height: cardHeight }]}
          pointerEvents={disabled || !editingPhoto ? 'none' : 'auto'}>
          {photo ? (
            <PhotoBackgroundPreview key={`${photo.sourceUri}-${resetKey}`} uri={photo.sourceUri}
              imageWidth={photo.width} imageHeight={photo.height} width={cardWidth} height={cardHeight}
              initialCrop={photo.crop} onChange={updateCrop}>{route}</PhotoBackgroundPreview>
          ) : <>
            <Image source={backgroundSource} style={styles.backgroundImage} resizeMode="cover" />
            {route}
          </>}
        </View>}
        </View>
        <View style={styles.controls}>
        {editingPhoto && photo && <>
          <Text style={styles.note}>드래그로 이동 · 두 손가락으로 확대</Text>
          <View style={styles.photoTools}>
            <Pressable disabled={disabled} onPress={() => { updateCrop(INITIAL_PHOTO_CROP); setResetKey(key => key + 1); }}
              accessibilityRole="button" accessibilityLabel="사진 구도 초기화" style={({ pressed }) => [styles.photoTool, pressed && styles.toolPressed, disabled && styles.disabled]}>
              <SymbolView name="arrow.counterclockwise" size={14} tintColor={Colors.textMuted} />
              <Text style={styles.toolLabel}>초기화</Text>
            </Pressable>
            <Pressable disabled={disabled} onPress={cancelPhotoSelection}
              accessibilityRole="button" accessibilityLabel="사진 선택 취소, 이전 배경으로 돌아가기" style={({ pressed }) => [styles.photoTool, pressed && styles.toolPressed, disabled && styles.disabled]}>
              <SymbolView name="xmark" size={13} tintColor={Colors.textMuted} />
              <Text style={styles.toolLabel}>선택 취소</Text>
            </Pressable>
            {photo.origin === 'camera' && <>
              <Pressable disabled={disabled} onPress={() => pickPhoto('camera')}
                accessibilityRole="button" accessibilityLabel="사진 다시 찍기" style={({ pressed }) => [styles.photoTool, pressed && styles.toolPressed, disabled && styles.disabled]}>
                <SymbolView name="camera.rotate" size={15} tintColor={Colors.textMuted} />
                <Text style={styles.toolLabel}>다시 찍기</Text>
              </Pressable>
              <Pressable disabled={disabled || (active.kind === 'photo' && active.saved)} onPress={saveCameraPhoto}
                accessibilityRole="button" accessibilityLabel={active.kind === 'photo' && active.saved ? '사진 앱에 저장 완료' : '촬영한 원본 사진을 내 갤러리에 저장'}
                style={({ pressed }) => [styles.photoTool, pressed && styles.toolPressed, disabled && styles.disabled]}>
                {savingPhoto ? <ActivityIndicator size="small" color={Colors.accent} />
                  : <SymbolView name={active.kind === 'photo' && active.saved ? 'checkmark' : 'square.and.arrow.down'} size={14}
                    tintColor={active.kind === 'photo' && active.saved ? Colors.accent : Colors.textMuted} />}
                <Text style={styles.toolLabel}>{savingPhoto ? '저장 중…' : active.kind === 'photo' && active.saved ? '저장 완료' : '사진 저장'}</Text>
              </Pressable>
            </>}
          </View>
        </>}
        {!editingPhoto && <>
        <Text style={styles.sectionLabel}>기본 이미지</Text>
        <View style={styles.swatchRow}>
          {DEFAULT_BACKGROUNDS.map(bg => <Pressable key={bg.id} disabled={disabled}
            onPress={() => { setCandidate(null); setSelection({ kind: 'default', id: bg.id }); setShowSources(true); }}
            accessibilityRole="button" accessibilityLabel={`${bg.label} 배경`}
            accessibilityState={{ selected: active.kind === 'default' && active.id === bg.id }}
            style={[styles.swatch, active.kind === 'default' && active.id === bg.id && styles.swatchOn]}>
            <Image source={bg.source} style={styles.swatchImg} resizeMode="cover" />
          </Pressable>)}
          <Pressable disabled={disabled} onPress={() => pickPhoto('gallery')} accessibilityRole="button" style={[styles.swatch, styles.sourceButton]}>
            <Text style={styles.buttonText}>갤러리</Text>
          </Pressable>
          <Pressable disabled={disabled} onPress={() => pickPhoto('camera')} accessibilityRole="button" style={[styles.swatch, styles.sourceButton]}>
            <Text style={styles.buttonText}>사진 촬영</Text>
          </Pressable>
        </View>
        <Text style={styles.note}>기본 이미지를 고르거나 내 사진을 배경으로 사용해 보세요.</Text>
        </>}
        <Pressable disabled={disabled} onPress={handleConfirm} accessibilityRole="button"
          accessibilityState={{ disabled }}
          accessibilityLabel={returnTo === 'edit' ? '배경 적용하고 편집으로 돌아가기' : '다음: 드로잉 편집'}
          style={({ pressed }) => [styles.confirm, (disabled || pressed) && styles.disabled]}>
          <Text style={styles.confirmText}>{returnTo === 'edit' ? '배경 적용' : '다음 · 드로잉 →'}</Text>
        </Pressable>
        </View>
      </View>
      </View>
      {task.indicator !== 'hidden' && (
        <View style={styles.loadingOverlay} accessibilityViewIsModal importantForAccessibility="yes">
          <View style={styles.loadingCard} accessibilityLiveRegion="polite">
            <View style={styles.loadingIcon}><ActivityIndicator size="large" color={Colors.accent} /></View>
            <Text style={styles.loadingTitle}>{task.label}</Text>
            <Text style={styles.loadingDescription}>잠시만 기다려 주세요</Text>
            {task.indicator === 'long' && <Pressable onPress={task.cancel} accessibilityRole="button"
              style={({ pressed }) => [styles.loadingCancel, pressed && styles.toolPressed]}>
              <Text style={styles.loadingCancelText}>취소</Text>
            </Pressable>}
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.bg },
  content: { flex: 1 },
  headerAction: { fontFamily: Fonts.sans, fontSize: 12, color: Colors.accent },
  disabled: { opacity: 0.4 },
  body: { flex: 1, minHeight: 0, paddingHorizontal: 24, paddingBottom: 8, gap: Spacing.md },
  previewStage: { flex: 1, minHeight: 0, alignItems: 'center', justifyContent: 'center' },
  controls: { flexShrink: 0, gap: 8 },
  card: { alignSelf: 'center', borderRadius: Radius.card, overflow: 'hidden', backgroundColor: Colors.bgCard },
  backgroundImage: { ...StyleSheet.absoluteFill, width: '100%', height: '100%' },
  sectionLabel: { fontFamily: Fonts.sans, fontSize: 10, color: Colors.textMuted, marginTop: 4 },
  swatchRow: { flexDirection: 'row', gap: 9 },
  swatch: { flex: 1, aspectRatio: 9 / 16, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bgCard },
  swatchOn: { borderColor: Colors.accent },
  swatchImg: { width: '100%', height: '100%' },
  sourceButton: { borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  note: { fontFamily: Fonts.sans, fontSize: 11, lineHeight: 17, color: Colors.textMuted },
  photoTools: { flexDirection: 'row', marginTop: -4 },
  photoTool: { flex: 1, minWidth: 0, minHeight: 44, flexDirection: 'row', paddingVertical: 8, alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 8 },
  toolPressed: { backgroundColor: Colors.border },
  toolLabel: { flexShrink: 1, fontFamily: Fonts.sans, fontSize: 10.5, color: Colors.textMuted, textAlign: 'center' },
  buttonText: { fontFamily: Fonts.sans, fontSize: 11, color: Colors.text },
  loadingOverlay: { ...StyleSheet.absoluteFill, zIndex: 20, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center', padding: 32 },
  loadingCard: { width: '100%', maxWidth: 300, alignItems: 'center', backgroundColor: Colors.bgCard, borderRadius: Radius.card, borderWidth: 1, borderColor: Colors.borderStrong, padding: 24 },
  loadingIcon: { padding: 10, marginBottom: 12 },
  loadingTitle: { fontFamily: Fonts.sansBold, fontSize: 16, color: Colors.text, textAlign: 'center' },
  loadingDescription: { fontFamily: Fonts.sans, fontSize: 12, color: Colors.textMuted, marginTop: 8 },
  loadingCancel: { minHeight: 44, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', marginTop: 20, borderRadius: 12, borderWidth: 1, borderColor: Colors.borderStrong },
  loadingCancelText: { fontFamily: Fonts.sans, fontSize: 13, color: Colors.text },
  confirm: { minHeight: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.accent, borderRadius: 22, paddingHorizontal: 16 },
  confirmText: { fontFamily: Fonts.sansBold, fontSize: 12, color: Colors.accentText },
});
