import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  Image,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type PanResponderGestureState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  IDENTITY_TRANSFORM,
  RoutePreview,
  type RoutePreset,
  type RouteTransform,
  type StampConfig,
  type StampItem,
} from '@/components/route-preview';
import { ScreenHeader } from '@/components/screen-header';
import { Slider } from '@/components/slider';
import { ThemedButton } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { saveDraft } from '@/lib/draft-store';
import type { SmoothOptions } from '@/lib/route-smoothing';
import { useCreationFlow } from '@/state/creation-flow';

// FRD: docs/specs/frd/result-editing.md
// 프리셋 선택(§3), 드로잉 크기·위치·회전 제스처+초기화(§4), 미리보기 재생 규칙(§2-1),
// 다듬기 세기(§5), 각인 편집(§7)까지 구현. 속도·색은 여전히 여유 시라 이후(목업 구현 3/6).

const STAMP_ITEMS: { id: StampItem; label: string }[] = [
  { id: 'distance', label: '거리' },
  { id: 'time', label: '시간' },
  { id: 'pace', label: '페이스' },
  { id: 'heartRate', label: '심박' },
];

const STAMP_MODES: { id: StampConfig['mode']; label: string }[] = [
  { id: 'always', label: '항상' },
  { id: 'after', label: '완성 후만' },
  { id: 'hidden', label: '숨김' },
];

const PRESETS: { id: RoutePreset; label: string }[] = [
  { id: 'default-drawing', label: '기본 드로잉' },
  { id: 'light-runner', label: '불빛 러너' },
  { id: 'segment-lighting', label: '구간 점등' },
];

function touchDistance(t1: { pageX: number; pageY: number }, t2: { pageX: number; pageY: number }) {
  return Math.hypot(t2.pageX - t1.pageX, t2.pageY - t1.pageY);
}

function touchAngleDeg(t1: { pageX: number; pageY: number }, t2: { pageX: number; pageY: number }) {
  return (Math.atan2(t2.pageY - t1.pageY, t2.pageX - t1.pageX) * 180) / Math.PI;
}

