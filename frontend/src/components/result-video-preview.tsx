import { useEvent } from 'expo';
import * as FileSystem from 'expo-file-system/legacy';
import { useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useVideoPlayer, VideoView, type VideoPlayer } from 'expo-video';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, AppState, Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Fonts, Radius } from '@/constants/theme';
import { Slider } from '@/components/slider';

/** 홈과 보관함 FRD §2-2: 보관한 완성 영상을 재생하며 편집 사본은 건드리지 않는다. */
export function ResultVideoPreview({ uri, size, children }: { uri: string; size: number; children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [checking, setChecking] = useState(false);
  const request = useRef(0);
  const opening = useRef(false);

  useFocusEffect(useCallback(() => () => {
    request.current++;
    opening.current = false;
    setChecking(false);
    setVisible(false);
  }, []));

  async function open() {
    if (opening.current) return;
    opening.current = true;
    setChecking(true);
    const token = ++request.current;
    try {
      const file = await FileSystem.getInfoAsync(uri);
      if (token !== request.current || AppState.currentState !== 'active') return;
      if (!file.exists || file.isDirectory) {
        Alert.alert('영상을 찾을 수 없어요', '다시 편집에서 영상을 새로 만들 수 있어요. 저장된 편집 내용은 그대로 남아 있어요.');
        return;
      }
      setVisible(true);
    } catch {
      if (token === request.current) Alert.alert('영상을 열지 못했어요', '잠시 후 재생 버튼을 다시 눌러 주세요.');
    } finally {
      if (token === request.current) { opening.current = false; setChecking(false); }
    }
  }

  if (visible) return <ResultVideoPlayer uri={uri} size={size} onClose={() => setVisible(false)} />;

  return <View style={{ width: size }}>
    <View style={[styles.preview, { height: size }]}>{children}</View>
    <PlaybackControls onToggle={open} onRestart={() => {}} onStop={() => {}} busy={checking} />
  </View>;
}

function ResultVideoPlayer({ uri, size, onClose }: { uri: string; size: number; onClose: () => void }) {
  const player = useVideoPlayer(uri, p => {
    p.muted = true;
    p.audioMixingMode = 'mixWithOthers';
    p.loop = false;
    p.staysActiveInBackground = false;
    p.timeUpdateEventInterval = 0.25;
    p.play();
  });
  const { status } = useEvent(player, 'statusChange', { status: player.status });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const { currentTime } = useEvent(player, 'timeUpdate', {
    currentTime: player.currentTime, currentLiveTimestamp: null, currentOffsetFromLive: null, bufferedPosition: 0,
  });
  const resumeAfterSeek = useRef(false);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') { resumeAfterSeek.current = false; player.pause(); }
    });
    // 플레이어 해제는 useVideoPlayer가 맡는다. 해제 후 pause를 호출하지 않는다.
    return () => subscription.remove();
  }, [player]);

  const duration = Number.isFinite(player.duration) ? Math.max(0, player.duration) : 0;
  const failed = status === 'error';
  return <View style={{ width: size }}>
    <View style={[styles.preview, { height: size }]}>
      {failed ? <View style={styles.message}>
        <Text style={styles.notice}>영상을 재생하지 못했어요.</Text>
        <Text style={styles.notice}>정지한 뒤 다시 시도하거나, 다시 편집에서 영상을 새로 만들어 주세요.</Text>
      </View> : <View style={styles.videoArea}>
        <VideoView player={player} style={styles.video} contentFit="contain" nativeControls={false}
          fullscreenOptions={{ enable: false }} allowsPictureInPicture={false} allowsVideoFrameAnalysis={false} pointerEvents="none" />
        {(status === 'idle' || status === 'loading') && <View style={styles.loading} pointerEvents="none">
          <ActivityIndicator color={Colors.text} accessibilityLabel="영상 불러오는 중" />
        </View>}
      </View>}
    </View>
    <PlaybackControls currentTime={currentTime} duration={duration} playing={isPlaying} loaded={!failed}
      busy={status === 'loading' || status === 'idle'}
      onSeekStart={() => { resumeAfterSeek.current = player.playing; player.pause(); }}
      onSeek={fraction => seekTo(player, fraction * duration)}
      onSeekEnd={fraction => {
        seekTo(player, fraction * duration);
        if (resumeAfterSeek.current && AppState.currentState === 'active') player.play();
        resumeAfterSeek.current = false;
      }}
      onToggle={() => {
        if (player.playing) player.pause();
        else {
          if (duration > 0 && player.currentTime >= duration - 0.1) player.replay();
          else player.play();
        }
      }}
      onRestart={() => player.replay()}
      onStop={() => { player.pause(); onClose(); }} canStop />
  </View>;
}

