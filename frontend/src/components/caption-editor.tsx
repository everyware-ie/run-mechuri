import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { VerticalSlider } from '@/components/vertical-slider';
import { Colors, Fonts } from '@/constants/theme';
import { FREE_CAPTION_SIZE, freeCaptionLines, freeCaptionMetrics } from '@/lib/caption-layout';

// result-editing FRD §7: 문구는 인스타처럼 화면에서 바로 쓴다. 시트를 띄우지 않고 결과물과 같은
// 글꼴·크기로 가운데에서 쓴다. 왼쪽 세로 슬라이더로 크기를 바꾼다. 완료나 빈 곳을 누르면 끝난다.
// 실제 자리에 놓는 것은 편집 화면 몫이다. 화면을 어둡게 하지 않는다(2026-10-04 실기기 확인). 결과물
// 위에서 쓰는 느낌을 지키고, 글자는 그림자로 읽히게 한다.

type Props = {
  text: string;
  scale: number;
  /** 캔버스 px → 화면 pt. 미리보기와 같은 크기로 보여 준다. */
  fitScale: number;
  keyboardHeight: number;
  topInset: number;
  limited: boolean;
  onChangeText: (text: string) => void;
  onScaleChange: (scale: number) => void;
  onDone: () => void;
};

const SIZE_MIN = 100 / 3;
const SIZE_MAX = 300;

export function CaptionEditor({ text, scale, fitScale, keyboardHeight, topInset, limited, onChangeText, onScaleChange, onDone }: Props) {
  const size = FREE_CAPTION_SIZE * scale * fitScale;
  const lineHeight = size * 1.3;
  const width = freeCaptionMetrics(scale).width * fitScale;
  // 실기기 확인(2026-10-04): 크기 슬라이더를 움직이면 "위치가 먼저 움직이고 크기가 나중에 바뀐다".
  // 입력 칸 높이가 글자보다 한 프레임 늦게 따라와, 그 사이 가운데 정렬이 먼저 다시 맞춰졌다. 그래서
  // 높이를 결과물과 같은 줄바꿈 계산으로 미리 정하고, 칸의 가운데를 고정해 같은 순간에 함께 바뀌게
  // 한다. 입력 칸이 실제로 더 많은 줄을 쓰면 그 높이를 따른다.
  const [areaHeight, setAreaHeight] = useState(0);
  // 입력 칸이 잰 높이는 그 글자 크기에서만 믿는다. 크기를 줄이는 순간 예전 높이가 남아 칸이 한 번 더
  // 움직이지 않게 한다.
  const [content, setContent] = useState({ height: 0, size: 0 });
  const lineCount = Math.max(1, freeCaptionLines(text || ' ', scale).length);
  const inputHeight = Math.max(lineCount * lineHeight, content.size === size ? content.height : 0);
  return (
    <View style={styles.dim}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onDone} accessibilityRole="button" accessibilityLabel="문구 쓰기 마치기" />
      <View style={[styles.topBar, { top: topInset + 8 }]} pointerEvents="box-none">
        <Pressable onPress={onDone} hitSlop={12} accessibilityRole="button" accessibilityLabel="문구 완료">
          <Text style={styles.done}>완료</Text>
        </Pressable>
      </View>
      <View style={[styles.inputArea, { top: topInset + 56, bottom: keyboardHeight + 12 }]} pointerEvents="box-none"
        onLayout={(e) => setAreaHeight(e.nativeEvent.layout.height)}>
        <View style={[styles.inputBox, { top: Math.max(0, (areaHeight - inputHeight) / 2), width }]} pointerEvents="box-none">
        <TextInput
          value={text}
          onChangeText={onChangeText}
          autoFocus
          multiline
          scrollEnabled={false}
          submitBehavior="newline"
          placeholder="문구 입력"
          placeholderTextColor="rgba(255,243,236,0.45)"
          accessibilityLabel="문구, 최대 3줄"
          onContentSizeChange={(e) => setContent({ height: Math.ceil(e.nativeEvent.contentSize.height), size })}
          style={[styles.input, { width, height: inputHeight, fontSize: size, lineHeight }]}
        />
        {limited && <Text style={styles.note}>최대 3줄까지 쓸 수 있어요. 문구를 줄이거나 크기를 줄여 주세요.</Text>}
        </View>
      </View>
      <View style={[styles.slider, { top: topInset + 96, bottom: keyboardHeight + 48 }]}>
        <VerticalSlider value={Math.round(scale * 100)} minimumValue={SIZE_MIN} maximumValue={SIZE_MAX}
          accessibilityLabel="문구 크기" onChange={(v) => onScaleChange(v / 100)} onSlidingComplete={(v) => onScaleChange(v / 100)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // 빈 곳을 누르면 마치도록 화면 전체를 덮되 어둡게 하지 않는다.
  dim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  topBar: { position: 'absolute', right: 20, flexDirection: 'row' },
  done: { fontFamily: Fonts.sansBold, fontSize: 15, color: Colors.text, padding: 8 },
  inputArea: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  inputBox: { position: 'absolute', alignItems: 'center', gap: 10 },
  input: {
    fontFamily: 'NotoSansKR_700Bold', color: Colors.lineWarm, textAlign: 'center', padding: 0,
    textShadowColor: 'rgba(0,0,0,0.55)', textShadowRadius: 6, textShadowOffset: { width: 0, height: 0 },
  },
  note: { fontFamily: Fonts.sans, fontSize: 11, color: Colors.text, textAlign: 'center', paddingHorizontal: 24 },
  slider: { position: 'absolute', left: 12 },
});
