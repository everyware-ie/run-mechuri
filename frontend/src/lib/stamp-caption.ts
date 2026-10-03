import type { StampConfig } from '@/components/route-preview';

// 스토리형 편집(2026-10-04): 문구는 러닝 데이터와 따로 움직인다(result-editing §7).
// 둘이 같은 자리·크기면 "붙어 있다"고 보고 지금까지처럼 한 번에 배치한다. 글래스 카드
// 안의 문구처럼 프리셋이 정한 모습이 그대로 유지된다. 하나라도 옮기거나 키우면 떨어진
// 것으로 보고, 러닝 데이터는 문구 자리를 비우지 않고 다시 배치한다.

const SAME_POSITION_PX = 0.5;
const SAME_SCALE = 0.001;

/** 문구의 자리 오프셋과 크기. 옛 저장분은 러닝 데이터 값을 그대로 쓴다. */
export function captionPlacement(config: StampConfig) {
  return {
    offset: config.captionOffset ?? config.position,
    scale: config.captionScale ?? config.scale ?? 1,
  };
}

export function isCaptionAttached(config: StampConfig) {
  const { offset, scale } = captionPlacement(config);
  return Math.abs(offset.x - config.position.x) < SAME_POSITION_PX
    && Math.abs(offset.y - config.position.y) < SAME_POSITION_PX
    && Math.abs(scale - (config.scale ?? 1)) < SAME_SCALE;
}

/** 옛 저장분에 문구 자리·크기를 채운다. 러닝 데이터를 옮겨도 문구가 따라가지 않게 된다. */
export function withCaptionPlacement(config: StampConfig): StampConfig {
  const { offset, scale } = captionPlacement(config);
  return { ...config, captionOffset: offset, captionScale: scale };
}
