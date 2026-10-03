import { captionMetrics, captionLines, FREE_CAPTION_SIZE } from './caption-layout';
import { captionPlacement, isFreeCaption } from './stamp-caption';
import type { StampConfig } from '@/components/route-preview';

// caption-layout.test.ts와 같은 이유로 route-preview.tsx는 타입만 가져온다.
function config(overrides: Partial<StampConfig> = {}): StampConfig {
  return {
    mode: 'always',
    layout: 'glass',
    enabled: { distance: true, time: true, pace: true, heartRate: true, date: true, place: true },
    caption: '한강',
    placeName: '',
    position: { x: 0, y: 0 },
    scale: 1,
    ...overrides,
  };
}

describe('isFreeCaption', () => {
  it('treats saves without a caption offset as the older preset caption', () => {
    expect(isFreeCaption(config())).toBe(false);
  });

  it('is free once the caption has its own offset', () => {
    expect(isFreeCaption(config({ captionOffset: { x: 0, y: 0 } }))).toBe(true);
  });
});

describe('captionPlacement', () => {
  it('starts at the center with the base size', () => {
    expect(captionPlacement(config())).toEqual({ offset: { x: 0, y: 0 }, scale: 1 });
  });

  it('uses the saved offset and scale', () => {
    expect(captionPlacement(config({ captionOffset: { x: 3, y: 4 }, captionScale: 2 })))
      .toEqual({ offset: { x: 3, y: 4 }, scale: 2 });
  });
});

describe('captionMetrics for free captions', () => {
  it('ignores the running data preset and scale', () => {
    const glass = captionMetrics(config({ captionOffset: { x: 0, y: 0 }, captionScale: 1, scale: 2 }));
    const line = captionMetrics(config({ layout: 'line', captionOffset: { x: 0, y: 0 }, captionScale: 1 }));
    expect(glass.size).toBe(FREE_CAPTION_SIZE);
    expect(line).toEqual(glass);
  });

  it('sizes and wraps by the caption scale', () => {
    const text = '비 오는 날의 한강을 따라 천천히 달린 아침';
    const small = config({ caption: text, captionOffset: { x: 0, y: 0 }, captionScale: 1 });
    const big = { ...small, captionScale: 2 };
    expect(captionMetrics(big).size).toBeCloseTo(FREE_CAPTION_SIZE * 2);
    expect(captionLines(text, big).length).toBeGreaterThan(captionLines(text, small).length);
  });

  it('keeps the older preset metrics for saves without an offset', () => {
    expect(captionMetrics(config({ layout: 'line' })).size).toBeCloseTo(22 * 3.6);
  });
});
