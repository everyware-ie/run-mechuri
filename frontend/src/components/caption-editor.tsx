import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { VerticalSlider } from '@/components/vertical-slider';
import { Colors, Fonts } from '@/constants/theme';
import { FREE_CAPTION_SIZE, freeCaptionLines, freeCaptionMetrics } from '@/lib/caption-layout';

// result-editing FRD §7: 문구는 인스타처럼 화면에서 바로 쓴다. 시트를 띄우지 않고 결과물과 같은
// 글꼴·크기로 가운데에서 쓴다. 왼쪽 세로 슬라이더로 크기를 바꾼다. 완료나 빈 곳을 누르면 끝난다.
// 실제 자리에 놓는 것은 편집 화면 몫이다. 화면을 어둡게 하지 않는다(2026-10-04 실기기 확인). 결과물
// 위에서 쓰는 느낌을 지키고, 글자는 그림자로 읽히게 한다.
//
// 크기는 입력 칸의 글자 크기가 아니라 칸 전체를 줄이는 변형(transform)으로 보여 준다. React Native의
// iOS 입력 칸은 한국어 키보드를 쓰는 동안 글자 크기 변경을 이미 쓴 글자에 다시 적용하지 않는다(한글
// 조합이 깨지지 않게 글자만 비교한다. RCTTextInputComponentView.mm `_textOf:equals:`). 그래서 슬라이더를
// 움직이는 동안 칸만 커지고 글자는 그대로였다(2026-10-04 실기기 확인). 글자 크기는 가장 큰 크기로
// 고정하고 줄이기만 해서 흐려지지 않게 한다. 칸 너비는 거꾸로 맞춰 줄바꿈이 결과물과 같은 자리에서
// 일어나게 한다.

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
  onInteractionChange: (interacting: boolean) => void;
  onDone: () => void;
};

const SIZE_MIN = 100 / 3;
const SIZE_MAX = 300;
/** 입력 칸의 글자는 이 배율로 그리고 화면에서는 줄인다. */
const BASE_SCALE = SIZE_MAX / 100;

export function CaptionEditor({ text, scale, fitScale, keyboardHeight, topInset, limited, onChangeText, onScaleChange, onInteractionChange, onDone }: Props) {
  const [area, setArea] = useState({ width: 0, height: 0 });
  // 입력 칸이 잰 높이는 그 너비에서만 믿는다.
  const [content, setContent] = useState({ height: 0, width: 0 });
  // FRD §2-1: 입력을 닫거나 조작이 중단돼도 미리보기를 멈춘 채로 남기지 않는다.
  useEffect(() => () => onInteractionChange(false), [onInteractionChange]);

  const shrink = scale / BASE_SCALE;
  const fontSize = FREE_CAPTION_SIZE * BASE_SCALE * fitScale;
  const lineHeight = fontSize * 1.3;
  // 화면에 보이는 너비는 결과물의 줄바꿈 폭이다. 줄이기 전 너비는 그만큼 넓힌다.
  const layoutWidth = (freeCaptionMetrics(scale).width * fitScale) / shrink;
  const lineCount = Math.max(1, freeCaptionLines(text || ' ', scale).length);
  const layoutHeight = Math.max(lineCount * lineHeight, content.width === layoutWidth ? content.height : 0);

  return (
    <View style={styles.cover}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onDone} accessibilityRole="button" accessibilityLabel="문구 쓰기 마치기" />
      <View style={[styles.topBar, { top: topInset + 8 }]} pointerEvents="box-none">
        <Pressable onPress={onDone} hitSlop={12} accessibilityRole="button" accessibilityLabel="문구 완료">
          <Text style={styles.done}>완료</Text>
        </Pressable>
      </View>
      <View style={[styles.inputArea, { top: topInset + 56, bottom: keyboardHeight + 12 }]} pointerEvents="box-none"
        onLayout={(e) => setArea({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}>
        {area.width > 0 && <TextInput
          value={text}
          onChangeText={onChangeText}
          autoFocus
          multiline
          scrollEnabled={false}
          submitBehavior="newline"
          placeholder="문구 입력"
          placeholderTextColor="rgba(255,243,236,0.45)"
          accessibilityLabel="문구, 최대 3줄"
          onContentSizeChange={(e) => setContent({ height: Math.ceil(e.nativeEvent.contentSize.height), width: layoutWidth })}
          style={[styles.input, {
            width: layoutWidth,
            height: layoutHeight,
            left: (area.width - layoutWidth) / 2,
            top: (area.height - layoutHeight) / 2,
            fontSize,
            lineHeight,
            textShadowRadius: 6 * BASE_SCALE,
            transform: [{ scale: shrink }],
          }]}
        />}
        {limited && <Text style={[styles.note, { top: area.height / 2 + (layoutHeight * shrink) / 2 + 10 }]}>
          최대 3줄까지 쓸 수 있어요. 문구를 줄이거나 크기를 줄여 주세요.
        </Text>}
      </View>
      <View style={[styles.slider, { top: topInset + 96, bottom: keyboardHeight + 48 }]}>
        <VerticalSlider value={Math.round(scale * 100)} minimumValue={SIZE_MIN} maximumValue={SIZE_MAX}
          accessibilityLabel="문구 크기" onSlidingStart={() => onInteractionChange(true)}
          onChange={(v) => onScaleChange(v / 100)} onSlidingComplete={(v) => {
            onScaleChange(v / 100);
            onInteractionChange(false);
          }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // 빈 곳을 누르면 마치도록 화면 전체를 덮되 어둡게 하지 않는다.
  cover: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  topBar: { position: 'absolute', right: 20, flexDirection: 'row' },
  done: { fontFamily: Fonts.sansBold, fontSize: 15, color: Colors.text, padding: 8 },
  inputArea: { position: 'absolute', left: 0, right: 0 },
  input: {
    position: 'absolute', padding: 0,
    fontFamily: 'NotoSansKR_700Bold', color: Colors.lineWarm, textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.55)', textShadowOffset: { width: 0, height: 0 },
  },
  note: { position: 'absolute', left: 24, right: 24, fontFamily: Fonts.sans, fontSize: 11, color: Colors.text, textAlign: 'center' },
  slider: { position: 'absolute', left: 12 },
});
