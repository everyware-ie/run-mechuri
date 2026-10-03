import type { StampConfig } from '@/components/route-preview';

// 스토리형 편집(2026-10-04): 문구는 러닝 데이터 프리셋과 상관없는 자유 문구다(result-editing §7,
// route-rendering §7-6). 화면 가운데에서 시작하고, 자리는 가운데로부터의 오프셋(캔버스 px)으로
// 저장한다. 인스타 스토리에서 글자를 넣을 때의 기본 자리와 같다.
//
// 그 전에 만든 결과물은 문구가 프리셋 배치 안에 들어 있다(오프셋이 없다). 보관함 썸네일은 그 모습
// 그대로 그리고, 다시 편집할 때 원래 자리 근처로 옮겨 자유 문구로 바꾼다(route-preview.tsx
// migrateLegacyCaption).

/** 자유 문구인지. 옛 저장분은 문구 오프셋이 없다. */
export function isFreeCaption(config: StampConfig) {
  return config.captionOffset !== undefined;
}

/** 자유 문구의 가운데로부터의 오프셋과 크기. */
export function captionPlacement(config: StampConfig) {
  return {
    offset: config.captionOffset ?? { x: 0, y: 0 },
    scale: config.captionScale ?? 1,
  };
}