export default function EditScreen() {
  const {
    draft,
    setPreset: commitPreset,
    setTransform: commitTransform,
    setSmoothOptions: commitSmoothOptions,
    setStampConfig: commitStampConfig,
    resetTransform,
  } = useCreationFlow();

  // §4-1: 편집 대상은 각인 시트가 열려 있는 동안만 '각인'(끌어서 위치 이동), 그 외엔 '드로잉'.
  // "3안" 시안 S7에는 드로잉/각인 토글이 없다 — [각인] 버튼이 시트(S6)를 연다.
  const [stampSheetOpen, setStampSheetOpen] = useState(false);

  const [transform, setTransformState] = useState<RouteTransform>(draft.transform);
  const transformRef = useRef(transform);
  const updateTransform = (t: RouteTransform) => {
    transformRef.current = t;
    setTransformState(t);
  };

  // §5: 기본은 한 축("다듬기 세기"). 고급 설정을 열면 직선(smooth)·코너(corner)를 따로 만진다.
  const [smoothOptions, setSmoothOptionsState] = useState<SmoothOptions>(draft.smoothOptions);
  const smoothOptionsRef = useRef(smoothOptions);
  const updateSmoothOptions = (opts: SmoothOptions) => {
    smoothOptionsRef.current = opts;
    setSmoothOptionsState(opts);
  };
  const handleSmoothAxisChange = (axis: 'smooth' | 'corner', value: number) =>
    updateSmoothOptions({ ...smoothOptionsRef.current, [axis]: value });
  const handleSmoothCommit = () => commitSmoothOptions(smoothOptionsRef.current);

  // §7: 각인 넷은 하나의 묶음 — 위치 하나만 갖는다. 크기·회전은 없다(§4-2, 끌기만 반응).
  const [stampConfig, setStampConfigState] = useState<StampConfig>(draft.stampConfig);
  const stampConfigRef = useRef(stampConfig);
  const updateStampConfig = (c: StampConfig) => {
    stampConfigRef.current = c;
    setStampConfigState(c);
  };
  const handleStampModeSelect = (mode: StampConfig['mode']) => {
    const next = { ...stampConfigRef.current, mode };
    updateStampConfig(next);
    commitStampConfig(next);
  };
  const handleStampItemToggle = (item: StampItem) => {
    const next = { ...stampConfigRef.current, enabled: { ...stampConfigRef.current.enabled, [item]: !stampConfigRef.current.enabled[item] } };
    updateStampConfig(next);
    commitStampConfig(next);
  };

  const [isInteracting, setIsInteracting] = useState(false);
  const baseTransform = useRef<RouteTransform>(transform);
  const baseStampPosition = useRef(stampConfig.position);
  const gestureStart = useRef<{ distance: number; angle: number } | null>(null);
  // §4-1: 편집 대상은 각인 시트가 열려 있는 동안만 '각인'(끌어서 위치 이동), 그 외엔 '드로잉'.
  // 렌더 중에 읽지 않고 제스처 핸들러에서만 읽으므로 ref로 둔다.
  const editTargetRef = useRef<'drawing' | 'stamp'>('drawing');
  useEffect(() => {
    editTargetRef.current = stampSheetOpen ? 'stamp' : 'drawing';
  }, [stampSheetOpen]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt: GestureResponderEvent) => {
        setIsInteracting(true);
        if (editTargetRef.current === 'stamp') {
          baseStampPosition.current = stampConfigRef.current.position;
          return;
        }
        baseTransform.current = transformRef.current;
        const touches = evt.nativeEvent.touches;
        if (touches.length === 2) {
          gestureStart.current = {
            distance: touchDistance(touches[0], touches[1]),
            angle: touchAngleDeg(touches[0], touches[1]),
          };
        } else {
          gestureStart.current = null;
        }
      },
      onPanResponderMove: (evt: GestureResponderEvent, gestureState: PanResponderGestureState) => {
        if (editTargetRef.current === 'stamp') {
          // §4-2: 각인은 끌기(위치)만 반응한다.
          updateStampConfig({
            ...stampConfigRef.current,
            position: {
              x: baseStampPosition.current.x + gestureState.dx,
              y: baseStampPosition.current.y + gestureState.dy,
            },
          });
          return;
        }
        const touches = evt.nativeEvent.touches;
        if (touches.length === 2) {
          if (!gestureStart.current) {
            gestureStart.current = {
              distance: touchDistance(touches[0], touches[1]),
              angle: touchAngleDeg(touches[0], touches[1]),
            };
          }
          const newDistance = touchDistance(touches[0], touches[1]);
          const newAngle = touchAngleDeg(touches[0], touches[1]);
          const scaleDelta = newDistance / (gestureStart.current.distance || 1);
          const rotationDelta = newAngle - gestureStart.current.angle;
          updateTransform({
            x: baseTransform.current.x + gestureState.dx,
            y: baseTransform.current.y + gestureState.dy,
            scale: Math.max(0.3, baseTransform.current.scale * scaleDelta),
            rotationDeg: baseTransform.current.rotationDeg + rotationDelta,
          });
        } else {
          updateTransform({
            ...baseTransform.current,
            x: baseTransform.current.x + gestureState.dx,
            y: baseTransform.current.y + gestureState.dy,
          });
        }
      },
      onPanResponderRelease: () => {
        setIsInteracting(false);
        gestureStart.current = null;
        if (editTargetRef.current === 'stamp') {
          commitStampConfig(stampConfigRef.current);
        } else {
          commitTransform(transformRef.current);
        }
      },
    })
  ).current;

  // 홈과 보관함 FRD §3-1: "이어서 만들기"에 올라오는 건 마지막으로 편집한 것.
  // 이 화면에 들어와 있는 것 자체가 "지금 이걸 만지고 있다"는 뜻이라, 진입 시점과
  // 프리셋·변형값이 바뀔 때마다 초안을 저장해둔다. 완성되면 share.tsx에서 지운다.
  useEffect(() => {
    if (!draft.selectedRun || !draft.track || !draft.backgroundImagePath) return;
    saveDraft({
      run: draft.selectedRun,
      track: draft.track,
      backgroundImagePath: draft.backgroundImagePath,
      preset: draft.preset,
      transform: draft.transform,
      smoothOptions: draft.smoothOptions,
      stampConfig: draft.stampConfig,
    });
  }, [
    draft.selectedRun,
    draft.track,
    draft.backgroundImagePath,
    draft.preset,
    draft.transform,
    draft.smoothOptions,
    draft.stampConfig,
  ]);

  const handleReset = () => {
    // §4-3: 되돌리는 단위는 드로잉 조작뿐. 프리셋·각인은 그대로 둔다.
    updateTransform(IDENTITY_TRANSFORM);
    resetTransform();
  };

  const handlePresetSelect = (preset: RoutePreset) => {
    commitPreset(preset);
  };

  const handleNext = () => {
    router.push('/share');
  };

  // "3안" 시안 S7: 카드는 화면 폭에 가깝고(margin 24) 높이는 352 안팎 — 9:16 캔버스를
  // 그 안에 레터박스로 넣으면 시안처럼 경로 글로우가 어두운 여백 가운데 놓인다.
  const previewWidth = Dimensions.get('window').width - 48;
  const previewHeight = 352;

  const smoothLabel = (v: number) => (v === 0 ? '없음' : `${v} %`);
  const cornerLabel = (v: number) => (v === 0 ? '각지게' : `${v} %`);

  if (!draft.track || !draft.backgroundImagePath || !draft.selectedRun) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader title="편집" />
        <View style={styles.center}>
          <Text style={styles.hint}>기록이나 배경이 아직 안 골라졌어요.</Text>
          <ThemedButton title="처음으로" onPress={() => router.replace('/')} />
        </View>
      </SafeAreaView>
    );
  }

  const stampItems = STAMP_ITEMS.filter(
    (item) => item.id !== 'heartRate' || draft.selectedRun?.averageHeartRate !== undefined
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScreenHeader
        title="편집"
        right={
          <Text onPress={handleNext} style={styles.headerAction}>
            완료
          </Text>
        }
      />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={[styles.card, { width: previewWidth, height: previewHeight }]}>
          <Image source={{ uri: draft.backgroundImagePath }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          <View {...panResponder.panHandlers} style={StyleSheet.absoluteFill}>
            <RoutePreview
              points={draft.track.coordinates}
              preset={draft.preset}
              transform={transform}
              smoothOptions={smoothOptions}
              run={draft.selectedRun}
              stampConfig={stampConfig}
              showSafeAreaGuide
              isInteracting={isInteracting}
              viewWidth={previewWidth}
              viewHeight={previewHeight}
            />
          </View>
          <Text style={styles.cardHint}>
            {stampSheetOpen ? '끌기 · 각인 묶음 위치' : '끌기 · 이동 / 두 손가락 · 확대·회전'}
          </Text>
        </View>

        {/* §3 프리셋 */}
        <Text style={styles.sectionLabel}>프리셋 · PRESET</Text>
        <View style={styles.presetRow}>
          {PRESETS.map((p) => {
            const on = draft.preset === p.id;
            return (
              <Pressable
                key={p.id}
                onPress={() => handlePresetSelect(p.id)}
                style={[styles.presetChip, on && styles.presetChipOn]}>
                <Text style={on ? styles.presetChipTextOn : styles.presetChipText}>{p.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* §5: 결과를 보면서 조절한다. 시안 S7대로 직선·코너 두 축을 바로 노출한다
            (FRD §5의 "기본은 한 축"과 다름 — 확인 노트에 기록). 슬라이더 범위 자체가
            안전 구간이라(route-rendering §3-2) 경고·차단 UI는 없다. */}
        <View style={styles.sliderHead}>
          <Text style={styles.sectionLabel}>직접 다듬기 · SMOOTH</Text>
          <Text style={styles.sliderValue}>{smoothLabel(smoothOptions.smooth)}</Text>
        </View>
        <Slider
          value={smoothOptions.smooth}
          onChange={(v) => handleSmoothAxisChange('smooth', v)}
          onSlidingComplete={handleSmoothCommit}
        />

        <View style={styles.sliderHead}>
          <Text style={styles.sectionLabel}>코너 반경 · CORNER</Text>
          <Text style={styles.sliderValue}>{cornerLabel(smoothOptions.corner)}</Text>
        </View>
        <Slider
          value={smoothOptions.corner}
          onChange={(v) => handleSmoothAxisChange('corner', v)}
          onSlidingComplete={handleSmoothCommit}
        />

        <View style={styles.outlineRow}>
          <Pressable style={styles.outlineBtn} onPress={() => setStampSheetOpen(true)}>
            <Text style={styles.outlineBtnText}>각인</Text>
          </Pressable>
          <Pressable style={styles.outlineBtn} onPress={() => router.push('/background-selection')}>
            <Text style={styles.outlineBtnText}>배경 바꾸기</Text>
          </Pressable>
          <Pressable style={styles.outlineBtn} onPress={handleReset}>
            <Text style={styles.outlineBtnMuted}>초기화</Text>
          </Pressable>
        </View>

        <Text style={styles.note}>
          적용 버튼이 없습니다. 초기화는 드로잉 조작만 되돌리고 프리셋·각인은 남습니다.
        </Text>
      </ScrollView>

      {/* §7 각인 시트(S6) — 미리보기를 가리지 않도록 하단 패널로 둔다. 열려 있는 동안만
          미리보기에서 각인 묶음을 끌어 옮길 수 있다(editTarget='stamp'). */}
      {stampSheetOpen && (
        <View style={styles.sheet}>
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>각인</Text>
            <Text onPress={() => setStampSheetOpen(false)} style={styles.headerAction}>
              완료
            </Text>
          </View>

          <Text style={styles.sectionLabel}>표시</Text>
          <View style={styles.chipRow}>
            {STAMP_MODES.map((m) => {
              const on = stampConfig.mode === m.id;
              return (
                <Pressable
                  key={m.id}
                  onPress={() => handleStampModeSelect(m.id)}
                  style={[styles.presetChip, on && styles.presetChipOn]}>
                  <Text style={on ? styles.presetChipTextOn : styles.presetChipText}>{m.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.sectionLabel}>넣을 것</Text>
          <View style={styles.chipRowWrap}>
            {stampItems.map((item) => {
              const on = stampConfig.enabled[item.id];
              return (
                <Pressable
                  key={item.id}
                  onPress={() => handleStampItemToggle(item.id)}
                  style={[styles.itemChip, on && styles.itemChipOn]}>
                  <Text style={on ? styles.itemChipTextOn : styles.itemChipText}>{item.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.note}>미리보기에서 각인을 끌어 위치를 옮길 수 있어요.</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const CHIP_ON_BG = 'rgba(255,90,43,0.12)';

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.bg },
  center: {
    flex: 1,
    backgroundColor: Colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  headerAction: { fontFamily: 'JetBrainsMono_500Medium', fontSize: 12, color: Colors.accent },
  scroll: { paddingHorizontal: 24, paddingBottom: 60, gap: 12, alignItems: 'stretch' },
  card: {
    alignSelf: 'center',
    borderRadius: Radius.card,
    overflow: 'hidden',
    backgroundColor: Colors.bgCard,
    marginBottom: 4,
  },
  cardHint: {
    position: 'absolute',
    left: 14,
    bottom: 12,
    fontFamily: 'JetBrainsMono_500Medium',
    fontSize: 9.5,
    letterSpacing: 1,
    color: Colors.textMuted,
  },
  sectionLabel: {
    fontFamily: 'JetBrainsMono_500Medium',
    fontSize: 10,
    letterSpacing: 1.4,
    color: Colors.textMuted,
  },
  presetRow: { flexDirection: 'row', gap: 8 },
  chipRow: { flexDirection: 'row', gap: 8 },
  chipRowWrap: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  presetChip: {
    flex: 1,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.border,
  },
  presetChipOn: { backgroundColor: Colors.accent },
  presetChipText: { fontFamily: 'SpaceGrotesk_500Medium', fontSize: 12, color: Colors.textMuted },
  presetChipTextOn: { fontFamily: 'SpaceGrotesk_500Medium', fontSize: 12, color: Colors.accentText },
  sliderHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 8,
  },
  sliderValue: { fontFamily: 'JetBrainsMono_500Medium', fontSize: 12, color: Colors.accent },
  itemChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
  },
  itemChipOn: { borderColor: Colors.accent, backgroundColor: CHIP_ON_BG },
  itemChipText: { fontFamily: 'SpaceGrotesk_500Medium', fontSize: 12, color: Colors.textMuted },
  itemChipTextOn: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 12, color: Colors.accent },
  outlineRow: { flexDirection: 'row', gap: 8, marginTop: 18 },
  outlineBtn: {
    flex: 1,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlineBtnText: { fontFamily: 'SpaceGrotesk_500Medium', fontSize: 12, color: Colors.text },
  outlineBtnMuted: { fontFamily: 'SpaceGrotesk_500Medium', fontSize: 12, color: Colors.textMuted },
  note: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 11,
    lineHeight: 17,
    color: Colors.textMuted,
    marginTop: 6,
  },
  hint: { fontFamily: 'JetBrainsMono_500Medium', color: Colors.textMuted, fontSize: 11 },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.bgCard,
    borderTopLeftRadius: Radius.pill,
    borderTopRightRadius: Radius.pill,
    borderTopWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 34,
    gap: 12,
  },
  sheetHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  sheetTitle: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 17, color: Colors.text },
});
