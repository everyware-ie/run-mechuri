import type { CaptionItem, StampConfig } from '@/components/route-preview';

// 스토리형 편집(2026-10-04): 문구는 인스타처럼 화면에 바로 쓰는 글자다(result-editing §7,
// route-rendering §7-6). 러닝 데이터 프리셋과 상관없고 여러 개 넣을 수 있다. 새 문구는 화면
// 가운데에서 시작하고, 자리는 가운데로부터의 오프셋(캔버스 px)으로 저장한다.
//
// 그 전에 만든 결과물은 문구 하나가 프리셋 배치 안에 들어 있다. 보관함 썸네일은 그 모습 그대로
// 그리고, 다시 편집할 때 원래 자리 근처의 문구로 바꾼다(route-preview.tsx migrateLegacyCaption).

/** 화면에 바로 쓰는 문구 형식인지. 아니면 옛 저장분이라 문구가 프리셋 안에 있다. */
export function isFreeCaption(config: StampConfig) {
  return config.captions !== undefined || config.captionOffset !== undefined;
}

/** 문구 목록. 나중에 넣은 것이 위에 그려진다. 개발 중 쓰던 문구 하나짜리 형식도 읽는다. */
export function captionItems(config: StampConfig): CaptionItem[] {
  if (config.captions) return config.captions;
  if (config.captionOffset === undefined || !(config.caption ?? '').trim()) return [];
  return [{ id: 'caption-0', text: config.caption, offset: config.captionOffset, scale: config.captionScale ?? 1 }];
}

export function newCaptionId() {
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
