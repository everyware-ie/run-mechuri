import { freeCaptionLines, freeCaptionMetrics, FREE_CAPTION_SIZE, captionMetrics } from './caption-layout';
import { captionItems, isFreeCaption } from './stamp-caption';
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
  it('treats saves without a caption list as the older preset caption', () => {
    expect(isFreeCaption(config())).toBe(false);
  });

  it('is free once captions exist, even when empty', () => {
    expect(isFreeCaption(config({ captions: [] }))).toBe(true);
  });
});

describe('captionItems', () => {
  it('returns the caption list', () => {
    const captions = [{ id: 'a', text: '하나', offset: { x: 0, y: 0 }, scale: 1 }];
    expect(captionItems(config({ captions }))).toBe(captions);
  });

  it('reads the single-caption format used during development', () => {
    expect(captionItems(config({ captionOffset: { x: 3, y: 4 }, captionScale: 2 })))
      .toEqual([{ id: 'caption-0', text: '한강', offset: { x: 3, y: 4 }, scale: 2 }]);
  });

  it('has no free captions for the older preset caption', () => {
    expect(captionItems(config())).toEqual([]);
  });
});

describe('free caption metrics', () => {
  it('uses the base size regardless of the running data preset', () => {
    expect(freeCaptionMetrics(1).size).toBe(FREE_CAPTION_SIZE);
  });

  it('sizes and wraps by the caption scale', () => {
    const text = '비 오는 날의 한강을 따라 천천히 달린 아침';
    expect(freeCaptionMetrics(2).size).toBeCloseTo(FREE_CAPTION_SIZE * 2);
    expect(freeCaptionLines(text, 2).length).toBeGreaterThan(freeCaptionLines(text, 1).length);
  });

  it('keeps the older preset metrics for the older preset caption', () => {
    expect(captionMetrics(config({ layout: 'line' })).size).toBeCloseTo(22 * 3.6);
  });
});
