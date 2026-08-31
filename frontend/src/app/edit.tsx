import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Image,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type PanResponderGestureState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IDENTITY_TRANSFORM, RoutePreview, type RoutePreset, type RouteTransform } from '@/components/route-preview';
import { Slider } from '@/components/slider';
import { ThemedButton } from '@/components/ui';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { saveDraft } from '@/lib/draft-store';
import type { SmoothOptions } from '@/lib/route-smoothing';
import { useCreationFlow } from '@/state/creation-flow';

// FRD: docs/specs/frd/result-editing.md
// 프리셋 선택(§3), 드로잉 크기·위치·회전 제스처+초기화(§4), 미리보기 재생 규칙(§2-1),
// 다듬기 세기(§5)까지 구현. 속도·색·각인은 여전히 여유 시라 이후(목업 구현 2/6).

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
    resetTransform,
  } = useCreationFlow();

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
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const handleBasicSmoothChange = (value: number) => updateSmoothOptions({ smooth: value, corner: value });
  const handleSmoothAxisChange = (axis: 'smooth' | 'corner', value: number) =>
    updateSmoothOptions({ ...smoothOptionsRef.current, [axis]: value });
  const handleSmoothCommit = () => commitSmoothOptions(smoothOptionsRef.current);

  const [isInteracting, setIsInteracting] = useState(false);
  const baseTransform = useRef<RouteTransform>(transform);
  const gestureStart = useRef<{ distance: number; angle: number } | null>(null);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt: GestureResponderEvent) => {
        setIsInteracting(true);
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
        commitTransform(transformRef.current);
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
    });
  }, [
    draft.selectedRun,
    draft.track,
    draft.backgroundImagePath,
    draft.preset,
    draft.transform,
    draft.smoothOptions,
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

  const previewWidth = 270;
  const previewHeight = 480; // 9:16

  if (!draft.track || !draft.backgroundImagePath) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.hint}>기록이나 배경이 아직 안 골라졌어요.</Text>
        <ThemedButton title="처음으로" onPress={() => router.replace('/')} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={[styles.previewBox, { width: previewWidth, height: previewHeight }]}>
          <Image
            source={{ uri: draft.backgroundImagePath }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
          <View {...panResponder.panHandlers} style={StyleSheet.absoluteFill}>
            <RoutePreview
              points={draft.track.coordinates}
              preset={draft.preset}
              transform={transform}
              smoothOptions={smoothOptions}
              isInteracting={isInteracting}
              viewWidth={previewWidth}
              viewHeight={previewHeight}
            />
          </View>
        </View>

        <View style={styles.presetRow}>
          {PRESETS.map((p) => (
            <Pressable
              key={p.id}
              onPress={() => handlePresetSelect(p.id)}
              style={[styles.presetButton, draft.preset === p.id && styles.presetButtonSelected]}>
              <Text style={draft.preset === p.id ? styles.presetLabelSelected : styles.presetLabel}>
                {p.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.hint}>끌기: 이동 · 두 손가락: 확대·회전</Text>

        {/* §5: 결과를 보면서 조절해야 하므로 같은 화면에 둔다. 기본은 한 축, 고급을
            열면 직선(smooth)·코너(corner)를 따로 만진다. 슬라이더 범위 자체가 안전
            구간이라(route-rendering §3-2) 경고·차단 UI는 없다. */}
        <View style={styles.smoothSection}>
          <Pressable onPress={() => setAdvancedOpen((v) => !v)}>
            <Text style={styles.smoothToggle}>{advancedOpen ? '고급 설정 닫기' : '다듬기 · 고급 설정 열기'}</Text>
          </Pressable>

          {!advancedOpen && (
            <View style={styles.smoothRow}>
              <Text style={styles.smoothLabel}>다듬기 세기</Text>
              <Slider value={smoothOptions.smooth} onChange={handleBasicSmoothChange} onSlidingComplete={handleSmoothCommit} />
            </View>
          )}

          {advancedOpen && (
            <>
              <View style={styles.smoothRow}>
                <Text style={styles.smoothLabel}>직선</Text>
                <Slider
                  value={smoothOptions.smooth}
                  onChange={(v) => handleSmoothAxisChange('smooth', v)}
                  onSlidingComplete={handleSmoothCommit}
                />
              </View>
              <View style={styles.smoothRow}>
                <Text style={styles.smoothLabel}>모서리</Text>
                <Slider
                  value={smoothOptions.corner}
                  onChange={(v) => handleSmoothAxisChange('corner', v)}
                  onSlidingComplete={handleSmoothCommit}
                />
              </View>
            </>
          )}
        </View>

        <View style={styles.actionRow}>
          <ThemedButton title="초기화" variant="outline" onPress={handleReset} style={styles.actionButton} />
          <ThemedButton title="다음" onPress={handleNext} style={styles.actionButton} />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.bg },
  center: {
    flex: 1,
    backgroundColor: Colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  container: { flex: 1, alignItems: 'center', padding: Spacing.md, gap: Spacing.md },
  previewBox: { borderRadius: Radius.card, overflow: 'hidden', backgroundColor: Colors.bgCard },
  presetRow: { flexDirection: 'row', gap: Spacing.xs },
  presetButton: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: Radius.chip,
    backgroundColor: Colors.bgCard,
  },
  presetButtonSelected: { backgroundColor: Colors.accent },
  presetLabel: { fontFamily: 'SpaceGrotesk_500Medium', fontSize: 12, color: Colors.textMuted },
  presetLabelSelected: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 12, color: Colors.accentText },
  hint: { fontFamily: 'JetBrainsMono_500Medium', color: Colors.textMuted, fontSize: 11 },
  smoothSection: { alignSelf: 'stretch', gap: 4 },
  smoothToggle: {
    fontFamily: 'JetBrainsMono_500Medium',
    fontSize: 11,
    color: Colors.accent,
    textAlign: 'center',
    marginBottom: 4,
  },
  smoothRow: { gap: 2 },
  smoothLabel: { fontFamily: 'SpaceGrotesk_500Medium', fontSize: 12, color: Colors.textMuted },
  actionRow: { flexDirection: 'row', gap: Spacing.sm, alignSelf: 'stretch' },
  actionButton: { flex: 1 },
});
