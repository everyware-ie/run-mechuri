import { captionMetrics } from './caption-layout';
import { captionPlacement, isCaptionAttached, withCaptionPlacement } from './stamp-caption';
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

describe('captionPlacement', () => {
  it('falls back to the running data position and scale for older saves', () => {
    expect(captionPlacement(config({ position: { x: 12, y: -40 }, scale: 1.5 })))
      .toEqual({ offset: { x: 12, y: -40 }, scale: 1.5 });
  });

  it('uses the caption values once they exist', () => {
    expect(captionPlacement(config({ captionOffset: { x: 3, y: 4 }, captionScale: 2 })))
      .toEqual({ offset: { x: 3, y: 4 }, scale: 2 });
  });
});

describe('isCaptionAttached', () => {
  it('treats older saves as attached so their layout does not change', () => {
    expect(isCaptionAttached(config({ position: { x: 30, y: 30 }, scale: 1.2 }))).toBe(true);
  });

  it('is attached at the default placement', () => {
    expect(isCaptionAttached(config({ captionOffset: { x: 0, y: 0 }, captionScale: 1 }))).toBe(true);
  });

  it('detaches when only the running data moves', () => {
    expect(isCaptionAttached(config({ position: { x: 0, y: -200 }, captionOffset: { x: 0, y: 0 }, captionScale: 1 })))
      .toBe(false);
  });

  it('detaches when only the caption is resized', () => {
    expect(isCaptionAttached(config({ captionOffset: { x: 0, y: 0 }, captionScale: 1.4 }))).toBe(false);
  });
});

describe('withCaptionPlacement', () => {
  it('freezes the caption where it was so moving the running data leaves it in place', () => {
    const fixed = withCaptionPlacement(config({ position: { x: 10, y: 20 }, scale: 1.3 }));
    expect(fixed.captionOffset).toEqual({ x: 10, y: 20 });
    expect(fixed.captionScale).toBe(1.3);
    expect(isCaptionAttached({ ...fixed, position: { x: 10, y: 400 } })).toBe(false);
  });
});

describe('captionMetrics', () => {
  it('sizes the caption by its own scale, not the running data scale', () => {
    const base = captionMetrics(config({ captionScale: 1 }));
    const bigCaption = captionMetrics(config({ captionScale: 2, scale: 1 }));
    expect(bigCaption.size).toBeCloseTo(base.size * 2);
  });
});