/** Expo의 네이티브 플레이어는 currentTime 설정으로 절대 위치를 탐색한다. */
function seekTo(player: VideoPlayer, seconds: number) {
  player.currentTime = seconds;
}

function clock(seconds: number) {
  const value = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(value / 60).toString().padStart(2, '0')}:${(value % 60).toString().padStart(2, '0')}`;
}

function PlaybackControls({ currentTime = 0, duration = 0, playing = false, loaded = false, busy = false, canStop = false, onToggle, onRestart, onStop, onSeekStart, onSeek, onSeekEnd }: {
  currentTime?: number; duration?: number; playing?: boolean; loaded?: boolean; busy?: boolean; canStop?: boolean;
  onToggle: () => void; onRestart: () => void; onStop: () => void;
  onSeekStart?: () => void; onSeek?: (fraction: number) => void; onSeekEnd?: (fraction: number) => void;
}) {
  const progress = duration > 0 ? Math.max(0, Math.min(1, currentTime / duration)) : 0;
  return <View style={styles.controls}>
    <View style={styles.seekArea}>
      {loaded && duration > 0 && onSeek ? <Slider value={progress * 100} tapToSeek
        accessibilityLabel="영상 재생 위치" onSlidingStart={onSeekStart}
        onChange={value => onSeek(value / 100)} onSlidingComplete={value => onSeekEnd?.(value / 100)} />
      : <View style={styles.progress} accessibilityRole="progressbar" accessibilityLabel="영상 재생 진행률"
        accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>}
    </View>
    <View style={styles.times}><Text style={styles.time}>{clock(currentTime)}</Text><Text style={styles.time}>{clock(duration)}</Text></View>
    <View style={styles.controlRow}>
      <Pressable onPress={onRestart} disabled={!loaded || busy} accessibilityRole="button" accessibilityLabel="영상 처음부터 재생"
        style={[styles.secondaryButton, (!loaded || busy) && styles.disabled]}>
        <SymbolView name="arrow.counterclockwise" size={20} tintColor={Colors.textMuted} />
      </Pressable>
      <Pressable onPress={onToggle} disabled={busy || (canStop && !loaded)} style={[styles.playButton, canStop && !loaded && styles.disabled]}
        accessibilityRole="button" accessibilityLabel={playing ? '영상 일시정지' : '영상 재생'} accessibilityState={{ busy, disabled: busy || (canStop && !loaded) }}>
        {busy ? <ActivityIndicator color={Colors.accentText} /> : <SymbolView name={playing ? 'pause.fill' : 'play.fill'} size={22} tintColor={Colors.accentText} />}
      </Pressable>
      <Pressable onPress={onStop} disabled={!canStop} accessibilityRole="button" accessibilityLabel="영상 정지"
        style={[styles.secondaryButton, !canStop && styles.disabled]}>
        <SymbolView name="stop.fill" size={16} tintColor={Colors.textMuted} />
      </Pressable>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  preview: { overflow: 'hidden', borderRadius: Radius.card, backgroundColor: Colors.bgCard },
  playButton: { width: 52, height: 52, borderRadius: 26, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
  secondaryButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, borderWidth: 1, borderColor: Colors.borderStrong },
  disabled: { opacity: 0.35 },
  controls: { paddingTop: 12, gap: 6 },
  seekArea: { height: 32, justifyContent: 'center' },
  progress: { height: 3, borderRadius: 2, backgroundColor: Colors.border, overflow: 'hidden' },
  progressFill: { height: 3, backgroundColor: Colors.accent },
  times: { flexDirection: 'row', justifyContent: 'space-between' },
  time: { fontFamily: Fonts.mono, fontSize: 10, color: Colors.textMuted },
  controlRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 24 },
  videoArea: { flex: 1 },
  video: { flex: 1 },
  loading: { position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' },
  message: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  notice: { fontFamily: Fonts.sans, fontSize: 14, color: Colors.textMuted, textAlign: 'center' },
});
