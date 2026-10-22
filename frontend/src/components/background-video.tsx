import { useVideoPlayer, VideoView } from 'expo-video';
import { StyleSheet, View } from 'react-native';

import type { PhotoBackground } from '@/lib/background-storage';
import { constrainPhotoCrop } from '@/lib/photo-crop';
import { freezesAtEnd } from '@/lib/video-rules';

// 배경 선택 FRD §5. 미리보기에서 배경 영상을 결과물과 같은 규칙으로 재생한다.
// 소리는 넣지 않고(§5-4), 다른 앱의 음악을 끊지 않게 섞어서 재생한다.
// 3초 미만은 반복하지 않고 마지막 장면에서 멈춘다(§5-2). expo-video는 끝나면 마지막 장면을 보여 준다.

type Props = { uri: string; durationSec?: number };

/** 부모를 꽉 채워 영상을 그린다. 크기와 위치는 부모가 정한다. */
export function BackgroundVideo({ uri, durationSec }: Props) {
  const player = useVideoPlayer(uri, p => {
    p.muted = true;
    p.audioMixingMode = 'mixWithOthers';
    p.loop = !freezesAtEnd(durationSec);
    p.play();
  });
  return (
    <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="fill" nativeControls={false}
      fullscreenOptions={{ enable: false }} allowsPictureInPicture={false} pointerEvents="none" />
  );
}

/** 확정한 구도대로 자른 배경 영상. 편집 화면처럼 구도를 만지지 않는 곳에 쓴다. */
export function CroppedBackgroundVideo({ video, width, height }: { video: PhotoBackground; width: number; height: number }) {
  const crop = constrainPhotoCrop(video.width, video.height, video.crop);
  const scale = Math.max(width / video.width, height / video.height) * crop.zoom;
  return (
    <View style={[StyleSheet.absoluteFill, styles.clip]} pointerEvents="none">
      <View style={{
        position: 'absolute',
        width: video.width * scale,
        height: video.height * scale,
        left: width / 2 - crop.centerX * video.width * scale,
        top: height / 2 - crop.centerY * video.height * scale,
      }}>
        <BackgroundVideo uri={video.sourceUri} durationSec={video.durationSec} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({ clip: { overflow: 'hidden' } });
