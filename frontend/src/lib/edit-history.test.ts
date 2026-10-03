import { isCaptionOnlyChange, MAX_HISTORY, pushHistory, type EditSnapshot } from './edit-history';

function snapshot(overrides: Partial<EditSnapshot> = {}): EditSnapshot {
  return {
    backgroundImagePath: 'bg.jpg',
    preset: 'default-drawing',
    transform: { x: 0, y: 0, scale: 1, rotationDeg: 0 },
    smoothOptions: { smooth: 0, corner: 0 },
    stampConfig: {
      mode: 'always',
      layout: 'corner',
      enabled: { distance: true, time: true, pace: true, heartRate: true, date: true, place: true },
      caption: '',
      placeName: '',
      position: { x: 0, y: 0 },
      scale: 1,
    },
    ...overrides,
  };
}

describe('isCaptionOnlyChange', () => {
  it('is true when only the caption text changed', () => {
    const before = snapshot();
    const after = { ...before, stampConfig: { ...before.stampConfig, caption: '한강' } };
    expect(isCaptionOnlyChange(before, after)).toBe(true);
  });

  it('is false when the caption moved too', () => {
    const before = snapshot();
    const after = { ...before, stampConfig: { ...before.stampConfig, caption: '한강', captionOffset: { x: 0, y: 40 } } };
    expect(isCaptionOnlyChange(before, after)).toBe(false);
  });

  it('is false when something other than the running data changed', () => {
    const before = snapshot();
    expect(isCaptionOnlyChange(before, { ...before, preset: 'light-runner' })).toBe(false);
  });
});

describe('pushHistory', () => {
  it('keeps only the most recent steps', () => {
    let history: EditSnapshot[] = [];
    for (let i = 0; i < MAX_HISTORY + 5; i++) history = pushHistory(history, snapshot({ backgroundImagePath: `bg-${i}` }));
    expect(history).toHaveLength(MAX_HISTORY);
    expect(history[0].backgroundImagePath).toBe('bg-5');
    expect(history[history.length - 1].backgroundImagePath).toBe(`bg-${MAX_HISTORY + 4}`);
  });
});
